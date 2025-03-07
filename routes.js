const express = require('express');
const router = express.Router();
const api = require('./api');

router.get('/products', api.getProducts);
router.get('/product/:id', api.getProductById);
router.post('/cart', api.addToCart);
router.get('/cart', api.getCart);

module.exports = router;
