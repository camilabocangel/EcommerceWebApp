const express = require('express');
const cors = require('cors');
const app = express();
const { getProducts, getProductById, addToCart, getCart, updateStock } = require('./api');

app.use(cors()); 
app.use(express.json()); 

app.get('/api/products', getProducts);
app.get('/api/products/:id', getProductById);
app.post('/api/cart', addToCart);
app.get('/api/cart', getCart);
app.post('/api/update-stock', updateStock);

app.use((err, req, res, next) => {
    console.error(err.stack); 
    res.status(500).send('Algo salió mal!'); 
});

const PORT = 3000;
app.listen(PORT, () => {
    console.log(`Servidor corriendo en http://localhost:${PORT}`);
});