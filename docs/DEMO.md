# Guía de demostración y prueba

Guía para la entrega/presentación. **Todos los comandos fueron ejecutados y devuelven
datos reales** (2026-06-16). Cada sección indica qué requisito del PDF demuestra.

> Contexto: PostgreSQL en `localhost:5432` (contenedor `ecommerce_postgres`), MongoDB en
> `localhost:27018` (contenedor `ecommerce_mongo`; dentro del contenedor es 27017).

---

## A. Arrancar desde cero

```bash
npm install        # dependencias
npm run setup      # docker compose up -d --wait  +  schema.sql  +  catálogo Mongo  +  seed clientes
node server.js     # arranca la app y la deja corriendo
```

`npm run setup` encadena: `db:up` → `db:schema` → `db:mongo` → `db:seed`.

Al arrancar verás:
```
Conectado a MongoDB. Base de datos: ecommerce_multitienda
Servidor corriendo en http://localhost:3000
```

👉 **URL de la app: http://localhost:3000**  ·  *Mapea a: entregable "API + puesta en marcha".*

> Si repites la demo y el stock quedó bajo, recarga el catálogo (idempotente, restablece
> stock): `npm run db:mongo`.

---

## B. Demo por navegador (integración + sincronización)

Abre **http://localhost:3000** y sigue los pasos:

| Paso | Acción | Qué demuestra |
|------|--------|---------------|
| 1 | Ir a **/login.html** e ingresar `ana.cliente@example.com` / `Cliente123!` | Auth (bcrypt + JWT); el UUID del cliente queda en sesión |
| 2 | Ver el catálogo en **/shop.html** | Catálogo servido desde **MongoDB** (`/api/products`) |
| 3 | Abrir un producto (clic en una zapatilla → **/sproduct.html**) | Detalle por `producto_uuid` (enlace a Mongo) |
| 4 | **Add to Cart** (elegir cantidad) | Carrito persistido en **MongoDB** por `cliente_uuid` (no en localStorage) |
| 5 | Ir a **/cart.html** | Carrito leído desde el servidor + detalle de producto del catálogo |
| 6 | **Completar compra** con la tarjeta de prueba `4111111111111111`, venc. `1230`, CVC `123` | **Checkout ACID + saga**: cobro atómico en Postgres |
| 7 | Ver el mensaje con **número de factura y total** | Factura generada en **PostgreSQL** (`procesar_pago`) |
| 8 | Recargar `/shop.html` o `/sproduct.html` del producto comprado | **Stock que baja** en Mongo (sincronización políglota) |

*Mapea a: integración por UUID + sincronización (saga) + ACID + cifrado de tarjeta.*

> El número de tarjeta **no se guarda en claro**: el backend lo cifra (`pgcrypto`) y solo
> conserva `ultimos4` + token cifrado.

---

## C. Probar PostgreSQL (relacional)

**Conexión (terminal):**
```bash
docker exec -it ecommerce_postgres psql -U ecommerce_user -d ecommerce_transaccional
```
**GUI opcional:** DBeaver o pgAdmin → host `localhost`, puerto `5432`, base
`ecommerce_transaccional`, usuario `ecommerce_user`, clave `postgres_local_dev`.

### C.1 — Tablas en 3NF (`\dt`)  ·  *Requisito: 3NF*
```sql
\dt
```
Salida real:
```
 public | clientes         | table | ecommerce_user
 public | direcciones      | table | ecommerce_user
 public | facturas         | table | ecommerce_user
 public | incidentes_stock | table | ecommerce_user
 public | pagos            | table | ecommerce_user
 public | pedido_items     | table | ecommerce_user
 public | pedidos          | table | ecommerce_user
```

### C.2 — Transacción ACID + ROLLBACK  ·  *Requisito: ACID*
```bash
node scripts/verificar_postgres.js
```
Confirma: **1) PAGO EXITOSO** (crea pedido+items+pago+factura), **2) PAGO QUE FALLA →
ROLLBACK** (conteos antes == después, 0 filas), **3) RBAC token**.

### C.3 — Cifrado de tarjeta (bytea)  ·  *Requisito: cifrado de datos sensibles*
```bash
docker exec ecommerce_postgres psql -U ecommerce_user -d ecommerce_transaccional \
  -c "SELECT metodo, ultimos4, pg_typeof(token_tarjeta) AS tipo, octet_length(token_tarjeta) AS bytes FROM pagos WHERE token_tarjeta IS NOT NULL LIMIT 1;"
```
Salida real:
```
 metodo  | ultimos4 | tipo  | bytes
 tarjeta | 1111     | bytea |    82
```
`token_tarjeta` es **bytea cifrado** (no el PAN); solo `ultimos4` queda en claro.

### C.4 — RBAC: `app_cliente` NO puede leer el token  ·  *Requisito: RBAC*
```bash
docker exec -e PGPASSWORD=cliente_local_dev ecommerce_postgres \
  psql -U app_cliente -d ecommerce_transaccional \
  -c "SELECT token_tarjeta FROM pagos LIMIT 1;"
```
Salida real:
```
ERROR:  permission denied for table pagos
```
Y `app_admin` sí lo descifra (lo hace `scripts/verificar_postgres.js`, bloque 3):
`app_admin descifra token → 4111111111111111`.

### C.5 — RLS: aislamiento por cliente  ·  *Requisito: seguridad / sin acceso a otros clientes*
**Sin** fijar `app.current_cliente` (no ve nada):
```bash
docker exec -e PGPASSWORD=cliente_local_dev ecommerce_postgres \
  psql -U app_cliente -d ecommerce_transaccional \
  -c "SELECT 'clientes' t, count(*) FROM clientes
      UNION ALL SELECT 'pedido_items', count(*) FROM pedido_items
      UNION ALL SELECT 'facturas', count(*) FROM facturas;"
```
Salida real (todo **0**):
```
 clientes     | 0
 pedido_items | 0
 facturas     | 0
```
**Fijando** `app.current_cliente` al UUID de Ana (solo ve lo suyo). Primero obtén su UUID:
```bash
docker exec ecommerce_postgres psql -U ecommerce_user -d ecommerce_transaccional -tA \
  -c "SELECT id FROM clientes WHERE email='ana.cliente@example.com';"
# ej.: 31b21b01-8aa7-4437-aa17-61ec77678614
```
Luego (reemplaza el UUID):
```bash
docker exec -e PGPASSWORD=cliente_local_dev ecommerce_postgres \
  psql -U app_cliente -d ecommerce_transaccional \
  -c "SET app.current_cliente TO '31b21b01-8aa7-4437-aa17-61ec77678614';
      SELECT 'clientes' t, count(*) FROM clientes
      UNION ALL SELECT 'pedidos', count(*) FROM pedidos
      UNION ALL SELECT 'pedido_items', count(*) FROM pedido_items
      UNION ALL SELECT 'facturas', count(*) FROM facturas;"
```
Salida real (solo SUS filas):
```
 clientes     | 1
 pedidos      | 3
 pedido_items | 6
 facturas     | 3
```

---

## D. Probar MongoDB (catálogo NoSQL)

**Conexión (terminal):**
```bash
docker exec -it ecommerce_mongo mongosh -u ecommerce_user -p mongo_local_dev \
  --authenticationDatabase admin ecommerce_multitienda
```
**GUI opcional:** MongoDB Compass → `mongodb://ecommerce_user:mongo_local_dev@localhost:27018/?authSource=admin`
(o `mongodb://localhost:27018` y autenticar con esos credenciales).

> Las consultas siguientes se ejecutan **dentro de `mongosh`**. Todas devuelven datos
> (ninguna sale vacía).

### D.1 — Ver productos
```js
db.productos.countDocuments()                         // 24
db.productos.find({}, { _id:0, marca:1, nombre:1, precio:1, tipo:1 }).limit(3)
```

### D.2 — Esquema dinámico: atributos por tipo  ·  *Requisito: esquema dinámico BSON*
```js
db.productos.findOne({ tipo:"skate"   }, { _id:0, nombre:1, atributos:1 })
db.productos.findOne({ tipo:"running" }, { _id:0, nombre:1, atributos:1 })
db.productos.findOne({ tipo:"formal"  }, { _id:0, nombre:1, atributos:1 })
```
Salida real:
```
skate   → {"soporte_tobillo":"medio","durabilidad":"alta","tipo_suela":"vulcanizada"}
running → {"drop_mm":8,"amortiguacion":"alta","superficie":"asfalto"}
formal  → {"material_suela":"goma","material_upper":"cuero","acolchado":"bajo"}
```

### D.3 — Vistas  ·  *Requisito: vistas Mongo (indicación de la docente: filtran por etiqueta)*
```js
db.getCollectionInfos({ type:"view" }).map(v => v.name)   // [vista_ofertas, vista_skate, vista_reporte_premium]
db.vista_ofertas.find({}, { _id:0, nombre:1, precio:1 })          // 4 docs
db.vista_skate.find({}, { _id:0, nombre:1 })                      // 1 doc
db.vista_reporte_premium.find({}, { _id:0, nombre:1, precio:1, year:1 })  // 17 docs
```

### D.4 — Operadores `$gt` / `$lt` / `$and` / `$or`  ·  *Requisito: consultas comparativas*
```js
db.productos.find({
  $and: [
    { precio: { $gt: 100 } },
    { precio: { $lt: 200 } },
    { $or: [ { destacado: true }, { year: { $gte: 2023 } } ] }
  ]
}, { _id:0, nombre:1, precio:1, year:1, destacado:1 })
// count = 17 (no vacío)
```

### D.5 — Arreglos: `$in` y `$elemMatch`  ·  *Requisito: manejo de arreglos*
```js
// $in sobre etiquetas → 8
db.productos.countDocuments({ etiquetas: { $in: ["marca:nike", "marca:adidas"] } })
// $in sobre industria → 9
db.productos.countDocuments({ industria: { $in: ["deportivo"] } })
// $elemMatch sobre variantes (array de objetos) → 24
db.productos.find({ variantes: { $elemMatch: { talla: 42, stock: { $gt: 0 } } } },
                  { _id:0, nombre:1, variantes:1 }).limit(2)
```

---

## E. Prueba automática completa

```bash
node scripts/verificar_integracion.js     # equivale a: npm run demo
```
Qué confirma cada bloque de la salida:

| Bloque | Confirma |
|--------|----------|
| `register / login` | Auth: cuenta + JWT con el UUID del cliente |
| `STOCK ANTES` | stock inicial en Mongo de los 2 productos |
| `CARRITO (MongoDB)` | carrito persistido por `cliente_uuid` |
| `CHECKOUT estado=completado` | checkout ACID + saga ejecutado |
| `STOCK DESPUÉS (3→1, 3→2)` | **sincronización**: el stock baja en Mongo |
| `CARRITO TRAS CHECKOUT: items: []` | carrito vaciado tras la compra |
| `VISTA 360` | **enlace por UUID**: pedidos/facturas (Postgres) + carrito/prefs (Mongo) + `producto_uuid ↔ productos.uuid` |

*Mapea a: integración por UUID + sincronización + ACID, end-to-end.*

---

## F. Acceso / Login (cómo entrar con un usuario)

El navbar de todas las páginas principales (`index`, `shop`, `sproduct`, `cart`) tiene un
enlace visible **“Ingresar”** (`#nav-login`). Tras iniciar sesión, `auth.js`
([public/auth.js](../public/auth.js) → `pintarSesion`) lo reemplaza por **“Hola,
&lt;nombre&gt;”** y un botón **“Salir”** (`#nav-session`), para que se vea quién está
logueado.

### Iniciar sesión (paso a paso)
1. Abrir **http://localhost:3000/login.html**.
2. Las credenciales de prueba vienen **precargadas** en el formulario
   (`ana.cliente@example.com` / `Cliente123!`).
3. Pulsar **Entrar** → redirige a **/shop.html**; en el navbar aparece “Hola, Ana
   Cliente” + “Salir”.

> **Agregar al carrito y comprar REQUIEREN sesión.** Sin token, esas acciones devuelven
> **HTTP 401** y el frontend redirige a `login.html`.

### Registrar un usuario nuevo
1. En **/login.html**, pestaña **“Registrarme”**.
2. Completar nombre, email y contraseña → **Registrarme**.
3. Volver a la pestaña **“Ingresar”** y entrar con ese email (se crea con rol `cliente`).

### Verificación en vivo del flujo (real, 2026-06-16)
```bash
# 1) login → devuelve token
curl -s -X POST http://localhost:3000/api/login \
  -H "Content-Type: application/json" \
  -d '{"email":"ana.cliente@example.com","password":"Cliente123!"}'
#   → { "token":"eyJhbGciOiJIUzI1NiIs...", "cliente":{ "uuid":"31b21b01-...","nombre":"Ana Cliente",... } }

# 2) con ese token, /api/cart responde 200
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/api/cart \
  -H "Authorization: Bearer <TOKEN>"
#   → 200

# 3) sin token, /api/cart responde 401
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/api/cart
#   → 401
```
Resultado verificado: `login` devuelve token; `GET /api/cart` con token → **200**, sin
token → **401**.

---

## CÓMO VER LA DEMO (resumen)

- **URL:** http://localhost:3000  (login en http://localhost:3000/login.html)
- **Credenciales de prueba:**
  | Rol | Email | Contraseña |
  |-----|-------|-----------|
  | cliente | `ana.cliente@example.com` | `Cliente123!` |
  | vendedor | `victor.vendedor@example.com` | `Vendedor123!` |
  | admin | `alma.admin@example.com` | `Admin123!` |
- **Tarjeta de prueba (checkout):** `4111111111111111`, venc. `1230`, CVC `123`.
- **Comandos clave:**
  ```bash
  # Prueba end-to-end (integración + sincronización)
  npm run demo

  # PostgreSQL (relacional)
  docker exec -it ecommerce_postgres psql -U ecommerce_user -d ecommerce_transaccional

  # MongoDB (catálogo)
  docker exec -it ecommerce_mongo mongosh -u ecommerce_user -p mongo_local_dev --authenticationDatabase admin ecommerce_multitienda
  ```
