const connectDB = require('./db'); // Conexión con la base de datos

async function getProductById(req, res) {
    try {
        const db = await connectDB();
        const product = await db.get('SELECT * FROM products WHERE id = ?', [req.params.id]);

        if (!product) {
            return res.status(404).json({ error: 'Product not found' });
        }
        res.json(product);
    } catch (error) {
        console.error('Error while loading product:', error);
        res.status(500).json({ error: 'Error while loading product' });
    }
}

async function getProducts(req, res) {
    try {
        const db = await connectDB();
        const products = await db.all('SELECT * FROM products');
        res.json(products);
    } catch (error) {
        console.error('Error while fetching products:', error);
        res.status(500).json({ error: 'Database error' });
    }
}

async function addToCart(req, res) {
    const { productId, quantity } = req.body;
    try {
        const db = await connectDB();
        await db.run('INSERT INTO cart (product_id, quantity) VALUES (?, ?)', [productId, quantity]);
        res.json({ message: 'Product added to cart' });
    } catch (error) {
        console.error('Error while adding to cart:', error);
        res.status(500).json({ error: 'Error while adding to cart' });
    }
}

async function getCart(req, res) {
    try {
        const db = await connectDB();
        const cart = await db.all('SELECT * FROM cart');
        res.json(cart);
    } catch (error) {
        console.error('Error while loading cart:', error);
        res.status(500).json({ error: 'Error while loading cart' });
    }
}

module.exports = { getProducts, getProductById, addToCart, getCart };
