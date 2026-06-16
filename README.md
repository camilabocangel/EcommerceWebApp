# E-commerce de zapatillas — Persistencia políglota (PostgreSQL + MongoDB)

Aplicación Node.js/Express con **persistencia políglota**:

- **PostgreSQL** → datos transaccionales (clientes, pedidos, pagos, facturas) con
  ACID, 3NF, RBAC, RLS y cifrado de tarjeta (`pgcrypto`).
- **MongoDB** → catálogo de productos (esquema dinámico, etiquetas, variantes,
  vistas) + carrito y preferencias por cliente.
- Ambos motores se enlazan por **UUID** (cliente y producto).

> Arquitectura y diagramas: [docs/arquitectura.md](docs/arquitectura.md).
> Diagnóstico inicial y plan: [docs/diagnostico.md](docs/diagnostico.md),
> [docs/plan_migracion.md](docs/plan_migracion.md).
> Consultas MongoDB de ejemplo: [docs/consultas_mongo.md](docs/consultas_mongo.md).

---

## Requisitos

- **Node.js** 18+ (probado en 20)
- **Docker Desktop** (para PostgreSQL 16 y MongoDB 7 vía `docker-compose.yml`)

## Configuración del entorno (`.env`)

Copia la plantilla y ajusta si hace falta:

```bash
cp .env.example .env
```

Variables principales ([.env.example](.env.example)):

| Variable | Uso |
|----------|-----|
| `POSTGRES_*` | host/puerto/usuario/clave/base de PostgreSQL |
| `PG_CRYPTO_KEY` | clave simétrica para cifrar el token de tarjeta (pgcrypto) |
| `PG_ROLE_CLIENTE_PASSWORD` / `_VENDEDOR_` / `_ADMIN_` | contraseñas de los roles RBAC |
| `MONGO_*` | host/puerto/usuario/clave/base de MongoDB (**puerto host 27018**) |
| `JWT_SECRET` | secreto para firmar los JWT de sesión |

> El puerto host de Mongo es **27018** (el 27017 puede estar ocupado por otro
> contenedor en la máquina). Dentro del contenedor sigue siendo 27017.

---

## Puesta en marcha "desde cero"

```bash
npm install        # dependencias
npm run setup      # levanta contenedores + schema + carga catálogo + seed
node server.js     # arranca la app en http://localhost:3000
npm run demo       # verificación end-to-end (en otra terminal)
```

`npm run setup` encadena:

| Script | Acción |
|--------|--------|
| `npm run db:up` | `docker compose up -d --wait` (Postgres 16 + Mongo 7, espera healthy) |
| `npm run db:schema` | aplica [db/sql/schema.sql](db/sql/schema.sql) (tablas 3NF, FKs, índices, pgcrypto, RBAC, RLS, funciones) |
| `npm run db:mongo` | [scripts/migrar_a_mongo.js](scripts/migrar_a_mongo.js): carga los 24 productos desde SQLite, los enriquece y crea índices + vistas |
| `npm run db:seed` | [scripts/seed_postgres.js](scripts/seed_postgres.js): clientes de prueba (bcrypt) |

Otros:

| Script | Acción |
|--------|--------|
| `npm start` | arranca el servidor (`node server.js`) |
| `npm run demo` | [scripts/verificar_integracion.js](scripts/verificar_integracion.js): register → login → carrito → checkout → vista 360 |

> Todos los scripts de datos son **idempotentes**: se pueden re-ejecutar sin duplicar.

---

## Credenciales de prueba

Clientes sembrados (`npm run db:seed`) — login en `/login.html` o `POST /api/login`:

| Rol | Email | Contraseña |
|-----|-------|-----------|
| cliente | `ana.cliente@example.com` | `Cliente123!` |
| vendedor | `victor.vendedor@example.com` | `Vendedor123!` |
| admin | `alma.admin@example.com` | `Admin123!` |

`npm run demo` además registra/usa `e2e.cliente@example.com` / `E2e123!`.

Roles de base de datos (RBAC, conexión de la app a Postgres): `app_cliente`,
`app_vendedor`, `app_admin` (contraseñas en `.env`).

---

## Endpoints principales

| Método | Ruta | Descripción | Auth |
|--------|------|-------------|------|
| POST | `/api/register` | crea cliente (bcrypt) | — |
| POST | `/api/login` | devuelve JWT + datos del cliente | — |
| GET | `/api/products` · `/api/products/:id` | catálogo (Mongo) | — |
| GET/POST/DELETE | `/api/cart` | carrito por `cliente_uuid` (Mongo) | JWT |
| GET/PUT | `/api/preferences` | preferencias del cliente (Mongo) | JWT |
| POST | `/api/checkout` | compra integrada (saga Mongo↔Postgres) | JWT |
| GET | `/api/clientes/:uuid/resumen` | vista 360 (Postgres + Mongo) | JWT |

---

## Tabla de cumplimiento (requisitos → implementación)

| # | Requisito | Dónde está implementado |
|---|-----------|-------------------------|
| 1 | **3NF** (columnas atómicas, sin dependencias transitivas) | [db/sql/schema.sql](db/sql/schema.sql) — tablas `clientes`, `direcciones`, `pedidos`, `pedido_items` (subtotal GENERATED), `pagos`, `facturas`; comentarios 3NF por tabla |
| 2 | **Transacción ACID** | función PL/pgSQL `procesar_pago()` en [db/sql/schema.sql](db/sql/schema.sql); ROLLBACK total ante error |
| 3 | **Cifrado de tarjeta** (sin PAN/CVC en claro) | `pgcrypto` + `pgp_sym_encrypt`; en `pagos`: `ultimos4` en claro y `token_tarjeta` BYTEA cifrado; `descifrar_token()` solo para admin |
| 4 | **RBAC** (roles diferenciados) | roles `app_cliente` / `app_vendedor` / `app_admin` con GRANT por tabla/columna en [db/sql/schema.sql](db/sql/schema.sql); la app conecta según rol ([db/postgres.js](db/postgres.js)) |
| 4b | **RLS** (aislamiento por cliente) | políticas `pedidos_propios` / `pagos_propios` con `app.current_cliente`; `withClienteTx` ([db/postgres.js](db/postgres.js)) usa `SET LOCAL` por transacción |
| 5 | **Anti SQL-injection** | TODAS las consultas Node son parametrizadas (`$1,$2…`): [db/pagos.js](db/pagos.js), [services/*](services/), [api.js](api.js); cero concatenación |
| 6 | **Esquema dinámico BSON** | `atributos` por tipo de zapatilla en [scripts/migrar_a_mongo.js](scripts/migrar_a_mongo.js) (skate/running/basket/formal/…); documentos de `productos` |
| 7 | **Consultas `$gt`/`$lt`/`$and`/`$or`** | [docs/consultas_mongo.md](docs/consultas_mongo.md) (ejecutables, verificadas no vacías) + vista `vista_reporte_premium` |
| 8 | **Manejo de arreglos** (`$in`, `$elemMatch`) | sobre `etiquetas`, `industria`, `variantes`; [docs/consultas_mongo.md](docs/consultas_mongo.md) |
| 9 | **Vistas MongoDB** | `vista_ofertas`, `vista_skate`, `vista_reporte_premium` creadas en [scripts/migrar_a_mongo.js](scripts/migrar_a_mongo.js) |
| 10 | **Integración por UUID (API)** | UUID de cliente (JWT/RLS) y de producto (`pedido_items.producto_uuid` ↔ `productos.uuid`); checkout [services/checkout.js](services/checkout.js) y vista 360 [services/resumen.js](services/resumen.js) |
| 11 | **Consistencia políglota** (saga/compensación) | [services/checkout.js](services/checkout.js): validar → cobrar ACID → sincronizar Mongo → compensar con `incidentes_stock` + estado `revision` |

---

## Estructura del proyecto

```
EcommerceWebApp/
├── server.js                 # Express: rutas + middleware JWT + arranque
├── api.js                    # catálogo (Mongo) + compat update-stock
├── db/
│   ├── mongo.js              # cliente MongoDB
│   ├── postgres.js           # pools por rol + withClienteTx (GUC por transacción)
│   ├── pagos.js              # wrapper de procesar_pago (parametrizado)
│   ├── carrito.js            # carrito (Mongo)
│   ├── preferencias.js       # preferencias (Mongo)
│   └── sql/schema.sql        # esquema PostgreSQL completo
├── services/
│   ├── auth.js               # register/login (bcrypt+JWT) + requireAuth
│   ├── checkout.js           # checkout integrado (saga)
│   └── resumen.js            # vista 360
├── scripts/
│   ├── migrar_a_mongo.js     # carga + enriquecimiento + índices + vistas
│   ├── seed_postgres.js      # clientes de prueba (bcrypt)
│   ├── verificar_postgres.js # verificación módulo transaccional
│   └── verificar_integracion.js # verificación end-to-end (Fase 4)
├── public/                   # frontend (login, shop, cart, sproduct, auth.js)
├── docs/                     # diagnóstico, plan, arquitectura, consultas
├── docker-compose.yml        # postgres:16 + mongo:7
└── .env.example              # plantilla de variables
```

---

## Notas

- El antiguo `shoes.db` (SQLite) se conserva solo como **fuente de datos para la
  migración** del catálogo a Mongo; la app ya no lo usa para servir el catálogo.
- El stock autoritativo vive en MongoDB; el viejo `/api/update-stock` se redirige a
  Mongo por compatibilidad.

### Alcance del catálogo (nota honesta)

El dominio del catálogo es **calzado** por una decisión de alcance: se usaron los
**datos reales ya existentes** del proyecto (24 zapatillas migradas desde `shoes.db`),
sin inventar productos. El enunciado menciona categorías de negocio variadas
(ropa/electrónica/muebles/…); en este proyecto, el requisito de **esquema dinámico
BSON** se evidencia con **atributos heterogéneos por TIPO de zapatilla** (skate,
running, basketball, formal, trail, entrenamiento, lifestyle — cada uno con su propio
sub-documento `atributos`), y las **vistas filtran por etiqueta** según la indicación
de la docente (`vista_ofertas`, `vista_skate`, `vista_reporte_premium`). Ver
[docs/auditoria.md](docs/auditoria.md) ítem 10.
