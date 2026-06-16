// db/carrito.js — Carrito por cliente en MongoDB (colección `carritos`).
// Un documento por cliente: { cliente_uuid, items: [{producto_uuid, cantidad}], actualizado_en }
const mongo = require('./mongo');

async function col() {
    const db = await mongo.connect();
    return db.collection('carritos');
}

async function ensureIndexes() {
    const c = await col();
    await c.createIndex({ cliente_uuid: 1 }, { unique: true });
}

/** Devuelve el carrito del cliente (o uno vacío si no existe). */
async function getCarrito(clienteUuid) {
    const c = await col();
    const doc = await c.findOne({ cliente_uuid: clienteUuid });
    return doc || { cliente_uuid: clienteUuid, items: [] };
}

/**
 * Agrega `cantidad` del producto al carrito (incrementa si ya existe).
 * Consultas con filtros/operadores; sin construir strings.
 */
async function agregarItem(clienteUuid, productoUuid, cantidad) {
    const c = await col();
    // 1) Si el item ya existe, incrementa su cantidad.
    const inc = await c.updateOne(
        { cliente_uuid: clienteUuid, 'items.producto_uuid': productoUuid },
        { $inc: { 'items.$.cantidad': cantidad }, $set: { actualizado_en: new Date() } }
    );
    if (inc.matchedCount === 0) {
        // 2) Si no existía (o el carrito no existe), inserta el item (upsert del doc).
        await c.updateOne(
            { cliente_uuid: clienteUuid },
            {
                $push: { items: { producto_uuid: productoUuid, cantidad } },
                $set: { actualizado_en: new Date() },
                $setOnInsert: { cliente_uuid: clienteUuid }
            },
            { upsert: true }
        );
    }
    return getCarrito(clienteUuid);
}

/** Quita un producto del carrito. */
async function quitarItem(clienteUuid, productoUuid) {
    const c = await col();
    await c.updateOne(
        { cliente_uuid: clienteUuid },
        { $pull: { items: { producto_uuid: productoUuid } }, $set: { actualizado_en: new Date() } }
    );
    return getCarrito(clienteUuid);
}

/** Vacía el carrito del cliente. */
async function vaciar(clienteUuid) {
    const c = await col();
    await c.updateOne(
        { cliente_uuid: clienteUuid },
        { $set: { items: [], actualizado_en: new Date() }, $setOnInsert: { cliente_uuid: clienteUuid } },
        { upsert: true }
    );
    return getCarrito(clienteUuid);
}

module.exports = { ensureIndexes, getCarrito, agregarItem, quitarItem, vaciar };
