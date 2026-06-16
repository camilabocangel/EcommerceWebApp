# Paquete de entrega — E-commerce con persistencia políglota

E-commerce de calzado con **PostgreSQL** (transaccional) + **MongoDB** (catálogo),
enlazados por **UUID**. Este documento mapea los 3 entregables del enunciado a sus
archivos y explica cómo arrancar y probar el proyecto.

---

## Requisitos

- **Docker Desktop** (PostgreSQL 16 y MongoDB 7 vía `docker-compose.yml`)
- **Node.js** 18+ (probado en 20)

## Arranque (desde cero)

```bash
npm install
cp .env.example .env        # ajusta valores si hace falta (trae defaults de desarrollo)
npm run setup               # docker compose up -d --wait + schema.sql + catálogo Mongo + seed
node server.js              # app en http://localhost:3000
npm run demo                # (otra terminal) prueba end-to-end
```

👉 **URL:** http://localhost:3000  ·  Login: http://localhost:3000/login.html

## Credenciales de prueba

| Rol | Email | Contraseña |
|-----|-------|-----------|
| cliente | `ana.cliente@example.com` | `Cliente123!` |
| vendedor | `victor.vendedor@example.com` | `Vendedor123!` |
| admin | `alma.admin@example.com` | `Admin123!` |

Tarjeta de prueba (checkout): `4111111111111111`, venc. `1230`, CVC `123`.

---

## Los 3 entregables → archivos

### 1. Script de creación de bases de datos
- **PostgreSQL:** [db/sql/schema.sql](db/sql/schema.sql) — tablas en 3NF, FKs, índices,
  `pgcrypto`, RBAC, RLS y funciones `procesar_pago()` / `descifrar_token()`.
- **MongoDB:** [scripts/migrar_a_mongo.js](scripts/migrar_a_mongo.js) — carga el catálogo
  desde **`shoes.db`** (SQLite), lo enriquece (atributos por tipo, etiquetas, variantes),
  crea índices y las **vistas**.
- **Orquestación:** `npm run setup` (encadena `db:up` → `db:schema` → `db:mongo` →
  `db:seed`). Scripts en [package.json](package.json).

### 2. Documentación de arquitectura (diagrama de flujo de datos)
- [docs/arquitectura.md](docs/arquitectura.md) — **diagrama de flujo de datos**
  ([docs/img/flujo_datos.png](docs/img/flujo_datos.png)) y **diagrama de secuencia del
  checkout (saga)** ([docs/img/secuencia_checkout.png](docs/img/secuencia_checkout.png))
  como **imágenes PNG** embebidas (con la fuente Mermaid incluida), más la justificación
  de motores, el enlace por UUID y la estrategia de consistencia políglota.
- [README.md](README.md) — guía completa, endpoints y **tabla de cumplimiento** de
  requisitos.
- Apoyo: [docs/diagnostico.md](docs/diagnostico.md), [docs/plan_migracion.md](docs/plan_migracion.md),
  [docs/consultas_mongo.md](docs/consultas_mongo.md), [docs/auditoria.md](docs/auditoria.md),
  [docs/DEMO.md](docs/DEMO.md).

> Los diagramas están como **imágenes PNG** en `docs/img/` (`flujo_datos.png`,
> `secuencia_checkout.png`) y embebidos en `arquitectura.md`; la fuente Mermaid también
> se conserva en `docs/img/*.mmd` y dentro del propio documento.

### 3. API que demuestra integración y sincronización
- [server.js](server.js) — rutas Express + middleware JWT.
- [services/](services/) — `auth.js` (login/registro), `checkout.js` (saga
  Mongo↔Postgres), `resumen.js` (vista 360).
- [docs/DEMO.md](docs/DEMO.md) — guía de demostración con comandos reales.
- `npm run demo` ([scripts/verificar_integracion.js](scripts/verificar_integracion.js)) —
  prueba end-to-end: register → login → carrito → checkout → stock que baja → vista 360.
- **Endpoint estrella:** `GET /api/clientes/:uuid/resumen` — une por UUID los pedidos y
  facturas (Postgres) con el carrito, preferencias y detalle de productos (Mongo).

---

## Estructura del paquete

```
db/sql/schema.sql            Esquema PostgreSQL (3NF, ACID, RBAC, RLS, pgcrypto)
db/*.js                      Conexiones y módulos (postgres, mongo, pagos, carrito, preferencias)
scripts/                     migrar_a_mongo, seed_postgres, verificar_postgres, verificar_integracion
services/                    auth, checkout, resumen
server.js, api.js            App Express + handlers de catálogo
public/                      Frontend (login, shop, sproduct, cart, auth.js, ...)
docs/                        Documentación (arquitectura, DEMO, auditoría, ...)
docker-compose.yml           Postgres 16 + Mongo 7
shoes.db                     Fuente SQLite para la migración del catálogo a Mongo
.env.example                 Plantilla de variables (sin secretos)
```

> `node_modules/`, `.env` y `.git/` se excluyen del paquete. Reinstala con `npm install`
> y crea tu `.env` a partir de `.env.example`.
