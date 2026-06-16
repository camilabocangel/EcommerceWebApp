// services/resumen.js — Vista 360 del cliente, unida por UUID en la capa de app.
// Postgres (RLS): datos del cliente + pedidos + items + facturas.
// Mongo: carrito + preferencias + detalle de productos (por producto_uuid).
const mongo = require('../db/mongo');
const { withClienteTx } = require('../db/postgres');

/** Busca en Mongo los productos de una lista de uuids → mapa uuid → datos. */
async function detallesProductos(uuids) {
    if (uuids.length === 0) return {};
    const db = await mongo.connect();
    const docs = await db.collection('productos')
        .find({ uuid: { $in: uuids } })
        .project({ _id: 0, uuid: 1, marca: 1, nombre: 1, precio: 1, imagen: 1, quantity: 1 })
        .toArray();
    return Object.fromEntries(docs.map(d => [d.uuid, d]));
}

async function resumen(clienteUuid) {
    // ---- PostgreSQL (todo dentro de una transacción con RLS por el UUID) ----
    const pg = await withClienteTx(clienteUuid, async (c) => {
        const cliente = (await c.query(
            'SELECT id, nombre, email, rol, fecha_registro FROM clientes WHERE id = $1',
            [clienteUuid]
        )).rows[0];

        // RLS limita pedidos a los del cliente actual
        const pedidos = (await c.query(
            'SELECT id, fecha, estado, total FROM pedidos ORDER BY fecha DESC'
        )).rows;

        for (const p of pedidos) {
            p.items = (await c.query(
                `SELECT producto_uuid, nombre_snapshot, precio_unitario, cantidad, subtotal
                 FROM pedido_items WHERE pedido_id = $1`, [p.id]
            )).rows;
            // facturas no tiene RLS propia: se acota con JOIN a pedidos (que sí la tiene)
            p.factura = (await c.query(
                `SELECT f.numero, f.fecha_emision, f.subtotal, f.impuestos, f.total
                 FROM facturas f JOIN pedidos pe ON pe.id = f.pedido_id
                 WHERE f.pedido_id = $1`, [p.id]
            )).rows[0] || null;
        }
        return { cliente, pedidos };
    });

    // ---- MongoDB: carrito + preferencias ----
    const db = await mongo.connect();
    const carrito = await db.collection('carritos').findOne({ cliente_uuid: clienteUuid })
        || { cliente_uuid: clienteUuid, items: [] };
    const prefDoc = await db.collection('preferencias').findOne({ cliente_uuid: clienteUuid })
        || { cliente_uuid: clienteUuid, preferencias: {} };

    // ---- Detalle de productos (enlace por producto_uuid) para carrito y pedidos ----
    const uuids = new Set();
    carrito.items.forEach(i => uuids.add(i.producto_uuid));
    pg.pedidos.forEach(p => p.items.forEach(i => uuids.add(i.producto_uuid)));
    const detalles = await detallesProductos([...uuids]);

    const carritoEnriquecido = carrito.items.map(i => ({
        producto_uuid: i.producto_uuid,
        cantidad: i.cantidad,
        producto: detalles[i.producto_uuid] || null
    }));
    pg.pedidos.forEach(p => p.items.forEach(i => { i.producto = detalles[i.producto_uuid] || null; }));

    // ---- Vista 360 unificada ----
    return {
        cliente: pg.cliente,
        enlace_uuid: clienteUuid,
        postgres: {
            pedidos: pg.pedidos
        },
        mongo: {
            carrito: { items: carritoEnriquecido },
            preferencias: prefDoc.preferencias || {}
        }
    };
}

module.exports = { resumen };
