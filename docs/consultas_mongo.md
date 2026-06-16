# Consultas MongoDB — catálogo `ecommerce_multitienda.productos`

Ejemplos **ejecutables** que demuestran los operadores requeridos: `$gt`, `$lt`, `$and`, `$or`,
`$in` y `$elemMatch`, sobre los campos array `etiquetas`, `variantes` e `industria`.

Todas las consultas de este documento fueron verificadas y **devuelven al menos 1 documento**
(ninguna sale vacía).

## Cómo ejecutarlas

Abrir una shell de Mongo dentro del contenedor:

```bash
docker exec -it ecommerce_mongo mongosh \
  -u ecommerce_user -p mongo_local_dev --authenticationDatabase admin \
  ecommerce_multitienda
```

> Usuario/clave provienen de `.env` (`MONGO_USER` / `MONGO_PASSWORD`).

---

## 1. `$gt` y `$lt` (comparación numérica sobre `precio`)

```js
// Productos premium: precio mayor a 150  → 5 docs
db.productos.find({ precio: { $gt: 150 } }, { nombre: 1, precio: 1, _id: 0 })

// Ofertas: precio menor a 100            → 4 docs
db.productos.find({ precio: { $lt: 100 } }, { nombre: 1, precio: 1, _id: 0 })

// Rango (combinando ambos): 100 < precio < 150  → varios docs
db.productos.find({ precio: { $gt: 100, $lt: 150 } }, { nombre: 1, precio: 1, _id: 0 })
```

## 2. `$and` (todas las condiciones)

```js
// Precio > 100 Y lanzados en 2023 o después  → 12 docs
db.productos.find({
  $and: [
    { precio: { $gt: 100 } },
    { year:   { $gte: 2023 } }
  ]
}, { nombre: 1, precio: 1, year: 1, _id: 0 })
```

## 3. `$or` (alguna de las condiciones)

```js
// Zapatillas de skate O de basketball  → 3 docs
db.productos.find({
  $or: [
    { etiquetas: "tipo:skate" },
    { etiquetas: "tipo:basketball" }
  ]
}, { nombre: 1, etiquetas: 1, _id: 0 })
```

## 4. `$and` + `$or` + `$gt` + `$lt` combinados (igual que `vista_reporte_premium`)

```js
// precio entre (100, 200) Y (destacado O year >= 2023)  → 17 docs
db.productos.find({
  $and: [
    { precio: { $gt: 100 } },
    { precio: { $lt: 200 } },
    { $or: [ { destacado: true }, { year: { $gte: 2023 } } ] }
  ]
}, { nombre: 1, precio: 1, year: 1, destacado: 1, _id: 0 })
```

## 5. `$in` sobre arrays

```js
// etiquetas: productos Nike O Adidas (campo array `etiquetas`)  → 8 docs
db.productos.find({
  etiquetas: { $in: ["marca:nike", "marca:adidas"] }
}, { nombre: 1, etiquetas: 1, _id: 0 })

// industria: productos del rubro "deportivo" (campo array `industria`)  → 9 docs
db.productos.find({
  industria: { $in: ["deportivo"] }
}, { nombre: 1, industria: 1, _id: 0 })

// etiquetas: ofertas económicas O colaboraciones yeezy  → varios docs
db.productos.find({
  etiquetas: { $in: ["precio:economico", "colab:yeezy"] }
}, { nombre: 1, etiquetas: 1, _id: 0 })
```

## 6. `$elemMatch` sobre array de objetos `variantes`

```js
// Productos con una variante talla 42 y stock disponible (>0)  → 24 docs
db.productos.find({
  variantes: { $elemMatch: { talla: 42, stock: { $gt: 0 } } }
}, { nombre: 1, variantes: 1, _id: 0 })

// Productos con alguna variante talla 41 cuyo stock sea >= 1  → 24 docs
db.productos.find({
  variantes: { $elemMatch: { talla: 41, stock: { $gte: 1 } } }
}, { nombre: 1, variantes: 1, _id: 0 })
```

> `$elemMatch` exige que **un mismo** elemento del array cumpla **todas** las condiciones
> (talla 42 **y** stock>0 en la misma variante), a diferencia de combinar condiciones sueltas.

## 7. Consultas sobre las VISTAS (definidas en `scripts/migrar_a_mongo.js`)

```js
db.vista_ofertas.find({}, { nombre: 1, precio: 1, etiquetas: 1, _id: 0 })          // 4 docs
db.vista_skate.find({}, { nombre: 1, etiquetas: 1, _id: 0 })                       // 1 doc
db.vista_reporte_premium.find({}, { nombre: 1, precio: 1, year: 1, _id: 0 })       // 17 docs
```

---

## Resumen de verificación (conteos reales)

| Consulta / Vista | Operadores | Docs |
|------------------|-----------|-----:|
| `precio > 150` | `$gt` | 5 |
| `precio < 100` | `$lt` | 4 |
| `precio > 100 AND year >= 2023` | `$and` | 12 |
| `skate OR basketball` | `$or` | 3 |
| `etiquetas IN [nike, adidas]` | `$in` (array `etiquetas`) | 8 |
| `industria IN [deportivo]` | `$in` (array `industria`) | 9 |
| `variantes elemMatch talla42 & stock>0` | `$elemMatch` (array `variantes`) | 24 |
| **`vista_ofertas`** | etiqueta económica | 4 |
| **`vista_skate`** | etiqueta/tipo skate | 1 |
| **`vista_reporte_premium`** | `$and`+`$or`+`$gt`+`$lt` | 17 |

*Ninguna consulta devuelve resultado vacío.*
