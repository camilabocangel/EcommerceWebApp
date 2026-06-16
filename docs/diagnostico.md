# Diagnóstico del proyecto E-commerce

> Informe de análisis **solo lectura**. No se modificó código ni base de datos para generar este documento.
> Fecha del análisis: 2026-06-07.

> ⚠️ **Nota de contexto importante:** En una sesión de trabajo previa, los archivos
> [`db.js`](../db.js) y [`api.js`](../api.js) **ya habían sido modificados** para cambiar la conexión
> de **MySQL/AWS RDS** (diseño original) a **SQLite local** (`shoes.db`). Este informe describe el
> **estado actual** del repositorio y, donde es relevante, señala cuál era el diseño original.

---

## 1. Stack técnico

| Capa | Tecnología |
|------|-----------|
| **Lenguaje** | JavaScript (Node.js) |
| **Framework backend** | [Express](../package.json) `^4.21.2` |
| **Frontend** | HTML + CSS + JavaScript "vanilla" (sin framework). Archivos estáticos servidos desde `public/` |
| **ORM** | **Ninguno.** No hay ORM (no Sequelize, Prisma, TypeORM, etc.). Se usan drivers/queries SQL directas |
| **Driver de BD (actual)** | `sqlite` `^5.1.1` + `sqlite3` `^5.1.7` (wrapper de promesas sobre `sqlite3`) |
| **Driver de BD (original)** | `mysql2` `^3.6.5` (sigue instalado como dependencia, ya no se usa en el código) |
| **Gestor de paquetes** | **npm** (existe `package-lock.json`; no hay `yarn.lock` ni `pnpm-lock.yaml`) |
| **Config / entorno** | `dotenv` `^16.5.0` (carga el archivo `.env`) |
| **Otros** | `cors` (middleware CORS), `nodemon` (recarga en desarrollo) |

Punto de entrada: el `package.json` declara `"main": "api.js"` pero el script de arranque es
`"start": "node server.js"` → el servidor real es [`server.js`](../server.js), que escucha en el
**puerto 3000** (hardcodeado).

Estructura relevante:

```
EcommerceWebApp/
├── server.js        # arranque Express + rutas + static
├── api.js           # handlers (controladores) de la API
├── db.js            # conexión a la BD + creación/seed de tabla
├── routes.js        # router alternativo (NO se usa en server.js)
├── .env             # credenciales MySQL/RDS (legado, ya no se usan)
├── shoes.db         # base de datos SQLite (en uso actualmente)
├── package.json
└── public/          # frontend estático
    ├── index.html, shop.html, sproduct.html, cart.html, about.html, blog.html, contact.html
    ├── script.js    # lógica de catálogo, carrito y "pago"
    ├── style.css
    └── img/
```

---

## 2. Motor de base de datos actual y conexión

### Estado actual: SQLite

- Motor: **SQLite**, archivo local [`shoes.db`](../shoes.db).
- La conexión se establece en [`db.js`](../db.js) mediante el wrapper `sqlite` (`open({...})`)
  sobre el driver `sqlite3`:

```js
const db = await open({
    filename: path.join(__dirname, 'shoes.db'),
    driver: sqlite3.Database
});
```

- `connectDB()` implementa un **singleton** (cachea la promesa de conexión y la reutiliza).
- En el arranque/primer uso: hace `CREATE TABLE IF NOT EXISTS products (...)` y, si la tabla está
  vacía, ejecuta un **seed** (`insertProducts`) con 24 productos hardcodeados.
- Los handlers en [`api.js`](../api.js) obtienen la conexión con `await connectDB()` y consultan con
  la API del wrapper: `db.all(...)`, `db.get(...)`, `db.run(...)`.

### Diseño original: MySQL / AWS RDS

- El archivo [`.env`](../.env) todavía contiene credenciales de una base **MySQL en AWS RDS**:

  ```
  DB_HOST=ecommerce-db.cw3gywuw69nd.us-east-1.rds.amazonaws.com
  DB_USER=admin
  DB_PASSWORD=flor2013        ← credencial en texto plano en el repo
  DB_NAME=ecommerce_db
  DB_PORT=3306
  ```

- ⚠️ **Hallazgo de seguridad:** hay credenciales de base de datos (usuario, contraseña y host RDS)
  **en texto plano** versionadas en el repositorio. Aunque ese servidor ya no responde, las
  credenciales deberían rotarse y `.env` debería estar en `.gitignore` (actualmente **no existe**
  `.gitignore` en el proyecto).

---

## 3. Esquema completo de la base de datos

La base de datos **actual contiene una sola tabla de negocio**: `products`
(más `sqlite_sequence`, tabla interna que SQLite usa para `AUTOINCREMENT`).

### Tabla: `products`

DDL real (extraído de `sqlite_master`):

```sql
CREATE TABLE products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    brand TEXT NOT NULL,
    name TEXT NOT NULL,
    image TEXT NOT NULL,
    price REAL NOT NULL,
    year INT NOT NULL,
    quantity INT DEFAULT 0
);
```

| Columna | Tipo | Nulo | PK | Default | Descripción |
|---------|------|------|----|---------|-------------|
| `id` | INTEGER | — | ✅ PK (autoincrement) | — | Identificador del producto |
| `brand` | TEXT | NOT NULL | | — | Marca (Adidas, Nike, Puma, etc.) |
| `name` | TEXT | NOT NULL | | — | Nombre/modelo del producto |
| `image` | TEXT | NOT NULL | | — | Ruta relativa a la imagen (`img/products/...`) |
| `price` | REAL | NOT NULL | | — | Precio |
| `year` | INT | NOT NULL | | — | Año del modelo |
| `quantity` | INT | (acepta null) | | `0` | Stock disponible |

- **Clave primaria:** `id`.
- **Claves foráneas:** **ninguna** (`PRAGMA foreign_key_list(products)` → vacío).
- **Índices:** **ninguno** explícito (`PRAGMA index_list(products)` → vacío). Solo existe el índice
  implícito del PRIMARY KEY sobre `id`.
- **Registros actuales:** 24 productos.

### Tabla interna: `sqlite_sequence`

```sql
CREATE TABLE sqlite_sequence(name, seq);
```
Tabla generada automáticamente por SQLite para llevar el contador de `AUTOINCREMENT`. No es de negocio.

> Nota: en el diseño original MySQL, [`db.js`](../db.js) creaba una tabla `products` equivalente con
> tipos MySQL (`INT AUTO_INCREMENT`, `VARCHAR(255)`, `DECIMAL(10,2)`). El esquema lógico es el mismo.

---

## 4. Clasificación de datos: transaccional vs. catálogo

### Catálogo de productos ✅ (existe)

Toda la base de datos actual **es catálogo**. La tabla `products` modela el catálogo con sus
atributos: marca, nombre, imagen, precio, año. El campo `quantity` (stock) es un atributo del
catálogo/inventario.

### Datos transaccionales ❌ (NO existen en la base de datos)

**No hay ninguna tabla** de:

- **Clientes / usuarios** — no hay tabla `users`/`customers`, ni autenticación.
- **Pedidos / órdenes** — no hay tabla `orders` ni `order_items`.
- **Pagos** — no hay tabla `payments` ni `transactions`.
- **Facturación** — no hay tabla `invoices`.
- **Carrito (persistente)** — no se guarda en BD.

Implicaciones de diseño observadas:

- El **carrito vive solo en el navegador** (`localStorage`, clave `products`), gestionado en
  [`public/script.js`](../public/script.js) y [`public/sproduct.html`](../public/sproduct.html).
  No se persiste en el servidor.
- "Completar la compra" **no crea ningún registro de pedido ni pago**. Lo único que ocurre en
  backend es **descontar stock** de `products` vía el endpoint `POST /api/update-stock`, y luego se
  vacía el `localStorage`.
- Es decir, la única "transacción" real contra la BD es un `UPDATE` de la columna `quantity`. No
  queda traza de quién compró, qué compró, cuándo ni por cuánto.

---

## 5. Lógica de pagos y datos sensibles (tarjetas)

### Dónde está la "lógica de pagos"

La lógica de pago es **puramente de frontend y simulada**. Está en:

- [`public/cart.html`](../public/cart.html): el formulario de pago (radio PayPal / Credit Card y los
  campos `cardNumber`, `cardExpiry`, `cardCvc`).
- [`public/script.js`](../public/script.js) (líneas ~184–285): manejo de la UI de pago, validación de
  la tarjeta y el botón "Complete Purchase".

Flujo real al "pagar" (`completePurchase`):

1. Valida formato de los campos de tarjeta con regex (`validateCardDetails`):
   - número = 16 dígitos, expiry = 4 dígitos, CVC = 3 dígitos.
2. Llama a `updateStock()` → `POST /api/update-stock` con los ítems del carrito.
3. Borra el carrito de `localStorage` y muestra `alert('Purchase completed successfully!')`.

### ¿Hay un procesador de pagos real? **No**

- **No hay integración con ninguna pasarela** (Stripe, PayPal SDK, etc.). El radio "PayPal" no hace
  nada con PayPal; solo muestra/oculta el formulario de tarjeta.
- **No hay backend de pagos.** El servidor no tiene endpoint de cobro; nunca recibe los datos de la
  tarjeta.

### Datos sensibles de tarjetas: ¿se almacenan? **No se almacenan, pero el diseño es inseguro**

- ✅ Los datos de la tarjeta (número, expiry, CVC) **no se guardan en la base de datos** ni se envían
  al backend: el endpoint `/api/update-stock` solo recibe `cartItems` (`id`, `quantity`).
- ✅ Tampoco se persisten en `localStorage` (solo se leen del DOM para validar y se descartan).
- ⚠️ Sin embargo, el formulario **captura PAN + CVC en texto plano en el cliente**. Si esto evoluciona
  a un sistema real, recoger CVC y número directamente implica entrar en el alcance de **PCI-DSS**. Lo
  correcto sería **nunca tocar el PAN/CVC** y delegar en un proveedor (Stripe Elements / PayPal) que
  tokenice la tarjeta.
- ⚠️ Además hay un **bug**: [`cart.html`](../public/cart.html) tiene un segundo listener inline sobre
  `completePurchase` que lee `localStorage.getItem('cart')` (clave inexistente; la real es
  `products`) y llama a `/update-stock` (ruta inexistente en `server.js`). Es código muerto/roto que
  convive con el handler real de `script.js`.

**Conclusión:** la app **no procesa pagos reales ni almacena tarjetas**; es una simulación de
checkout. No hay exposición de datos de tarjeta almacenados, pero el patrón de captura en frontend no
es apto para producción.

---

## 6. Construcción de queries y riesgo de SQL injection

### Dónde se construyen las queries

Todas las consultas SQL están centralizadas en [`api.js`](../api.js) (los handlers) y en
[`db.js`](../db.js) (creación de tabla y seed). El frontend **no** construye SQL; solo consume la API
REST por `fetch`.

Endpoints y sus queries (definidos en [`server.js`](../server.js)):

| Método / Ruta | Handler | Query |
|---------------|---------|-------|
| `GET /api/products` | `getProducts` | `SELECT * FROM products` |
| `GET /api/products/:id` | `getProductById` | `SELECT * FROM products WHERE id = ?` |
| `POST /api/cart` | `addToCart` | `UPDATE products SET quantity = ? WHERE id = ?` |
| `GET /api/cart` | `getCart` | `SELECT * FROM products WHERE quantity < 3` |
| `POST /api/update-stock` | `updateStock` | `SELECT ... WHERE id = ?` + `UPDATE ... WHERE id = ?` |

### Evaluación de riesgo de SQL injection: **bajo**

- ✅ **Todas** las consultas con datos de usuario usan **consultas parametrizadas** (placeholders `?`
  con array de parámetros), tanto en la versión SQLite actual (`db.get`/`db.all`/`db.run`) como en el
  diseño original MySQL (`db.execute`). No hay concatenación de strings con entradas del usuario para
  construir SQL.
- ✅ Las únicas entradas externas que llegan a la BD son `req.params.id` y el cuerpo JSON
  (`productId`, `quantity`, `cartItems[].id/quantity`), siempre vía parámetros enlazados.
- ⚠️ Observaciones menores (no SQLi, pero a revisar):
  - **Sin validación de tipos/rangos** en backend: `quantity` podría ser negativo, no numérico, etc.
    (riesgo de lógica de inventario, no de inyección).
  - [`routes.js`](../routes.js) define un router con rutas (`/cart`, `/api/products/:id`, etc.) que
    **no se monta en `server.js`** → es código muerto. Conviene no dejar rutas duplicadas/huérfanas.

---

## Resumen ejecutivo de hallazgos

| # | Hallazgo | Severidad |
|---|----------|-----------|
| 1 | Credenciales MySQL/RDS en texto plano en `.env` versionado; sin `.gitignore` | 🔴 Alta |
| 2 | No existe modelo transaccional: sin clientes, pedidos, pagos ni facturación en BD | 🟠 Media (funcional) |
| 3 | "Pago" es simulado en frontend; sin pasarela ni backend de pagos | 🟠 Media (funcional) |
| 4 | Captura de PAN/CVC en frontend (patrón no apto para producción / PCI) | 🟠 Media |
| 5 | Código muerto/roto: 2º listener en `cart.html`, `routes.js` sin montar | 🟡 Baja |
| 6 | Sin índices adicionales ni claves foráneas (solo 1 tabla, aún aceptable) | 🟡 Baja |
| 7 | SQL parametrizado en todos los handlers → riesgo de SQL injection bajo | 🟢 OK |
| 8 | `node_modules` versionado en git (ruido, repo pesado) | 🟡 Baja |

---

*Generado mediante análisis estático de los archivos del proyecto y de la base `shoes.db`. No se
realizaron cambios en el código ni en los datos.*
