# Auditoría estricta del proyecto vs. requisitos de la práctica

> Verificación basada en **código real** (archivo:línea) y **pruebas en vivo** (salida
> pegada), no en resúmenes previos. Fecha: 2026-06-16.
> Entorno confirmado arriba: `ecommerce_postgres` (healthy, 5432), `ecommerce_mongo`
> (healthy, host 27018), `node server.js` respondiendo `GET /api/products → HTTP 200`.

Leyenda: ✅ cumplido · ⚠️ parcial · ❌ falta.

---

## MÓDULO 1 — Relacional (PostgreSQL)

### 1. 3NF — ✅ (con nota)
Tablas en [db/sql/schema.sql](../db/sql/schema.sql): `clientes` (22-30), `direcciones`
(36-43), `pedidos` (49-56), `pedido_items` (69-77), `pagos` (82-92), `facturas`
(97-105), `incidentes_stock` (111-116).
- Columnas **atómicas**, PK UUID, FKs explícitas; las direcciones se separan 1:N
  (evita grupos repetidos en `clientes`).
- Sin dependencias transitivas: los snapshots `nombre_snapshot`/`precio_unitario`
  ([schema.sql:73-74](../db/sql/schema.sql#L73)) desacoplan del catálogo; `subtotal`
  es **GENERATED ALWAYS AS (precio_unitario*cantidad) STORED** ([schema.sql:76](../db/sql/schema.sql#L76)).
- **Nota crítica:** `pedidos.total` (55) y `facturas.total/subtotal` (102-104) son
  agregados **almacenados** (no GENERATED). Son snapshots fiscales aceptables, pero
  estrictamente son datos derivados; se materializan en `procesar_pago`. No rompe 3NF
  (no hay dependencia entre atributos no clave) pero conviene documentarlo.

### 2. ACID en pagos — ✅
Función `procesar_pago()` ([schema.sql:164-267](../db/sql/schema.sql#L164)): crea
pedido → items → pago → factura; `EXCEPTION WHEN OTHERS THEN RAISE` (262-265) revierte
todo. Prueba en vivo (`node scripts/verificar_postgres.js`):
```
1) PAGO EXITOSO → pedido 86e418a5, factura F-20260616000410, total 362.73 (pedido+items+pago+factura creados)
2) PAGO QUE FALLA (cantidad -5) → Excepción esperada
   conteos antes : { pedidos: 6, items: 12, pagos: 6, facturas: 6 }
   conteos despues: { pedidos: 6, items: 12, pagos: 6, facturas: 6 }   → ROLLBACK OK (0 filas)
```

### 3. Cifrado de tarjeta — ✅
`pgcrypto` ([schema.sql:12](../db/sql/schema.sql#L12)); en `pagos` solo `ultimos4` en
claro y `token_tarjeta BYTEA` cifrado ([schema.sql:89-90](../db/sql/schema.sql#L89));
cifrado con `pgp_sym_encrypt` ([schema.sql:233](../db/sql/schema.sql#L233)). Fila real:
```
 metodo  | ultimos4 | tipo  | bytes |          contenido_hex
 tarjeta | 1111     | bytea |    82 | c30d0407030210255484bad1a53775d2...   (cabecera PGP, NO es el PAN)
```
No se guarda PAN completo ni CVC. Descifrado solo vía `descifrar_token()`
([schema.sql:132-152](../db/sql/schema.sql#L132)).

### 4. RBAC (roles, grants, demo token) — ✅
Roles en vivo:
```
 rolname      | login | bypassrls
 app_admin    | t     | t
 app_cliente  | t     | f
 app_vendedor | t     | t
```
GRANT por columna: **solo `app_admin`** tiene privilegios sobre `token_tarjeta`
(SELECT/INSERT/UPDATE/REFERENCES); `app_cliente` y `app_vendedor` NO. Demo en vivo:
```
app_cliente lee columnas permitidas → { id, metodo, ultimos4 }
app_cliente NO puede leer token → permission denied for table pagos
app_admin lee token cifrado (bytes) → 82
app_admin descifra token → 4111111111111111 (últimos4 = 1111)
```
Definido en [schema.sql:293-313](../db/sql/schema.sql#L293).

### 4b. Aislamiento por cliente (RLS) — ✅ CORREGIDO (2026-06-16)
Se cerró el hallazgo: ahora hay RLS en `clientes`, `pedido_items` y `facturas` además de
`pedidos`/`pagos`, y se quitó `password_hash` del grant de `app_cliente`
([schema.sql](../db/sql/schema.sql): `REVOKE`/`GRANT (columnas)` + políticas
`clientes_propio`, `items_propios`, `facturas_propias`).

RLS habilitada (en vivo): `clientes=true, facturas=true, pagos=true, pedido_items=true,
pedidos=true`.

Prueba en vivo, `app_cliente` **SIN** fijar `app.current_cliente` (antes 4/14/7 → ahora 0):
```
 tabla        | count
 clientes     |   0
 pedido_items |   0
 facturas     |   0
 pedidos      |   0
 pagos        |   0
SELECT password_hash FROM clientes  →  ERROR: permission denied for table clientes
```
Prueba en vivo **fijando** `app.current_cliente` = UUID de Ana (solo ve lo suyo):
```
 clientes=1, pedidos=3, pedido_items=6, facturas=3
 SELECT id,nombre,email FROM clientes → solo 'Ana Cliente' (1 fila)
```
No se rompió nada: `procesar_pago` (SECURITY DEFINER) sigue insertando y los scripts
`verificar_postgres.js` y `verificar_integracion.js` siguen verdes (ver ítems 2 y 12).

### 5. Anti SQL-injection — ✅
Todas las consultas Node usan placeholders `$1,$2…` (PG) u operadores/filtros (Mongo).
`grep` de concatenación en `api.js`, `db/*.js`, `services/*.js`: los únicos `${}`
aparecen en **mensajes de error**, la **URI de Mongo** (con `encodeURIComponent`,
[db/mongo.js:14-16](../db/mongo.js#L14)) y `nombre_snapshot` (un **valor** que viaja en
JSONB, no texto SQL, [services/checkout.js:60](../services/checkout.js#L60)). Ejemplos
parametrizados: [services/checkout.js:19](../services/checkout.js#L19),
[services/auth.js:25](../services/auth.js#L25), [db/pagos.js:18](../db/pagos.js#L18),
[db/postgres.js:71](../db/postgres.js#L71). Cero concatenación de entradas en SQL.

---

## MÓDULO 2 — NoSQL (MongoDB)

### 6. Esquema dinámico BSON — ✅
Documentos de `productos` con `atributos` distintos por tipo (en vivo):
```
[skate]   Nike SB Dunk Low London → {soporte_tobillo:"medio", durabilidad:"alta", tipo_suela:"vulcanizada"}
[running] Nathan Bell x Zoom Fly  → {drop_mm:8, amortiguacion:"alta", superficie:"asfalto"}
[formal]  Reebok Classic Leather  → {material_suela:"goma", material_upper:"cuero", acolchado:"bajo"}
```
Generado en [scripts/migrar_a_mongo.js](../scripts/migrar_a_mongo.js) (`atributosPorTipo`).

### 7. `$gt` / `$lt` / `$and` / `$or` — ✅
```
query = {$and:[{precio:{$gt:100}},{precio:{$lt:200}},{$or:[{destacado:true},{year:{$gte:2023}}]}]}
count = 17  (no vacío)  ej.: Tenis Speedcat OG $119/2024, Run Star Hike $119/2019, Yeezy Foam $129/2022
```

### 8. Arreglos `$in` / `$elemMatch` — ✅
```
$in etiquetas [marca:nike, marca:adidas] → 8
$in industria [deportivo]                → 9
$elemMatch variantes {talla:42, stock:{$gt:0}} → 24   ej. variantes=[{talla:40,stock:1},{41,1},{42,1}]
```

### 9. Vistas MongoDB — ✅
Creadas en [scripts/migrar_a_mongo.js](../scripts/migrar_a_mongo.js) (`crearVistas`). En vivo:
```
vista_ofertas          count=4
vista_skate            count=1
vista_reporte_premium  count=17
```

### 10. Categorías del PDF (ropa/electrónica/muebles/adornos/cocina) — ⚠️ PARCIAL (honesto)
El catálogo es **exclusivamente calzado** (24 zapatillas reales migradas desde
`shoes.db`). **No** existen las categorías ropa/electrónica/muebles/adornos/cocina del
enunciado. Esto fue una decisión explícita: usar solo los datos ya existentes del
proyecto, sin inventar productos.
- Lo que el enunciado busca con esas categorías —un **esquema dinámico** donde cada
  categoría tiene atributos distintos— **sí se demuestra**, pero mediante el `tipo` de
  zapatilla (skate/running/basketball/formal/trail/entrenamiento/lifestyle), cada uno
  con su propio sub-documento `atributos` (ver ítem 6).
- La indicación de la docente (**vistas que filtran por etiqueta**) **sí se cumple**
  (ítem 9, `vista_ofertas`/`vista_skate` filtran por `etiquetas`).
- **Brecha real:** la *variedad de categorías de negocio* del PDF no está. Si se exige
  literalmente, habría que ampliar el catálogo a varias categorías con atributos
  heterogéneos (ver arreglo propuesto).

---

## MÓDULO 3 — Integración (enlace por UUID)

### 11. Enlace por UUID — ✅
`GET /api/clientes/:uuid/resumen` en vivo:
```
cliente.id (PG) = 1268c94f-22a4-4899-8620-14b8ac2681b4
enlace_uuid     = 1268c94f-22a4-4899-8620-14b8ac2681b4
PG pedido f1999c93 · factura F-20260616000642 · total 321.00
PG pedido_items[0].producto_uuid = 9c1518fd-1ce5-479d-b3a2-f28b8942d834
→ Mongo producto.uuid            = 9c1518fd-1ce5-479d-b3a2-f28b8942d834 (Adi2000)
Mongo carrito.items = []      Mongo preferencias = {marcas_favoritas:[Nike,Adidas], talla:42}
```
El mismo UUID de cliente une pedidos/facturas (Postgres) con carrito/preferencias
(Mongo); `producto_uuid` une `pedido_items` ↔ `productos`. Código:
[services/resumen.js](../services/resumen.js).

### 12. Sincronización (checkout saga) — ✅
`node scripts/verificar_integracion.js` en vivo:
```
STOCK ANTES : Adi2000=3 , Jeremy Scott=3
CHECKOUT    : estado=completado , factura F-20260616000642 , total 362.73
STOCK DESPUÉS: Adi2000 3→1 (compró 2) , Jeremy Scott 3→2 (compró 1)
CARRITO TRAS CHECKOUT: items: []   (vacío)
```
Saga + compensación en [services/checkout.js](../services/checkout.js) (valida stock →
cobro ACID → descuenta stock/vacía carrito → `incidentes_stock`+estado `revision` si
Mongo falla).

---

## ENTREGABLES

### 13. Script de creación de BDs — ✅
[db/sql/schema.sql](../db/sql/schema.sql) + [scripts/migrar_a_mongo.js](../scripts/migrar_a_mongo.js)
(colecciones, índices, vistas) + scripts npm: `db:up`, `db:schema`, `db:mongo`,
`db:seed`, `setup`, `demo` ([package.json](../package.json)).

### 14. Documentación de arquitectura con diagrama de flujo — ✅
[docs/arquitectura.md](arquitectura.md): `flowchart TB` (línea 12) y `sequenceDiagram`
(línea 57) + explicación de motores, enlace UUID y consistencia políglota.

### 15. API que demuestra integración y sincronización — ✅
Endpoints ([server.js:23-110](../server.js#L23)): `/api/register`, `/api/login`,
`/api/products[/:id]`, `/api/cart` (GET/POST/DELETE), `/api/preferences` (GET/PUT),
`/api/checkout`, `/api/clientes/:uuid/resumen`. Demo end-to-end pasa (ítem 12).

---

## Tabla resumen

| # | Requisito | Estado | Evidencia |
|---|-----------|--------|-----------|
| 1 | 3NF | ✅ | schema.sql:22-116; subtotal GENERATED (76); nota: totales son snapshots almacenados |
| 2 | ACID pagos | ✅ | procesar_pago schema.sql:164-267; verificar_postgres.js: rollback 6/12/6/6 = 6/12/6/6 |
| 3 | Cifrado tarjeta | ✅ | token_tarjeta bytea 82B (cab. PGP c30d04…); ultimos4 en claro; pgp_sym (schema.sql:233) |
| 4 | RBAC roles+grants+token | ✅ | solo app_admin sobre token; app_cliente → permission denied; admin descifra 4111…1111 |
| 4b | Aislamiento RLS por cliente | ✅ | CORREGIDO: RLS en clientes/pedido_items/facturas/pedidos/pagos; sin contexto → 0/0/0; password_hash → permission denied; con UUID → solo lo propio |
| 5 | Anti SQL-injection | ✅ | grep: solo `${}` en mensajes/URI/valor JSONB; SQL todo `$1,$2` (checkout.js:19, auth.js:25, pagos.js:18) |
| 6 | Esquema dinámico BSON | ✅ | atributos por tipo en vivo (skate/running/formal) |
| 7 | $gt/$lt/$and/$or | ✅ | consulta combinada → 17 docs |
| 8 | Arreglos $in/$elemMatch | ✅ | etiquetas 8, industria 9, variantes $elemMatch 24 |
| 9 | Vistas MongoDB | ✅ | vista_ofertas(4), vista_skate(1), vista_reporte_premium(17) |
| 10 | Categorías del PDF | ⚠️ | catálogo solo calzado; esquema dinámico cubierto por `tipo`+atributos; faltan categorías de negocio |
| 11 | Enlace por UUID | ✅ | resumen: cliente.id ↔ enlace_uuid; producto_uuid ↔ productos.uuid |
| 12 | Sincronización stock | ✅ | demo: 3→1 y 3→2; carrito vacío tras checkout |
| 13 | Script creación BDs | ✅ | schema.sql + migrar_a_mongo.js + npm scripts |
| 14 | Doc arquitectura + diagrama | ✅ | arquitectura.md: flowchart(12) + sequenceDiagram(57) |
| 15 | API integración + demo | ✅ | server.js:23-110; demo end-to-end pasa |

**Veredicto:** 14 ✅, 1 ⚠️, 0 ❌. El hallazgo 4b (aislamiento RLS) fue **corregido y
re-verificado en vivo** el 2026-06-16. La única brecha restante es de alcance: el
catálogo es solo calzado (ítem 10), documentado honestamente en el README; el esquema
dinámico y las vistas por etiqueta sí están cubiertos.

---

## Arreglos mínimos propuestos (NO implementados aún)

1. **(4b) Cerrar el aislamiento RLS** — habilitar RLS en `clientes`, `pedido_items` y
   `facturas`, y acotar columnas de `clientes`:
   - `pedido_items` / `facturas`: `ENABLE ROW LEVEL SECURITY` + política
     `USING (EXISTS (SELECT 1 FROM pedidos p WHERE p.id = <tabla>.pedido_id AND
     p.cliente_id = NULLIF(current_setting('app.current_cliente',true),'')::uuid))`.
   - `clientes`: `ENABLE ROW LEVEL SECURITY` + política `USING (id = …current_cliente…)`
     y cambiar el grant a `GRANT SELECT (id,nombre,email,rol,fecha_registro)` (excluir
     `password_hash`). El login usa el pool dueño, así que no se ve afectado.
2. **(10) Categorías de negocio** — si la docente exige las categorías del PDF, ampliar
   el catálogo en Mongo con varias categorías (ropa/electrónica/muebles/…) cada una con
   su `atributos` propio y `etiquetas`/vistas asociadas; o bien acordar formalmente que
   el dominio del proyecto es calzado y que el "esquema dinámico" se evidencia por
   `tipo` de producto (dejar constancia escrita).
3. **(1, menor)** Documentar/justificar `pedidos.total` y `facturas.total` como snapshots
   intencionales (o convertir `facturas.total` en GENERATED `subtotal+impuestos`).
