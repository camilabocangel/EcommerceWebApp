// scripts/verificar_postgres.js — Verificación del módulo transaccional.
// 1) Pago EXITOSO (deja pedido+items+pago+factura)
// 2) Pago que FALLA a mitad → ROLLBACK total (0 filas nuevas)
// 3) RBAC: app_cliente NO puede leer el token; app_admin sí (y lo descifra)
//
// Para los items usa uuids REALES de productos ya presentes en MongoDB
// (solo se leen los uuids como datos de prueba; no es la integración de Fase 4).
//
// Uso: node scripts/verificar_postgres.js
require('dotenv').config();
const { pool, getPool, closeAll } = require('../db/postgres');
const mongo = require('../db/mongo');
const { procesarPago } = require('../db/pagos');

async function uuidsDePrueba() {
    const db = await mongo.connect();
    const docs = await db.collection('productos').find().sort({ legacy_id: 1 }).limit(2).toArray();
    await mongo.close();
    return docs.map(d => ({
        producto_uuid: d.uuid,
        nombre_snapshot: `${d.marca} ${d.nombre}`,
        precio_unitario: d.precio
    }));
}

const count = async (tabla) =>
    (await pool.query(`SELECT count(*)::int AS n FROM ${tabla}`)).rows[0].n;

async function main() {
    const cliente = (await pool.query(
        "SELECT id, nombre FROM clientes WHERE rol = 'cliente' ORDER BY fecha_registro LIMIT 1"
    )).rows[0];
    if (!cliente) throw new Error('No hay cliente de prueba. Corre primero scripts/seed_postgres.js');
    const prods = await uuidsDePrueba();
    console.log('Cliente de prueba:', cliente.nombre, cliente.id);
    console.log('Productos (uuid reales de Mongo):');
    prods.forEach(p => console.log(`  ${p.producto_uuid}  ${p.nombre_snapshot}  $${p.precio_unitario}`));

    // ---------- 1) PAGO EXITOSO ----------
    console.log('\n========== 1) PAGO EXITOSO ==========');
    const itemsOk = [{ ...prods[0], cantidad: 2 }, { ...prods[1], cantidad: 1 }];
    const res = await procesarPago({
        clienteId: cliente.id, items: itemsOk,
        metodo: 'tarjeta', token: '4111111111111111', ultimos4: '1111', rol: 'cliente'
    });
    console.log('procesar_pago →', res);

    const pedido = (await pool.query('SELECT estado, total FROM pedidos WHERE id = $1', [res.pedido_id])).rows[0];
    const items = (await pool.query(
        'SELECT nombre_snapshot, precio_unitario, cantidad, subtotal FROM pedido_items WHERE pedido_id = $1 ORDER BY nombre_snapshot', [res.pedido_id])).rows;
    const pago = (await pool.query(
        `SELECT metodo, monto, estado, ultimos4,
                (token_tarjeta IS NOT NULL) AS token_guardado,
                octet_length(token_tarjeta) AS token_bytes
         FROM pagos WHERE pedido_id = $1`, [res.pedido_id])).rows[0];
    const factura = (await pool.query(
        'SELECT numero, subtotal, impuestos, total FROM facturas WHERE pedido_id = $1', [res.pedido_id])).rows[0];
    console.log('  pedido :', pedido);
    console.log('  items  :', items);
    console.log('  pago   :', pago, '(token NO en claro: guardado cifrado)');
    console.log('  factura:', factura);

    // ---------- 2) PAGO QUE FALLA → ROLLBACK ----------
    console.log('\n========== 2) PAGO QUE FALLA (ROLLBACK) ==========');
    const antes = { pedidos: await count('pedidos'), items: await count('pedido_items'), pagos: await count('pagos'), facturas: await count('facturas') };
    const itemsBad = [{ ...prods[0], cantidad: 1 }, { ...prods[1], cantidad: -5 }]; // -5 fuerza el error a mitad
    try {
        await procesarPago({
            clienteId: cliente.id, items: itemsBad,
            metodo: 'tarjeta', token: '4111111111111111', ultimos4: '1111', rol: 'cliente'
        });
        console.log('  ⚠️ ERROR: no debió completar');
    } catch (e) {
        console.log('  Excepción esperada →', e.message.split('\n')[0]);
    }
    const despues = { pedidos: await count('pedidos'), items: await count('pedido_items'), pagos: await count('pagos'), facturas: await count('facturas') };
    console.log('  conteos antes :', antes);
    console.log('  conteos despues:', despues);
    const sinCambios = JSON.stringify(antes) === JSON.stringify(despues);
    console.log(`  → ${sinCambios ? 'ROLLBACK OK: 0 filas persistidas' : 'FALLO: se persistieron filas'}`);

    // ---------- 3) RBAC sobre el token ----------
    console.log('\n========== 3) RBAC: lectura del token de tarjeta ==========');
    const pagoId = (await pool.query('SELECT id FROM pagos WHERE pedido_id = $1', [res.pedido_id])).rows[0].id;

    // app_cliente
    const cc = await getPool('cliente').connect();
    try {
        // is_local=false → persiste en la sesión de esta conexión dedicada
        await cc.query("SELECT set_config('app.current_cliente', $1, false)", [cliente.id]);
        const permitido = (await cc.query('SELECT id, metodo, ultimos4 FROM pagos WHERE id = $1', [pagoId])).rows[0];
        console.log('  app_cliente lee columnas permitidas →', permitido);
        try {
            await cc.query('SELECT token_tarjeta FROM pagos WHERE id = $1', [pagoId]);
            console.log('  ⚠️ FALLO: app_cliente pudo leer el token');
        } catch (e) {
            console.log('  app_cliente NO puede leer token →', e.message.split('\n')[0]);
        }
    } finally { cc.release(); }

    // app_admin
    const ca = await getPool('admin').connect();
    try {
        await ca.query("SELECT set_config('app.crypto_key', $1, false)", [process.env.PG_CRYPTO_KEY]);
        const bytes = (await ca.query('SELECT octet_length(token_tarjeta) AS b FROM pagos WHERE id = $1', [pagoId])).rows[0].b;
        console.log('  app_admin lee token cifrado (bytes) →', bytes);
        const pan = (await ca.query('SELECT descifrar_token($1) AS pan', [pagoId])).rows[0].pan;
        console.log('  app_admin descifra token →', pan, `(últimos4 = ${pan.slice(-4)})`);
    } finally { ca.release(); }

    await closeAll();
    console.log('\nVerificación completa.');
}

main().catch(async (err) => {
    console.error('Error en la verificación:', err);
    try { await closeAll(); } catch (_) {}
    try { await mongo.close(); } catch (_) {}
    process.exit(1);
});
