const express = require('express');

const router = express.Router();
const api = require('./api');

router.get('/api/products/:id', api.getProductById);
router.post('/cart', api.addToCart);
router.get('/cart', api.getCart);
router.get('/api/products', api.getProducts)
router.post('/api/update-stock', api.updateStock);

module.exports = router;