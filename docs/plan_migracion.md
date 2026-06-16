# Plan de migración a persistencia políglota (PostgreSQL + MongoDB)

> **Fase actual: solo planificación.** No se migran datos ni se cambia de dónde lee el catálogo la
> app. Este documento debe ser aprobado antes de implementar la migración.
>
> Restricción clave: se usan **exclusivamente** los datos que ya existen (los 24 productos de la tabla
> `products` de SQLite). **No** se importan catálogos externos ni se inventan productos nuevos.

---

## 0. Resumen de la arquitectura objetivo

```
                 ┌───────────────────────────┐
                 │        Aplicación         │
                 │      (Node + Express)     │
                 └─────────────┬─────────────┘
                               │
            ┌──────────────────┴───────────────────┐
            ▼                                       ▼
  ┌───────────────────┐                  ┌────────────────────────┐
  │   PostgreSQL 16   │                  │       MongoDB 7        │
  │ (transaccional)   │                  │   (catálogo)           │
  │                   │                  │ db: ecommerce_multi... │
  │ clientes          │                  │ colección: productos   │
  │ pedidos           │   UUID producto  │   { uuid, etiquetas[], │
  │ pedido_items ─────┼─────────────────▶│     ... }              │
  │ pagos             │  (join lógico)   │                        │
  │ facturas          │                  │                        │
  └───────────────────┘                  └────────────────────────┘
```

- **PostgreSQL** → datos **transaccionales** (lo nuevo: clientes, pedidos, pagos, facturas). Hoy no
  existen en el proyecto; se crean desde cero.
- **MongoDB** → **catálogo** de productos (los 24 actuales), enriquecido con etiquetas y campos array
  para poder construir **vistas** que filtren por etiqueta.
- **Enlace entre ambas**: un **UUID por producto** y un **UUID por cliente**. Como son motores
  distintos, no hay claves foráneas físicas entre ellos; el UUID es la **clave de unión lógica**.

---

## 1. Qué va a PostgreSQL (datos TRANSACCIONALES nuevos)

Estos datos **no existen hoy** en el proyecto. Se diseñan desde cero. Todas las PK son `UUID`
(`gen_random_uuid()`, nativo en Postgres 16).

### 1.1 `clientes`
| Columna | Tipo | Notas |
|---------|------|-------|
| `id` | UUID PK | `DEFAULT gen_random_uuid()` — **UUID de cliente** (clave de enlace) |
| `nombre` | TEXT NOT NULL | |
| `email` | TEXT NOT NULL UNIQUE | |
| `telefono` | TEXT | |
| `direccion` | TEXT | |
| `creado_en` | TIMESTAMPTZ NOT NULL DEFAULT now() | |

### 1.2 `pedidos`
| Columna | Tipo | Notas |
|---------|------|-------|
| `id` | UUID PK | `DEFAULT gen_random_uuid()` |
| `cliente_id` | UUID NOT NULL | **FK → clientes(id)** |
| `fecha` | TIMESTAMPTZ NOT NULL DEFAULT now() | |
| `estado` | TEXT NOT NULL DEFAULT 'pendiente' | pendiente / pagado / enviado / cancelado |
| `total` | NUMERIC(10,2) NOT NULL DEFAULT 0 | |

### 1.3 `pedido_items`
| Columna | Tipo | Notas |
|---------|------|-------|
| `id` | UUID PK | `DEFAULT gen_random_uuid()` |
| `pedido_id` | UUID NOT NULL | **FK → pedidos(id)** |
| `producto_uuid` | UUID NOT NULL | **Enlace lógico → MongoDB `productos.uuid`** (sin FK física) |
| `producto_nombre` | TEXT NOT NULL | snapshot del nombre al momento de la compra |
| `cantidad` | INTEGER NOT NULL CHECK (cantidad > 0) | |
| `precio_unitario` | NUMERIC(10,2) NOT NULL | snapshot del precio al momento de la compra |

> Se guardan *snapshots* de nombre y precio porque el catálogo (Mongo) puede cambiar con el tiempo y
> la factura/pedido debe conservar el valor histórico.

### 1.4 `pagos`
| Columna | Tipo | Notas |
|---------|------|-------|
| `id` | UUID PK | `DEFAULT gen_random_uuid()` |
| `pedido_id` | UUID NOT NULL | **FK → pedidos(id)** |
| `metodo` | TEXT NOT NULL | 'tarjeta' / 'paypal' |
| `monto` | NUMERIC(10,2) NOT NULL | |
| `estado` | TEXT NOT NULL DEFAULT 'pendiente' | pendiente / aprobado / rechazado |
| `referencia` | TEXT | id/token del proveedor (NUNCA datos de tarjeta) |
| `fecha` | TIMESTAMPTZ NOT NULL DEFAULT now() | |

> ⚠️ Por seguridad/PCI **no** se almacenarán número de tarjeta ni CVC. Solo método, monto, estado y
> una referencia/token del proveedor de pago.

### 1.5 `facturas`
| Columna | Tipo | Notas |
|---------|------|-------|
| `id` | UUID PK | `DEFAULT gen_random_uuid()` |
| `pedido_id` | UUID NOT NULL UNIQUE | **FK → pedidos(id)** (1 factura por pedido) |
| `numero` | TEXT NOT NULL UNIQUE | folio de factura |
| `fecha_emision` | TIMESTAMPTZ NOT NULL DEFAULT now() | |
| `subtotal` | NUMERIC(10,2) NOT NULL | |
| `impuestos` | NUMERIC(10,2) NOT NULL DEFAULT 0 | |
| `total` | NUMERIC(10,2) NOT NULL | |

**Relaciones (todas dentro de Postgres):**
`clientes 1—N pedidos 1—N pedido_items` · `pedidos 1—N pagos` · `pedidos 1—1 facturas`.

**Índices previstos:** `pedidos(cliente_id)`, `pedido_items(pedido_id)`, `pedido_items(producto_uuid)`,
`pagos(pedido_id)`, `facturas(pedido_id)`.

---

## 2. Qué va a MongoDB (CATÁLOGO de productos)

Base de datos: **`ecommerce_multitienda`**, colección: **`productos`**.

Se migran los **24 productos existentes** (sin inventar ninguno), enriqueciendo cada uno con un
arreglo `etiquetas` (varias por producto) y otros campos array, para que las **vistas** de MongoDB
puedan filtrar por etiqueta.

### 2.1 Forma del documento

```jsonc
{
  "_id":        ObjectId("..."),          // id interno de Mongo
  "uuid":       "uuid-v4",                 // ENLACE: lo referencia pedido_items.producto_uuid (Postgres)
  "sqlite_id":  1,                          // id original en products (trazabilidad de la migración)
  "marca":      "Adidas",
  "nombre":     "Adi2000",
  "precio":     86,
  "anio":       2000,
  "imagen":     "img/products/Adidas Adi2000.png",
  "stock":      3,                          // proviene de products.quantity
  "etiquetas":  ["marca:adidas", "tipo:lifestyle", "genero:unisex",
                 "precio:economico", "epoca:retro"],   // ← varias etiquetas (campo clave para vistas)
  "generos":        ["unisex"],            // otros campos array
  "colores":        ["multicolor"],
  "colaboraciones": [],                     // vacío si no es colaboración
  "categorias":     ["lifestyle", "retro"]
}
```

### 2.2 Índices previstos en Mongo
- `uuid` (único) — clave de enlace con Postgres.
- `etiquetas` (multikey) — para que las vistas filtren rápido por etiqueta.
- `marca`, `precio` — filtros/orden comunes.

### 2.3 Vistas previstas (se crearán en una fase posterior, NO ahora)
Ejemplos que aprovechan `etiquetas`:
- `vw_economicos` → productos con `etiquetas: "precio:economico"`.
- `vw_colaboraciones` → productos con alguna etiqueta `colab:*`.
- `vw_running` → `etiquetas: "tipo:running"` o `"tipo:trail-running"`.
- `vw_por_marca` → agrupadas por `marca`.

---

## 3. Cómo se enlazan las dos bases (UUID)

1. **UUID de producto**: durante la migración del catálogo, a cada producto se le genera un `uuid`
   (v4) que se guarda en su documento de Mongo (`productos.uuid`). Ese mismo UUID es lo que
   PostgreSQL almacena en `pedido_items.producto_uuid` cuando alguien compra. Para mostrar el detalle
   de un pedido, la app:
   - lee el pedido y sus items de **Postgres**,
   - toma cada `producto_uuid` y consulta el documento correspondiente en **Mongo** (`{ uuid }`).
2. **UUID de cliente**: `clientes.id` (UUID) identifica al cliente en Postgres y es lo que referencian
   `pedidos.cliente_id`. Si en el futuro se guardan reseñas/favoritos de productos en Mongo, se podrá
   referenciar al cliente por ese mismo UUID.
3. **No hay FK físicas entre motores**: la integridad referencial cruzada (Postgres ↔ Mongo) se valida
   en la capa de aplicación, no en la base de datos.

```
clientes.id (uuid) ──< pedidos.cliente_id
pedidos.id (uuid)  ──< pedido_items.pedido_id
pedido_items.producto_uuid (uuid)  ─ ─ ─▶  productos.uuid  (MongoDB)
```

---

## 4. Lista concreta de etiquetas/atributos por producto

### 4.1 Reglas de derivación (a partir de marca, nombre, precio y año reales)

- **Marca** → `marca:<marca-en-minúsculas-sin-espacios>` (ej. `marca:newbalance`).
- **Tipo** (derivado del nombre):
  - `tipo:basketball` (Basketball, MB.04), `tipo:skate` (SB Dunk), `tipo:running` (Zoom Fly, Magmax,
    Floatzig, 530 Running), `tipo:trail-running` (Hierro), `tipo:entrenamiento` (Nano), resto
    `tipo:lifestyle`.
- **Género** → `genero:hombre` si el nombre dice "Men's"; en el resto `genero:unisex`.
- **Precio** → `precio:economico` (< 100), `precio:medio` (100–149), `precio:premium` (≥ 150).
- **Época** (por año) → `epoca:retro` (< 2010), `epoca:clasico` (2010–2019), `epoca:actual`
  (2020–2022), `epoca:nuevo` (≥ 2023).
- **Colaboración** (si el nombre tiene "x" o un colaborador) → etiqueta `colab:<colaborador>` y se
  añade al array `colaboraciones`.
- **Color** (si aparece en el nombre) → `color:<color>` y se añade al array `colores`.

### 4.2 Tabla por producto (los 24 reales)

| id | Producto | precio | año | Etiquetas propuestas |
|----|----------|-------:|----:|----------------------|
| 1 | Adidas Adi2000 | 86 | 2000 | `marca:adidas` `tipo:lifestyle` `genero:unisex` `precio:economico` `epoca:retro` |
| 2 | Adidas Jeremy Scott x Superstar Money | 149 | 2023 | `marca:adidas` `tipo:lifestyle` `genero:unisex` `precio:medio` `epoca:nuevo` `colab:jeremy-scott` |
| 3 | Adidas Samba OG Cream White Sand Strata | 179 | 2024 | `marca:adidas` `tipo:lifestyle` `genero:unisex` `precio:premium` `epoca:nuevo` `color:crema` `color:blanco` |
| 4 | Adidas Yeezy Foam RNNR Sand | 129 | 2022 | `marca:adidas` `tipo:lifestyle` `genero:unisex` `precio:medio` `epoca:actual` `colab:yeezy` `color:arena` |
| 5 | Nike Air Rift Black Forest OG | 109 | 2015 | `marca:nike` `tipo:lifestyle` `genero:unisex` `precio:medio` `epoca:clasico` `color:negro` |
| 6 | Nike Nathan Bell x Zoom Fly SP 'Doodles' | 129 | 2019 | `marca:nike` `tipo:running` `genero:unisex` `precio:medio` `epoca:clasico` `colab:nathan-bell` |
| 7 | Nike SB Dunk Low London | 79 | 2004 | `marca:nike` `tipo:skate` `genero:unisex` `precio:economico` `epoca:retro` |
| 8 | Nike Air Yeezy 2 SP 'Red October' | 86 | 2014 | `marca:nike` `tipo:lifestyle` `genero:unisex` `precio:economico` `epoca:clasico` `colab:yeezy` `color:rojo` |
| 9 | Puma Tenis Speedcat OG | 119 | 2024 | `marca:puma` `tipo:lifestyle` `genero:unisex` `precio:medio` `epoca:nuevo` |
| 10 | Puma Court Pro Men's Basketball | 139 | 2023 | `marca:puma` `tipo:basketball` `genero:hombre` `precio:medio` `epoca:nuevo` |
| 11 | Puma x Lamelo Ball MB.04 1Love Men's | 129 | 2024 | `marca:puma` `tipo:basketball` `genero:hombre` `precio:medio` `epoca:nuevo` `colab:lamelo-ball` |
| 12 | Puma Magmax Nitro | 179 | 2024 | `marca:puma` `tipo:running` `genero:unisex` `precio:premium` `epoca:nuevo` |
| 13 | Converse Off White | 139 | 2021 | `marca:converse` `tipo:lifestyle` `genero:unisex` `precio:medio` `epoca:actual` `colab:off-white` `color:blanco` |
| 14 | Carhartt x Converse One Star WIP White | 139 | 2023 | `marca:converse` `tipo:lifestyle` `genero:unisex` `precio:medio` `epoca:nuevo` `colab:carhartt` `color:blanco` |
| 15 | Converse Run Star Hike JW Anderson White | 119 | 2019 | `marca:converse` `tipo:lifestyle` `genero:unisex` `precio:medio` `epoca:clasico` `colab:jw-anderson` `color:blanco` |
| 16 | Feng Chen Wang x Converse Chuck 70 2-in-1 | 129 | 2021 | `marca:converse` `tipo:lifestyle` `genero:unisex` `precio:medio` `epoca:actual` `colab:feng-chen-wang` |
| 17 | New Balance Fresh Foam X Hierro v9 | 179 | 2025 | `marca:newbalance` `tipo:trail-running` `genero:unisex` `precio:premium` `epoca:nuevo` |
| 18 | New Balance 327 | 119 | 2022 | `marca:newbalance` `tipo:lifestyle` `genero:unisex` `precio:medio` `epoca:actual` |
| 19 | New Balance 530 Retro Running Shoes | 129 | 2023 | `marca:newbalance` `tipo:running` `genero:unisex` `precio:medio` `epoca:nuevo` `color:blanco` |
| 20 | New Balance 9060 Trainers White | 159 | 2024 | `marca:newbalance` `tipo:lifestyle` `genero:unisex` `precio:premium` `epoca:nuevo` `color:blanco` |
| 21 | Reebok Classic Leather Shoes | 89 | 2015 | `marca:reebok` `tipo:lifestyle` `genero:unisex` `precio:economico` `epoca:clasico` |
| 22 | Reebok Club C | 119 | 2021 | `marca:reebok` `tipo:lifestyle` `genero:unisex` `precio:medio` `epoca:actual` |
| 23 | Reebok Floatzig 1 Footwear | 169 | 2024 | `marca:reebok` `tipo:running` `genero:unisex` `precio:premium` `epoca:nuevo` |
| 24 | Reebok Nano X4 | 139 | 2024 | `marca:reebok` `tipo:entrenamiento` `genero:unisex` `precio:medio` `epoca:nuevo` |

> Estas etiquetas se derivan automáticamente de los datos reales con las reglas de 4.1; no añaden
> productos ni datos inventados, solo clasifican lo existente.

### 4.3 Campos array adicionales por documento
- `generos`: p.ej. `["unisex"]` o `["hombre"]`.
- `colores`: derivados del nombre (vacío si no se menciona color).
- `colaboraciones`: lista de colaboradores (vacío si no aplica).
- `categorias`: equivalente legible del `tipo` (p.ej. `["running"]`, `["lifestyle","retro"]`).

---

## 5. Fases siguientes (NO se ejecutan ahora)

1. **Infraestructura** ✅ (esta fase): `.gitignore`, `.env.example`, `docker-compose.yml`, drivers
   `pg`/`mongodb`, módulos `db/postgres.js` y `db/mongo.js`, este plan.
2. **Aprobación del plan** ⏸️ (pendiente — requiere tu visto bueno).
3. Levantar contenedores (`docker compose up -d`) y crear el esquema de Postgres (DDL de la sección 1).
4. Script de migración del catálogo: leer los 24 productos de `shoes.db` → generar `uuid` + etiquetas
   → insertarlos en Mongo (`ecommerce_multitienda.productos`).
5. Crear índices y vistas en Mongo.
6. Cambiar la app para leer el catálogo desde Mongo y registrar transacciones en Postgres.

---

## 6. Lo ya preparado en esta fase

| Archivo | Propósito |
|---------|-----------|
| `.gitignore` | Ignora `node_modules`, `.env`, `*.zip`, etc. |
| `.env.example` | Plantilla de variables (placeholders, sin secretos) |
| `.env` | Config local real (fuera de git) con credenciales Postgres/Mongo |
| `docker-compose.yml` | Servicios `postgres:16` y `mongo:7` con volúmenes y credenciales desde `.env` |
| `db/postgres.js` | Pool de conexiones `pg` (lee `.env`) |
| `db/mongo.js` | Cliente `mongodb`, base `ecommerce_multitienda` (lee `.env`) |
| `docs/plan_migracion.md` | Este plan |

> Acciones de git realizadas: `node_modules` y `.env` quitados del índice (`git rm --cached`) sin
> borrarlos del disco. **Nota:** la credencial RDS antigua sigue existiendo en el *historial* de git;
> si ese servidor volviera a usarse, debería rotarse la contraseña (el servidor ya estaba caído).
