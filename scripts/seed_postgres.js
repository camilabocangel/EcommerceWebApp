// scripts/seed_postgres.js — Datos de prueba para el módulo transaccional.
// Inserta 3 clientes (password con hash bcrypt) con roles distintos.
// Idempotente: ON CONFLICT (email) DO NOTHING. Consultas parametrizadas.
//
// Uso: node scripts/seed_postgres.js
require('dotenv').config();
const bcrypt = require('bcryptjs');
const { pool, closeAll } = require('../db/postgres');

const CLIENTES = [
    { nombre: 'Ana Cliente',     email: 'ana.cliente@example.com',   rol: 'cliente',  password: 'Cliente123!'  },
    { nombre: 'Víctor Vendedor', email: 'victor.vendedor@example.com', rol: 'vendedor', password: 'Vendedor123!' },
    { nombre: 'Alma Admin',      email: 'alma.admin@example.com',    rol: 'admin',    password: 'Admin123!'    }
];

async function main() {
    let insertados = 0;
    for (const c of CLIENTES) {
        const hash = await bcrypt.hash(c.password, 10);   // hash bcrypt (cost 10)
        const res = await pool.query(
            `INSERT INTO clientes (nombre, email, password_hash, rol)
             VALUES ($1, $2, $3, $4)
             ON CONFLICT (email) DO NOTHING
             RETURNING id`,
            [c.nombre, c.email, hash, c.rol]
        );
        if (res.rowCount > 0) {
            insertados++;
            // Una dirección de ejemplo para el cliente recién creado
            await pool.query(
                `INSERT INTO direcciones (cliente_id, calle, ciudad, pais, codigo_postal)
                 VALUES ($1, $2, $3, $4, $5)`,
                [res.rows[0].id, 'Av. Siempre Viva 123', 'Cochabamba', 'Bolivia', '0000']
            );
        }
    }

    const { rows } = await pool.query(
        'SELECT nombre, email, rol FROM clientes ORDER BY fecha_registro'
    );
    console.log(`Clientes insertados en esta corrida: ${insertados}`);
    console.log('Clientes en BD:');
    rows.forEach(r => console.log(`  - ${r.rol.padEnd(8)} ${r.nombre} <${r.email}>`));

    await closeAll();
}

main().catch(async (err) => {
    console.error('Error en el seed:', err.message);
    try { await closeAll(); } catch (_) {}
    process.exit(1);
});
