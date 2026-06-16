// db/preferencias.js — Preferencias por cliente en MongoDB (colección `preferencias`).
// Un documento por cliente: { cliente_uuid, preferencias: {...}, actualizado_en }
const mongo = require('./mongo');

async function col() {
    const db = await mongo.connect();
    return db.collection('preferencias');
}

async function ensureIndexes() {
    const c = await col();
    await c.createIndex({ cliente_uuid: 1 }, { unique: true });
}

/** Devuelve las preferencias del cliente (objeto vacío si no existen). */
async function getPreferencias(clienteUuid) {
    const c = await col();
    const doc = await c.findOne({ cliente_uuid: clienteUuid });
    return doc || { cliente_uuid: clienteUuid, preferencias: {} };
}

/** Reemplaza (PUT) las preferencias del cliente. */
async function setPreferencias(clienteUuid, preferencias) {
    const c = await col();
    await c.updateOne(
        { cliente_uuid: clienteUuid },
        {
            $set: { preferencias, actualizado_en: new Date() },
            $setOnInsert: { cliente_uuid: clienteUuid }
        },
        { upsert: true }
    );
    return getPreferencias(clienteUuid);
}

module.exports = { ensureIndexes, getPreferencias, setPreferencias };
