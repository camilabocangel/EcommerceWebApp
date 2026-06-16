// db/pagos.js — Capa Node sobre la transacción ACID `procesar_pago` de PostgreSQL.
// TODAS las consultas son parametrizadas ($1, $2, ...). Cero concatenación de strings.
// Los GUC (app.current_cliente, app.crypto_key) se fijan con SET LOCAL dentro de la
// transacción (ver db/postgres.js → withClienteTx); no se filtran entre peticiones.
require('dotenv').config();
const { withClienteTx } = require('./postgres');

/**
 * Ejecuta `procesar_pago` usando un cliente PG que YA está dentro de una transacción
 * con los GUC fijados (app.current_cliente y app.crypto_key). Útil para el checkout,
 * que controla la transacción para coordinar con MongoDB.
 *
 * @param {import('pg').PoolClient} client
 * @param {object} p - { clienteId, items, metodo, token, ultimos4 }
 * @returns {Promise<object>} resumen del pago
 */
async function procesarPagoTx(client, { clienteId, items, metodo, token = null, ultimos4 = null }) {
    const { rows } = await client.query(
        'SELECT procesar_pago($1, $2::jsonb, $3, $4, $5) AS resultado',
        [clienteId, JSON.stringify(items), metodo, token, ultimos4]
    );
    return rows[0].resultado;
}

/**
 * Procesa un pago de forma atómica abriendo su propia transacción (BEGIN/COMMIT con
 * SET LOCAL de los GUC). Si algo falla, withClienteTx hace ROLLBACK de todo.
 *
 * @param {object} opts - { clienteId, items, metodo, token, ultimos4 }
 * @returns {Promise<object>} resumen { pedido_id, factura_id, numero_factura, subtotal, impuestos, total }
 */
async function procesarPago({ clienteId, items, metodo, token = null, ultimos4 = null }) {
    return withClienteTx(
        clienteId,
        (client) => procesarPagoTx(client, { clienteId, items, metodo, token, ultimos4 }),
        { withCrypto: true }
    );
}

module.exports = { procesarPago, procesarPagoTx };
