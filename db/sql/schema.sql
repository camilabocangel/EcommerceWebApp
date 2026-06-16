-- ============================================================================
-- schema.sql — Módulo transaccional (PostgreSQL) del e-commerce
-- Aplica: extensiones, tablas en 3NF, índices, cifrado (pgcrypto), RBAC (roles),
-- RLS (aislamiento por cliente) y funciones procesar_pago / descifrar_token.
--
-- Se aplica con psql pasando las contraseñas de los roles como variables:
--   psql ... -v cliente_pwd='...' -v vendedor_pwd='...' -v admin_pwd='...'
-- Re-ejecutable (idempotente).
-- ============================================================================

-- ---- Extensiones ----
CREATE EXTENSION IF NOT EXISTS pgcrypto;   -- gen_random_uuid() + pgp_sym_encrypt/decrypt

-- ============================================================================
-- TABLAS (todas en 3NF)
-- ============================================================================

-- clientes
-- 3NF: PK atómica (id). Cada atributo (nombre, email, password_hash, rol,
-- fecha_registro) depende ÚNICA y directamente de la PK; no hay grupos repetidos
-- ni dependencias transitivas (p. ej. la dirección se separa en su propia tabla).
CREATE TABLE IF NOT EXISTS clientes (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nombre         TEXT NOT NULL,
    email          TEXT NOT NULL UNIQUE,
    password_hash  TEXT NOT NULL,
    rol            TEXT NOT NULL DEFAULT 'cliente'
                   CHECK (rol IN ('cliente', 'vendedor', 'admin')),
    fecha_registro TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- direcciones
-- 3NF: un cliente puede tener varias direcciones → se modela 1:N en tabla aparte
-- (evita columnas repetidas/multivaluadas en `clientes`). Cada columna depende de
-- la PK `id`; `cliente_id` es FK, no genera dependencia transitiva.
CREATE TABLE IF NOT EXISTS direcciones (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cliente_id    UUID NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
    calle         TEXT NOT NULL,
    ciudad        TEXT NOT NULL,
    pais          TEXT NOT NULL,
    codigo_postal TEXT NOT NULL
);

-- pedidos
-- 3NF: atributos atómicos dependientes de la PK. `total` es un valor agregado
-- (suma de los items) que se materializa en la transacción de pago; no introduce
-- dependencia transitiva entre columnas no-clave.
CREATE TABLE IF NOT EXISTS pedidos (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cliente_id UUID NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
    fecha      TIMESTAMPTZ NOT NULL DEFAULT now(),
    estado     TEXT NOT NULL DEFAULT 'pendiente'
               CHECK (estado IN ('pendiente', 'pagado', 'enviado', 'cancelado', 'revision')),
    total      NUMERIC(10,2) NOT NULL DEFAULT 0
);

-- Asegura el estado 'revision' (saga) también en bases ya creadas (idempotente)
ALTER TABLE pedidos DROP CONSTRAINT IF EXISTS pedidos_estado_check;
ALTER TABLE pedidos ADD  CONSTRAINT pedidos_estado_check
    CHECK (estado IN ('pendiente', 'pagado', 'enviado', 'cancelado', 'revision'));

-- pedido_items
-- 3NF: PK atómica (id). Se guardan SNAPSHOTS (nombre_snapshot, precio_unitario)
-- del producto al momento de la compra para no depender transitivamente del
-- catálogo (que vive en MongoDB y puede cambiar). `subtotal` es una columna
-- GENERADA (precio_unitario*cantidad), por lo que no es un dato redundante editable.
-- `producto_uuid` es el ENLACE LÓGICO al uuid del producto en MongoDB.
CREATE TABLE IF NOT EXISTS pedido_items (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pedido_id       UUID NOT NULL REFERENCES pedidos(id) ON DELETE CASCADE,
    producto_uuid   UUID NOT NULL,                       -- enlace lógico → MongoDB
    nombre_snapshot TEXT NOT NULL,
    precio_unitario NUMERIC(10,2) NOT NULL CHECK (precio_unitario >= 0),
    cantidad        INTEGER NOT NULL CHECK (cantidad > 0),
    subtotal        NUMERIC(10,2) GENERATED ALWAYS AS (precio_unitario * cantidad) STORED
);

-- pagos
-- 3NF: cada columna depende de la PK del pago. Por PCI NUNCA se guarda el PAN
-- completo ni el CVC: solo `ultimos4` en claro y `token_tarjeta` CIFRADO (bytea).
CREATE TABLE IF NOT EXISTS pagos (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pedido_id     UUID NOT NULL REFERENCES pedidos(id) ON DELETE CASCADE,
    metodo        TEXT NOT NULL CHECK (metodo IN ('tarjeta', 'paypal')),
    monto         NUMERIC(10,2) NOT NULL CHECK (monto >= 0),
    estado        TEXT NOT NULL DEFAULT 'aprobado'
                  CHECK (estado IN ('pendiente', 'aprobado', 'rechazado')),
    token_tarjeta BYTEA,            -- token CIFRADO con pgp_sym_encrypt (NULL si no es tarjeta)
    ultimos4      CHAR(4),          -- últimos 4 dígitos en claro (NULL si no es tarjeta)
    fecha         TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- facturas
-- 3NF: relación 1:1 con pedido (pedido_id UNIQUE). subtotal/impuestos/total son
-- montos del documento fiscal; total = subtotal + impuestos se fija al emitir.
-- NOTA (auditoría ítem 1): `total` (y `subtotal`) se almacenan como SNAPSHOT
-- INTENCIONAL del documento fiscal en el momento de emisión. Aunque sea un valor
-- derivable (subtotal + impuestos), una factura es un comprobante inmutable: debe
-- conservar los importes tal cual se emitieron, independientes de cambios futuros.
-- Por eso NO se modela como columna GENERATED.
CREATE TABLE IF NOT EXISTS facturas (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pedido_id     UUID NOT NULL UNIQUE REFERENCES pedidos(id) ON DELETE CASCADE,
    numero        TEXT NOT NULL UNIQUE,
    fecha_emision TIMESTAMPTZ NOT NULL DEFAULT now(),
    subtotal      NUMERIC(10,2) NOT NULL,
    impuestos     NUMERIC(10,2) NOT NULL DEFAULT 0,
    total         NUMERIC(10,2) NOT NULL
);

-- incidentes_stock
-- Registro de incidentes de la SAGA de checkout: si Postgres confirma el pago pero
-- la actualización de stock en MongoDB falla, se registra aquí y el pedido se marca
-- en estado 'revision' para compensación/revisión manual.
CREATE TABLE IF NOT EXISTS incidentes_stock (
    id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pedido_id UUID NOT NULL REFERENCES pedidos(id) ON DELETE CASCADE,
    detalle   TEXT NOT NULL,
    fecha     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---- Índices razonables (las PK y UNIQUE ya generan índice) ----
CREATE INDEX IF NOT EXISTS idx_direcciones_cliente   ON direcciones(cliente_id);
CREATE INDEX IF NOT EXISTS idx_pedidos_cliente        ON pedidos(cliente_id);
CREATE INDEX IF NOT EXISTS idx_pedidos_estado         ON pedidos(estado);
CREATE INDEX IF NOT EXISTS idx_pedido_items_pedido    ON pedido_items(pedido_id);
CREATE INDEX IF NOT EXISTS idx_pedido_items_producto  ON pedido_items(producto_uuid);
CREATE INDEX IF NOT EXISTS idx_pagos_pedido           ON pagos(pedido_id);

-- ============================================================================
-- FUNCIÓN: descifrar_token (solo rol autorizado)
-- SECURITY INVOKER: corre con los privilegios de QUIEN la llama, por lo que el
-- control de columnas (GRANT) decide si puede leer `token_tarjeta`. Solo se
-- otorga EXECUTE a app_admin.
-- ============================================================================
CREATE OR REPLACE FUNCTION descifrar_token(p_pago_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_token BYTEA;
    v_key   TEXT;
BEGIN
    v_key := current_setting('app.crypto_key', true);
    IF v_key IS NULL OR v_key = '' THEN
        RAISE EXCEPTION 'No se configuró app.crypto_key en la sesión';
    END IF;
    SELECT token_tarjeta INTO v_token FROM pagos WHERE id = p_pago_id;
    IF v_token IS NULL THEN
        RETURN NULL;
    END IF;
    RETURN pgp_sym_decrypt(v_token, v_key);
END;
$$;

-- ============================================================================
-- FUNCIÓN: procesar_pago (transacción ACID)
-- Ejecuta atómicamente: crear pedido → insertar items → registrar pago →
-- generar factura. El cuerpo de una función PL/pgSQL corre como UNA unidad
-- atómica dentro de la transacción del llamador: cualquier excepción no
-- controlada revierte (ROLLBACK) TODO lo realizado. El bloque EXCEPTION re-lanza
-- el error para dejar explícito el rollback total.
-- SECURITY DEFINER: corre como el dueño del esquema, de modo que app_cliente solo
-- necesita EXECUTE (no INSERT directo en facturas, etc.).
-- ============================================================================
CREATE OR REPLACE FUNCTION procesar_pago(
    p_cliente_id UUID,
    p_items      JSONB,
    p_metodo     TEXT,
    p_token      TEXT,
    p_ultimos4   TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_pedido_id  UUID;
    v_factura_id UUID;
    v_total      NUMERIC(10,2) := 0;
    v_impuestos  NUMERIC(10,2);
    v_item       JSONB;
    v_key        TEXT;
    v_token_enc  BYTEA;
    v_numero     TEXT;
BEGIN
    -- Validaciones de entrada
    IF p_cliente_id IS NULL THEN
        RAISE EXCEPTION 'cliente_id es obligatorio';
    END IF;
    IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
        RAISE EXCEPTION 'El pedido debe tener al menos un item';
    END IF;
    IF p_metodo NOT IN ('tarjeta', 'paypal') THEN
        RAISE EXCEPTION 'Método de pago inválido: %', p_metodo;
    END IF;

    -- 1) Crear el pedido (total provisional 0)
    INSERT INTO pedidos (cliente_id, estado, total)
    VALUES (p_cliente_id, 'pagado', 0)
    RETURNING id INTO v_pedido_id;

    -- 2) Insertar items y acumular total
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        IF (v_item->>'cantidad')::INT <= 0 THEN
            RAISE EXCEPTION 'Cantidad inválida (%) para producto %',
                v_item->>'cantidad', v_item->>'producto_uuid';
        END IF;

        INSERT INTO pedido_items
            (pedido_id, producto_uuid, nombre_snapshot, precio_unitario, cantidad)
        VALUES (
            v_pedido_id,
            (v_item->>'producto_uuid')::UUID,
            v_item->>'nombre_snapshot',
            (v_item->>'precio_unitario')::NUMERIC,
            (v_item->>'cantidad')::INT
        );

        v_total := v_total
                 + (v_item->>'precio_unitario')::NUMERIC * (v_item->>'cantidad')::INT;
    END LOOP;

    -- Actualizar total del pedido
    UPDATE pedidos SET total = v_total WHERE id = v_pedido_id;

    -- 3) Registrar el pago (cifrar token solo si es tarjeta)
    IF p_metodo = 'tarjeta' THEN
        v_key := current_setting('app.crypto_key', true);
        IF v_key IS NULL OR v_key = '' THEN
            RAISE EXCEPTION 'Falta app.crypto_key para cifrar el token de tarjeta';
        END IF;
        v_token_enc := pgp_sym_encrypt(p_token, v_key);
    ELSE
        v_token_enc := NULL;
    END IF;

    INSERT INTO pagos (pedido_id, metodo, monto, estado, token_tarjeta, ultimos4)
    VALUES (
        v_pedido_id, p_metodo, v_total, 'aprobado',
        v_token_enc,
        CASE WHEN p_metodo = 'tarjeta' THEN p_ultimos4 ELSE NULL END
    );

    -- 4) Generar la factura (impuestos 13% de ejemplo)
    v_impuestos := round(v_total * 0.13, 2);
    v_numero := 'F-' || to_char(now(), 'YYYYMMDDHH24MISS') || '-' || substr(v_pedido_id::TEXT, 1, 8);

    INSERT INTO facturas (pedido_id, numero, subtotal, impuestos, total)
    VALUES (v_pedido_id, v_numero, v_total, v_impuestos, v_total + v_impuestos)
    RETURNING id INTO v_factura_id;

    RETURN jsonb_build_object(
        'pedido_id',      v_pedido_id,
        'factura_id',     v_factura_id,
        'numero_factura', v_numero,
        'subtotal',       v_total,
        'impuestos',      v_impuestos,
        'total',          v_total + v_impuestos
    );

EXCEPTION
    WHEN OTHERS THEN
        -- Re-lanza el error → la transacción revierte TODO (pedido, items, pago, factura)
        RAISE;
END;
$$;

-- ============================================================================
-- RBAC — Roles y permisos diferenciados
-- ============================================================================

-- Crear roles de forma idempotente y (re)asignar contraseña desde variables psql
DO $$ BEGIN
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'app_cliente') THEN
        CREATE ROLE app_cliente LOGIN;
    END IF;
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'app_vendedor') THEN
        CREATE ROLE app_vendedor LOGIN;
    END IF;
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'app_admin') THEN
        CREATE ROLE app_admin LOGIN;
    END IF;
END $$;

ALTER ROLE app_cliente  WITH LOGIN PASSWORD :'cliente_pwd';
ALTER ROLE app_vendedor WITH LOGIN PASSWORD :'vendedor_pwd' BYPASSRLS;  -- ve todos los pedidos
ALTER ROLE app_admin    WITH LOGIN PASSWORD :'admin_pwd'    BYPASSRLS;  -- acceso total

-- Acceso al esquema
GRANT USAGE ON SCHEMA public TO app_cliente, app_vendedor, app_admin;

-- ---- app_admin: acceso total ----
GRANT ALL PRIVILEGES ON ALL TABLES    IN SCHEMA public TO app_admin;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO app_admin;
GRANT EXECUTE ON FUNCTION procesar_pago(UUID, JSONB, TEXT, TEXT, TEXT) TO app_admin;
GRANT EXECUTE ON FUNCTION descifrar_token(UUID) TO app_admin;   -- SOLO admin descifra

-- ---- app_vendedor: SELECT de pedidos + UPDATE de estado; SIN ver token ----
GRANT SELECT ON pedidos, pedido_items, facturas, clientes, direcciones TO app_vendedor;
GRANT UPDATE (estado) ON pedidos TO app_vendedor;
-- Acceso a pagos por columnas, EXCLUYENDO token_tarjeta:
GRANT SELECT (id, pedido_id, metodo, monto, estado, ultimos4, fecha) ON pagos TO app_vendedor;

-- ---- app_cliente: SELECT/INSERT en sus pedidos/pagos; SIN ver token ----
GRANT SELECT, INSERT ON pedidos, pedido_items TO app_cliente;
GRANT SELECT, INSERT ON facturas TO app_cliente;
GRANT SELECT ON clientes TO app_cliente;
-- pagos por columnas (sin token_tarjeta) tanto para leer como para insertar:
GRANT SELECT (id, pedido_id, metodo, monto, estado, ultimos4, fecha) ON pagos TO app_cliente;
GRANT INSERT (pedido_id, metodo, monto, estado, ultimos4)            ON pagos TO app_cliente;
-- el cliente paga SOLO a través de la función controlada:
GRANT EXECUTE ON FUNCTION procesar_pago(UUID, JSONB, TEXT, TEXT, TEXT) TO app_cliente;

-- ============================================================================
-- RLS — Aislamiento por cliente (app_cliente solo ve SUS datos)
-- La sesión debe fijar app.current_cliente con el UUID del cliente autenticado.
-- app_admin y app_vendedor tienen BYPASSRLS (ven todo).
-- ============================================================================
ALTER TABLE pedidos ENABLE ROW LEVEL SECURITY;
ALTER TABLE pagos   ENABLE ROW LEVEL SECURITY;

-- NULLIF(...,'') evita el error de cast cuando el GUC está ausente/vacío:
-- en ese caso devuelve NULL → la comparación no coincide con ninguna fila.
DROP POLICY IF EXISTS pedidos_propios ON pedidos;
CREATE POLICY pedidos_propios ON pedidos
    USING (cliente_id = NULLIF(current_setting('app.current_cliente', true), '')::UUID)
    WITH CHECK (cliente_id = NULLIF(current_setting('app.current_cliente', true), '')::UUID);

DROP POLICY IF EXISTS pagos_propios ON pagos;
CREATE POLICY pagos_propios ON pagos
    USING (EXISTS (
        SELECT 1 FROM pedidos p
        WHERE p.id = pagos.pedido_id
          AND p.cliente_id = NULLIF(current_setting('app.current_cliente', true), '')::UUID
    ));

-- ----------------------------------------------------------------------------
-- Fix hallazgo 4b — cerrar el aislamiento por cliente en las tablas restantes.
-- login/register usan el pool DUEÑO (owner) que IGNORA RLS, y procesar_pago() es
-- SECURITY DEFINER (corre como owner) → estos cambios NO afectan auth ni el pago.
-- ----------------------------------------------------------------------------

-- clientes: ocultar password_hash a app_cliente y aislar la fila propia
REVOKE SELECT ON clientes FROM app_cliente;
GRANT SELECT (id, nombre, email, rol, fecha_registro) ON clientes TO app_cliente;

ALTER TABLE clientes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS clientes_propio ON clientes;
CREATE POLICY clientes_propio ON clientes
    USING (id = NULLIF(current_setting('app.current_cliente', true), '')::UUID);

-- pedido_items: RLS vía JOIN a pedidos (solo los de pedidos del cliente actual)
ALTER TABLE pedido_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS items_propios ON pedido_items;
CREATE POLICY items_propios ON pedido_items
    USING (EXISTS (
        SELECT 1 FROM pedidos p
        WHERE p.id = pedido_items.pedido_id
          AND p.cliente_id = NULLIF(current_setting('app.current_cliente', true), '')::UUID
    ));

-- facturas: RLS vía JOIN a pedidos
ALTER TABLE facturas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS facturas_propias ON facturas;
CREATE POLICY facturas_propias ON facturas
    USING (EXISTS (
        SELECT 1 FROM pedidos p
        WHERE p.id = facturas.pedido_id
          AND p.cliente_id = NULLIF(current_setting('app.current_cliente', true), '')::UUID
    ));
