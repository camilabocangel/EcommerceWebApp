// services/checkout.js — Checkout integrado PostgreSQL + MongoDB (enlace por UUID).
//
// Consistencia políglota (patrón saga / compensación):
//   1) Lee el carrito en Mongo por cliente_uuid.
//   2) Por cada item lee el producto en Mongo: precio para el snapshot y VALIDA stock.
//   3) Llama procesar_pago en Postgres (transacción ACID) con producto_uuid + precio
//      snapshot. Si esto falla, NADA se confirma (rollback de Postgres).
//   4) Tras el COMMIT de Postgres, descuenta el stock en Mongo y vacía el carrito.
//   5) Si el paso 4 (Mongo) falla DESPUÉS de cobrar en Postgres, NO podemos revertir
//      el pago automáticamente; registramos el incidente y marcamos el pedido en
//      estado 'revision' (compensación manual). El stock autoritativo vive en Mongo.
require('dotenv').config();
const mongo = require('../db/mongo');
const { pool, withClienteTx } = require('../db/postgres');
const { procesarPagoTx } = require('../db/pagos');

/** Registra el incidente de saga y marca el pedido para revisión (usa pool dueño). */
async function registrarIncidente(pedidoId, detalle) {
    await pool.query('UPDATE pedidos SET estado = $1 WHERE id = $2', ['revision', pedidoId]);
    await pool.query(
        'INSERT INTO incidentes_stock (pedido_id, detalle) VALUES ($1, $2)',
        [pedidoId, detalle]
    );
}

/**
 * Ejecuta el checkout del cliente.
 * @param {string} clienteUuid
 * @param {{ metodo: string, token?: string, ultimos4?: string }} pago
 */
async function checkout(clienteUuid, { metodo, token = null, ultimos4 = null }) {
    const db = await mongo.connect();
    const carritos = db.collection('carritos');
    const productos = db.collection('productos');

    // 1) Carrito
    const carrito = await carritos.findOne({ cliente_uuid: clienteUuid });
    if (!carrito || !Array.isArray(carrito.items) || carrito.items.length === 0) {
        const e = new Error('El carrito está vacío');
        e.status = 400;
        throw e;
    }

    // 2) Validar stock y construir items con snapshot de precio (todo ANTES de cobrar)
    const items = [];
    for (const it of carrito.items) {
        const prod = await productos.findOne({ uuid: it.producto_uuid });
        if (!prod) {
            const e = new Error(`Producto inexistente en catálogo: ${it.producto_uuid}`);
            e.status = 400;
            throw e;
        }
        if ((prod.quantity ?? 0) < it.cantidad) {
            const e = new Error(`Stock insuficiente para "${prod.nombre}" (disponible ${prod.quantity}, pedido ${it.cantidad})`);
            e.status = 409;
            throw e;
        }
        items.push({
            producto_uuid: it.producto_uuid,
            nombre_snapshot: `${prod.marca} ${prod.nombre}`,
            precio_unitario: prod.precio,
            cantidad: it.cantidad
        });
    }

    // 3) Cobro ACID en Postgres (pedido + items + pago + factura, atómico)
    const resultado = await withClienteTx(
        clienteUuid,
        (client) => procesarPagoTx(client, { clienteId: clienteUuid, items, metodo, token, ultimos4 }),
        { withCrypto: true }
    );

    // 4) Postgres CONFIRMADO. Ahora sincroniza Mongo: descuenta stock y vacía carrito.
    try {
        for (const it of items) {
            // El filtro {quantity: {$gte}} evita stock negativo por carreras.
            const upd = await productos.updateOne(
                { uuid: it.producto_uuid, quantity: { $gte: it.cantidad } },
                { $inc: { quantity: -it.cantidad } }
            );
            if (upd.modifiedCount !== 1) {
                throw new Error(`No se pudo descontar stock de ${it.producto_uuid}`);
            }
        }
        await carritos.updateOne(
            { cliente_uuid: clienteUuid },
            { $set: { items: [], actualizado_en: new Date() } }
        );
        return { ...resultado, estado: 'completado' };
    } catch (mongoErr) {
        // 5) COMPENSACIÓN: el pago ya se confirmó en Postgres pero Mongo falló.
        // No se revierte el cobro automáticamente; se deja traza y revisión manual.
        await registrarIncidente(resultado.pedido_id, `Fallo al actualizar stock en Mongo: ${mongoErr.message}`);
        return {
            ...resultado,
            estado: 'revision',
            advertencia: 'Pago confirmado pero el stock no se actualizó en Mongo; pedido marcado para revisión (saga).'
        };
    }
}

module.exports = { checkout };
