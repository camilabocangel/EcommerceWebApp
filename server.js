const express = require('express');
const cors = require('cors');
const { getProducts, getProductById, addToCart, getCart } = require('./api');

const app = express();



app.use(express.json());
app.use(cors());

app.get('/api/products', getProducts);
app.get('/api/products/:id', getProductById);
app.post('/api/cart', addToCart);
app.get('/api/cart', getCart);

const PORT = 3000;
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
