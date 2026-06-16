// services/auth.js — Registro, login (bcrypt) y middleware JWT.
// El UUID del cliente (clientes.id en Postgres) viaja en el JWT y enlaza TODO
// (carrito, preferencias y catálogo en Mongo; pedidos/pagos/facturas en Postgres).
//
// Las operaciones de cuenta (register/login) usan el pool DUEÑO porque ocurren ANTES
// de que exista un cliente autenticado (no hay app.current_cliente todavía). El resto
// de operaciones por-cliente usan el rol app_cliente con RLS (ver withClienteTx).
require('dotenv').config();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { pool } = require('../db/postgres');

const JWT_SECRET = process.env.JWT_SECRET;
const TOKEN_TTL = '8h';

/** Registra un cliente nuevo (rol 'cliente'). Devuelve el cliente creado. */
async function register({ nombre, email, password }) {
    if (!nombre || !email || !password) {
        const e = new Error('nombre, email y password son obligatorios');
        e.status = 400;
        throw e;
    }
    const hash = await bcrypt.hash(password, 10);
    try {
        const { rows } = await pool.query(
            `INSERT INTO clientes (nombre, email, password_hash, rol)
             VALUES ($1, $2, $3, 'cliente')
             RETURNING id, nombre, email, rol`,
            [nombre, email, hash]
        );
        return rows[0];
    } catch (err) {
        if (err.code === '23505') { // unique_violation (email)
            const e = new Error('El email ya está registrado');
            e.status = 409;
            throw e;
        }
        throw err;
    }
}

/** Verifica credenciales y devuelve { token, cliente }. */
async function login({ email, password }) {
    const { rows } = await pool.query(
        'SELECT id, nombre, email, rol, password_hash FROM clientes WHERE email = $1',
        [email]
    );
    const cli = rows[0];
    if (!cli || !(await bcrypt.compare(password, cli.password_hash))) {
        const e = new Error('Credenciales inválidas');
        e.status = 401;
        throw e;
    }
    const token = jwt.sign(
        { uuid: cli.id, email: cli.email, rol: cli.rol, nombre: cli.nombre },
        JWT_SECRET,
        { expiresIn: TOKEN_TTL }
    );
    return { token, cliente: { uuid: cli.id, nombre: cli.nombre, email: cli.email, rol: cli.rol } };
}

/** Middleware: exige un JWT válido. Coloca req.cliente = { uuid, email, rol, nombre }. */
function requireAuth(req, res, next) {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) return res.status(401).json({ error: 'Falta token de autenticación' });
    try {
        req.cliente = jwt.verify(token, JWT_SECRET);
        next();
    } catch (_) {
        return res.status(401).json({ error: 'Token inválido o expirado' });
    }
}

module.exports = { register, login, requireAuth };
