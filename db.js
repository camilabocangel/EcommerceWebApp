const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');

async function connectDB() {
    const db = await open({
        filename: './shoes.db',
        driver: sqlite3.Database
    });

    console.log('Connected with the SQLite database.');

    await db.exec(`CREATE TABLE IF NOT EXISTS products (
        id INTEGER PRIMARY KEY,
        brand TEXT NOT NULL,
        name TEXT NOT NULL,
        image TEXT NOT NULL,
        price REAL NOT NULL,
        year INTEGER NOT NULL
    )`);

    await db.exec(`CREATE TABLE IF NOT EXISTS sizes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        size INTEGER NOT NULL UNIQUE
    )`);

    await db.exec(`CREATE TABLE IF NOT EXISTS product_sizes (
        product_id INTEGER,
        size_id INTEGER,
        quantity INTEGER,
        FOREIGN KEY (product_id) REFERENCES products(id),
        FOREIGN KEY (size_id) REFERENCES sizes(id),
        PRIMARY KEY (product_id, size_id)
    )`);

    // Verificar e insertar datos si está vacío
    const { count: productCount } = await db.get("SELECT COUNT(*) AS count FROM products");
    if (productCount === 0) await insertProducts(db);

    const { count: sizeCount } = await db.get("SELECT COUNT(*) AS count FROM sizes");
    if (sizeCount === 0) await insertSizes(db);

    return db;
}

// Insertar productos iniciales
async function insertProducts(db) {
    const products = [
        { id: 1, brand: "Adidas", name: "Adi2000", image: "img/products/Adi2000.png", price: 86, year: 2000 },
        { id: 2, brand: "Adidas", name: "Jeremy Scott x Adidas Superstar Money", image: "img/products/Jeremy Scott x Adidas Superstar Money.png", price: 86, year: 2023 },
        { id: 3, brand: "Nike", name: "Nike Air Rift Black Forest OG", image: "img/products/Nike Air Rift Black Forest OG.png", price: 86, year: 2015 },
        { id: 4, brand: "Adidas", name: "Adidas Samba OG Cream White Sand Strata", image: "img/products/Adidas Samba OG Cream White Sand Strata.png", price: 86, year: 2024 },
        { id: 5, brand: "Nike", name: "Nike Air Yeezy 2 SP 'Red October'", image: "img/products/Air Yeezy 2 SP 'Red October'.png", price: 86, year: 2014 },
        { id: 6, brand: "Adidas", name: "Adidas Yeezy Foam RNNR sand", image: "img/products/Adidas Samba OG Cream White Sand Strata.png", price: 86, year: 2022 },
        { id: 7, brand: "Nike", name: "Nathan Bell x Zoom Fly SP 'Doodles'", image: "img/products/Nathan Bell x Zoom Fly SP 'Doodles'.png", price: 86, year: 2019 },
        { id: 8, brand: "Nike", name: "Nike SB Dunk Low London", image: "img/products/Nike SB Dunk Low London.png", price: 86, year: 2004 },
        { id: 9, brand: "Converse", name: "Converse Off White", image: "img/products/converse off white.png", price: 86, year: 2021 },
        { id: 10, brand: "Converse", name: "Carhartt x Converse One Star WIP White", image: "img/products/Carhartt x Converse One Star WIP White.png", price: 86, year: 2023 },
        { id: 11, brand: "Converse", name: "Converse Run Star Hike JW Anderson White", image: "img/products/Converse Run Star Hike JW Anderson White.png", price: 86, year: 2019 },
        { id: 12, brand: "Converse", name: "Feng Chen Wang x Converse Chuck 70 2-in-1", image: "img/products/Feng Chen Wang x Converse Chuck 70 2-in-1.png", price: 86, year: 2021 }
    ];

    const stmt = await db.prepare("INSERT INTO products (id, brand, name, image, price, year) VALUES (?, ?, ?, ?, ?, ?)");
    for (let p of products) {
        await stmt.run(p.id, p.brand, p.name, p.image, p.price, p.year);
    }
    await stmt.finalize();
}

// Insertar tallas iniciales
async function insertSizes(db) {
    const sizes = [34, 37, 40, 42, 44];

    const stmt = await db.prepare("INSERT INTO sizes (size) VALUES (?)");
    for (let size of sizes) {
        await stmt.run(size);
    }
    await stmt.finalize();
}

module.exports = connectDB;
