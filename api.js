// api.js — Handlers de CATÁLOGO (MongoDB) y utilidades.
// El catálogo (y el stock autoritativo) viven en MongoDB.
const mongo = require('./db/mongo');

// Mapea un documento del catálogo de Mongo al formato que espera el frontend.
function mapCatalogo(doc) {
    if (!doc) return null;
    return {
        id: doc.legacy_id,        // ids 1..24 usados por enlaces del frontend
        uuid: doc.uuid,           // GUID de enlace con PostgreSQL
        brand: doc.marca,
        name: doc.nombre,
        image: doc.imagen,
        price: doc.precio,
        year: doc.year,
        quantity: doc.quantity,   // stock autoritativo (Mongo)
        etiquetas: doc.etiquetas,
        atributos: doc.atributos,
        variantes: doc.variantes
    };
}

async function getProductById(req, res) {
    try {
        const db = await mongo.connect();
        const doc = await db.collection('productos').findOne({ legacy_id: Number(req.params.id) });
        if (!doc) return res.status(404).json({ error: 'Product not found' });
        res.json(mapCatalogo(doc));
    } catch (error) {
        console.error('Error while loading product:', error);
        res.status(500).json({ error: 'Error while loading product' });
    }
}

async function getProducts(req, res) {
    try {
        const db = await mongo.connect();
        const docs = await db.collection('productos').find().sort({ legacy_id: 1 }).toArray();
        res.json(docs.map(mapCatalogo));
    } catch (error) {
        console.error('Error while fetching products:', error);
        res.status(500).json({ error: 'Database error' });
    }
}

// Compatibilidad: el viejo /api/update-stock escribía en SQLite. Ahora se REDIRIGE a
// MongoDB (stock autoritativo). El flujo normal de compra es POST /api/checkout.
async function updateStock(req, res) {
    try {
        const db = await mongo.connect();
        const { cartItems } = req.body;
        if (!Array.isArray(cartItems) || cartItems.length === 0) {
            return res.status(400).json({ error: 'cartItems debe ser un array no vacío.' });
        }
        const productos = db.collection('productos');
        for (const item of cartItems) {
            await productos.updateOne(
                { legacy_id: Number(item.id), quantity: { $gte: item.quantity } },
                { $inc: { quantity: -item.quantity } }
            );
        }
        res.json({ message: 'Stock actualizado en MongoDB.' });
    } catch (error) {
        console.error('Error al actualizar el stock:', error);
        res.status(500).json({ error: 'Error interno del servidor.' });
    }
}

module.exports = { getProducts, getProductById, updateStock, mapCatalogo };
