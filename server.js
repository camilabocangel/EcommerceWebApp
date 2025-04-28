const express = require('express');
const cors = require('cors');
const path = require('path'); // Añade esta línea
const app = express();
const { getProducts, getProductById, addToCart, getCart, updateStock } = require('./api');

app.use(cors()); 
app.use(express.json());

// Sirve archivos estáticos desde la raíz del proyecto
app.use(express.static(path.join(__dirname)));

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

const PORT = 3000;
app.listen(PORT, '0.0.0.0', () => { 
    console.log(`Servidor corriendo en http://localhost:${PORT}`);
});

function getLocalIpAddress() {
    const interfaces = require('os').networkInterfaces();
    for (const name in interfaces) {
        for (const iface of interfaces[name]) {
            if (iface.family === 'IPv4' && !iface.internal) {
                return iface.address;
            }
        }
    }
    return 'localhost';
}