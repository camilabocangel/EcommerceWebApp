const connectDB = require('./db');

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
        await db.run('INSERT INTO products (product_id, quantity) VALUES (?, ?)', [productId, quantity]);
        res.json({ message: 'Product added to cart' });
    } catch (error) {
        console.error('Error while adding to cart:', error);
        res.status(500).json({ error: 'Error while adding to cart' });
    }
}

async function getCart(req, res) {
    try {
        const db = await connectDB();
        const products = await db.all('SELECT * FROM products');
        res.json(products);
    } catch (error) {
        console.error('Error while loading cart:', error);
        res.status(500).json({ error: 'Error while loading cart' });
    }
}


async function updateStock(req, res) {
    try {
        const db = await connectDB();
        const { cartItems } = req.body;

        if (!Array.isArray(cartItems) || cartItems.length === 0) {
            return res.status(400).json({ error: 'cartItems debe ser un array no vacío.' });
        }

        for (const item of cartItems) {
            const { id, quantity } = item;

            // Verificar si el producto existe
            const product = await db.get('SELECT * FROM products WHERE id = ?', [id]);
            if (!product) {
                console.warn(`Producto con id ${id} no encontrado.`);
                continue; // Salta este producto si no existe
            }

            // Actualizar el stock restando la cantidad del carrito
            await db.run('UPDATE products SET quantity = quantity - ? WHERE id = ?', [quantity, id]);
            console.log(`Stock actualizado para el producto ${id}: -${quantity}`);
        }

        res.json({ message: 'Stock actualizado correctamente.' });

    } catch (error) {
        console.error('Error al actualizar el stock:', error);
        res.status(500).json({ error: 'Error interno del servidor.' });
    }
}

module.exports = { getProducts, getProductById, addToCart, getCart, updateStock };

