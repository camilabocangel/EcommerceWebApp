require('dotenv').config();
const express = require('express');
const cors = require('cors'); 
const path = require('path'); // <--- importante importar 'path'
const app = express();
const { getProducts, getProductById, addToCart, getCart, updateStock } = require('./api');

// Middleware
app.use(cors());
app.use(express.json());

// Servir archivos estáticos desde la carpeta "public"
app.use(express.static(path.join(__dirname, 'public')));

// Rutas de la API
app.get('/api/products', getProducts);
app.get('/api/products/:id', getProductById);
app.post('/api/cart', addToCart);
app.get('/api/cart', getCart);
app.post('/api/update-stock', updateStock);

// Manejo de errores
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).send('Algo salió mal!');
});

// Iniciar el servidor
const PORT = 3000;
app.listen(PORT, () => {
    console.log(`Servidor corriendo en http://localhost:${PORT}`);
});
