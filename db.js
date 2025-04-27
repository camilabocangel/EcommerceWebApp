// db.js - Versión para MySQL/RDS
const mysql = require('mysql2/promise');

async function connectDB() {
    const db = await mysql.createConnection({
        host: 'ecommerce-db.cw3gywuw69nd.us-east-1.rds.amazonaws.com',
        user: 'admin',
        password: 'flor2013',
        database: 'ecommerce-db',
        port: process.env.DB_PORT || 3306
    });

    console.log('Connected with MySQL database.');

    // Crear tabla si no existe
    await db.execute(`CREATE TABLE IF NOT EXISTS products (
        id INT AUTO_INCREMENT PRIMARY KEY,
        brand VARCHAR(255) NOT NULL,
        name VARCHAR(255) NOT NULL,
        image VARCHAR(255) NOT NULL,
        price DECIMAL(10, 2) NOT NULL,
        year INT NOT NULL,
        quantity INT DEFAULT 0
    )`);

    // Verificar si hay productos
    const [rows] = await db.execute("SELECT COUNT(*) AS count FROM products");
    if (rows[0].count === 0) await insertProducts(db);

    return db;
}



module.exports = connectDB;