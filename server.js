const express = require('express');
const cors = require('cors'); // Importa el middleware CORS
const app = express();
const { getProducts, getProductById, addToCart, getCart, updateStock } = require('./api');

// Middleware
app.use(cors()); // Permite solicitudes CORS
app.use(express.json()); // Para parsear el cuerpo de las solicitudes JSON

// Rutas de la API
app.get('/api/products', getProducts);
app.get('/api/products/:id', getProductById);
app.post('/api/cart', addToCart);
app.get('/api/cart', getCart);
app.post('/api/update-stock', updateStock);

// Manejo de errores
app.use((err, req, res, next) => {
    console.error(err.stack); // Imprime el error en la consola
    res.status(500).send('Algo salió mal!'); // Responde con un mensaje de error
});

// Iniciar el servidor
const PORT = 3000;
app.listen(PORT, () => {
    console.log(`Servidor corriendo en http://localhost:${PORT}`);
});