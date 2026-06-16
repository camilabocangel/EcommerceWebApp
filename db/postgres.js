// db/postgres.js — Conexiones a PostgreSQL (datos transaccionales)
// Lee la configuración desde variables de entorno (.env).
// Expone:
//   - pool        : pool del usuario dueño (POSTGRES_USER) para setup/migraciones
//   - getPool(rol): pool que se conecta con el ROL RBAC indicado
//                   ('cliente' | 'vendedor' | 'admin')
require('dotenv').config();
const { Pool } = require('pg');

// Configuración común (host/puerto/base) — el usuario/clave varía por rol
const base = {
    host: process.env.POSTGRES_HOST || 'localhost',
    port: Number(process.env.POSTGRES_PORT) || 5432,
    database: process.env.POSTGRES_DB,
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000
};

// Pool del dueño/superusuario (solo para setup, seed y verificación)
const pool = new Pool({
    ...base,
    user: process.env.POSTGRES_USER,
    password: process.env.POSTGRES_PASSWORD
});
pool.on('error', (err) => console.error('Error en pool PostgreSQL (owner):', err));

// Credenciales de los roles RBAC con los que se conecta la app
const ROLE_CREDS = {
    cliente:  { user: 'app_cliente',  password: process.env.PG_ROLE_CLIENTE_PASSWORD },
    vendedor: { user: 'app_vendedor', password: process.env.PG_ROLE_VENDEDOR_PASSWORD },
    admin:    { user: 'app_admin',    password: process.env.PG_ROLE_ADMIN_PASSWORD }
};

const rolePools = {};

/**
 * Devuelve (y cachea) un pool conectado con el rol RBAC indicado.
 * @param {'cliente'|'vendedor'|'admin'} rol
 */
function getPool(rol) {
    if (!ROLE_CREDS[rol]) {
        throw new Error(`Rol RBAC desconocido: ${rol}`);
    }
    if (!rolePools[rol]) {
        rolePools[rol] = new Pool({ ...base, ...ROLE_CREDS[rol] });
        rolePools[rol].on('error', (err) =>
            console.error(`Error en pool PostgreSQL (${rol}):`, err));
    }
    return rolePools[rol];
}

/**
 * Ejecuta `fn(client)` dentro de UNA transacción como rol app_cliente, fijando los
 * GUC con SET LOCAL (set_config(...,true)) para que vivan SOLO en esa transacción y
 * NO se filtren a otra petición que reutilice la conexión del pool.
 *
 * - app.current_cliente = clienteUuid  → RLS aísla los datos del cliente.
 * - app.crypto_key (opcional)          → necesaria para cifrar/descifrar token.
 * Al liberar la conexión se hace RESET ALL como red de seguridad adicional.
 *
 * @param {string} clienteUuid
 * @param {(client: import('pg').PoolClient) => Promise<any>} fn
 * @param {{ withCrypto?: boolean }} [opts]
 */
async function withClienteTx(clienteUuid, fn, opts = {}) {
    const client = await getPool('cliente').connect();
    try {
        await client.query('BEGIN');
        // SET LOCAL vía set_config(..., true): el valor se revierte al COMMIT/ROLLBACK.
        await client.query("SELECT set_config('app.current_cliente', $1, true)", [clienteUuid]);
        if (opts.withCrypto) {
            await client.query("SELECT set_config('app.crypto_key', $1, true)", [process.env.PG_CRYPTO_KEY]);
        }
        const result = await fn(client);
        await client.query('COMMIT');
        return result;
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        // Red de seguridad: limpia cualquier GUC antes de devolver la conexión al pool.
        try { await client.query('RESET ALL'); } catch (_) { /* conexión ya rota */ }
        client.release();
    }
}

/**
 * Ejecuta una query parametrizada con el pool del dueño.
 * @param {string} text - SQL con placeholders $1, $2, ...
 * @param {Array} params - valores
 */
async function query(text, params) {
    return pool.query(text, params);
}

/** Verifica la conectividad con la base (pool dueño). */
async function testConnection() {
    const { rows } = await pool.query('SELECT NOW() AS now');
    console.log('Conectado a PostgreSQL. Hora del servidor:', rows[0].now);
    return true;
}

/** Cierra todos los pools abiertos. */
async function closeAll() {
    await pool.end();
    await Promise.all(Object.values(rolePools).map((p) => p.end()));
}

module.exports = { pool, getPool, withClienteTx, query, testConnection, closeAll };
