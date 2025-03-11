const express = require('express');
const connectDB = require('./db'); 

const router = express.Router();
const api = require('./api');

router.get('/products', api.getProducts);
router.get('/api/products/:id', api.getProductById);
router.post('/cart', api.addToCart);
router.get('/cart', api.getCart);


module.exports = router;
