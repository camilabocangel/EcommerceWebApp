require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const app = express();

// Catálogo (Mongo)
const { getProducts, getProductById, updateStock } = require('./api');
// Servicios / módulos de la integración por UUID
const auth = require('./services/auth');
const checkoutService = require('./services/checkout');
const resumenService = require('./services/resumen');
const carrito = require('./db/carrito');
const preferencias = require('./db/preferencias');
const mongo = require('./db/mongo');

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ───────────────────────── Catálogo (público) ─────────────────────────
app.get('/api/products', getProducts);
app.get('/api/products/:id', getProductById);
// Compat: stock antiguo → ahora MongoDB
app.post('/api/update-stock', updateStock);

// ───────────────────────── Autenticación ─────────────────────────
app.post('/api/register', async (req, res) => {
    try {
        const cliente = await auth.register(req.body);
        res.status(201).json(cliente);
    } catch (e) {
        res.status(e.status || 500).json({ error: e.message });
    }
});

app.post('/api/login', async (req, res) => {
    try {
        const out = await auth.login(req.body);
        res.json(out);
    } catch (e) {
        res.status(e.status || 500).json({ error: e.message });
    }
});

// ───────────────────────── Carrito (Mongo, requiere login) ─────────────────────────
app.get('/api/cart', auth.requireAuth, async (req, res) => {
    try {
        res.json(await carrito.getCarrito(req.cliente.uuid));
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/cart', auth.requireAuth, async (req, res) => {
    try {
        const { producto_uuid, cantidad } = req.body;
        if (!producto_uuid || !Number.isInteger(cantidad) || cantidad <= 0) {
            return res.status(400).json({ error: 'producto_uuid y cantidad (entero > 0) son obligatorios' });
        }
        res.json(await carrito.agregarItem(req.cliente.uuid, producto_uuid, cantidad));
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.delete('/api/cart', auth.requireAuth, async (req, res) => {
    try {
        const { producto_uuid } = req.body || {};
        const result = producto_uuid
            ? await carrito.quitarItem(req.cliente.uuid, producto_uuid)
            : await carrito.vaciar(req.cliente.uuid);
        res.json(result);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ───────────────────────── Preferencias (Mongo, requiere login) ─────────────────────────
app.get('/api/preferences', auth.requireAuth, async (req, res) => {
    try {
        res.json(await preferencias.getPreferencias(req.cliente.uuid));
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.put('/api/preferences', auth.requireAuth, async (req, res) => {
    try {
        res.json(await preferencias.setPreferencias(req.cliente.uuid, req.body || {}));
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ───────────────────────── Checkout integrado ─────────────────────────
app.post('/api/checkout', auth.requireAuth, async (req, res) => {
    try {
        const { metodo = 'tarjeta', token = null, ultimos4 = null } = req.body || {};
        const out = await checkoutService.checkout(req.cliente.uuid, { metodo, token, ultimos4 });
        res.json(out);
    } catch (e) {
        res.status(e.status || 500).json({ error: e.message });
    }
});

// ───────────────────────── Vista 360 ─────────────────────────
app.get('/api/clientes/:uuid/resumen', auth.requireAuth, async (req, res) => {
    try {
        // Un cliente solo puede ver su propio resumen (salvo admin)
        if (req.cliente.rol !== 'admin' && req.cliente.uuid !== req.params.uuid) {
            return res.status(403).json({ error: 'No autorizado para ver este resumen' });
        }
        res.json(await resumenService.resumen(req.params.uuid));
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Manejo de errores
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).send('Algo salió mal!');
});

// Iniciar el servidor tras asegurar índices de Mongo
const PORT = 3000;
async function start() {
    await mongo.connect();
    await carrito.ensureIndexes();
    await preferencias.ensureIndexes();
    app.listen(PORT, () => console.log(`Servidor corriendo en http://localhost:${PORT}`));
}
start().catch((e) => {
    console.error('No se pudo iniciar el servidor:', e);
    process.exit(1);
});
