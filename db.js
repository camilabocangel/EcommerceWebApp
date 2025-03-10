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
        { id: 1, brand: "Adidas", name: "Adi2000", image: "img/products/Adidas Adi2000.png", price: 86, year: 2000 },
        { id: 2, brand: "Adidas", name: "Jeremy Scott x Adidas Superstar Money", image: "img/products/Adidas Jeremy Scott x Adidas Superstar Money.png", price: 149, year: 2023 },
        { id: 3, brand: "Adidas", name: "Adidas Samba OG Cream White Sand Strata", image: "img/products/Adidas Samba OG Cream White Sand Strata.png", price: 179, year: 2024 },
        { id: 4, brand: "Adidas", name: "Adidas Yeezy Foam RNNR sand", image: "img/products/Adidas Yeezy Foam RNNR Sand.png", price: 129, year: 2022 },
        { id: 5, brand: "Nike", name: "Nike Air Rift Black Forest OG", image: "img/products/Nike Air Rift Black Forest OG.png", price: 109, year: 2015 },
        { id: 6, brand: "Nike", name: "Nathan Bell x Zoom Fly SP 'Doodles'", image: "img/products/Nike Nathan Bell x Zoom Fly SP 'Doodles'.png", price: 129, year: 2019 },
        { id: 7, brand: "Nike", name: "Nike SB Dunk Low London", image: "img/products/Nike SB Dunk Low London.png", price: 79, year: 2004 },
        { id: 8, brand: "Nike", name: "Nike Air Yeezy 2 SP 'Red October'", image: "img/products/Nike Air Yeezy 2 SP 'Red October'.png", price: 86, year: 2014 },
        { id: 9, brand: "Puma", name: "Tenis Speedcat OG", image: "img/products/Puma Tenis Speedcat OG.png", price: 119, year: 2024 },
        { id: 10, brand: "Puma", name: "Puma Court Pro Men's Basketball Shoes", image: "img/products/Puma Court Pro Men's Basketball Shoes.png", price: 139, year: 2023 },
        { id: 11, brand: "Puma", name: "Lamelo Ball Puma x Lamelo Ball MB.04 1Love Men's", image: "img/products/Puma Lamelo Ball Puma x Lamelo Ball MB.04 1Love Men's.png", price: 129, year: 2024 },
        { id: 12, brand: "Puma", name: "Puma Magmax Nitro", image: "img/products/Puma Magmax Nitro.png", price: 179, year: 2024 },
        { id: 13, brand: "Converse", name: "Converse Off White", image: "img/products/Converse converse off white.png", price: 139, year: 2021 },
        { id: 14, brand: "Converse", name: "Carhartt x Converse One Star WIP White", image: "img/products/Converse Carhartt x Converse One Star WIP White.png", price: 139, year: 2023 },
        { id: 15, brand: "Converse", name: "Converse Run Star Hike JW Anderson White", image: "img/products/Converse Run Star Hike JW Anderson White.png", price: 119, year: 2019 },
        { id: 16, brand: "Converse", name: "Feng Chen Wang x Converse Chuck 70 2-in-1", image: "img/products/Converse Feng Chen Wang x Converse Chuck 70 2-in-1.png", price: 129, year: 2021 },
        { id: 17, brand: "New Balance", name: "Fresh Foam X Hierro v9", image: "img/products/New Balance Fresh Foam X Hierro v9.png", price: 179, year: 2025 },
        { id: 18, brand: "New Balance", name: "New Balance 327", image: "img/products/New Balance 327.png", price: 119, year: 2022 },
        { id: 19, brand: "New Balance", name: "530 Retro Running Shoes", image: "img/products/New Balance 530 Retro Running Shoes.png", price: 129, year: 2023 },
        { id: 20, brand: "New Balance", name: "9060 Trainers White", image: "img/products/New Balance 9060 Trainers White.png", price: 159, year: 2024 },
        { id: 21, brand: "Reebok", name: "Reebok Classic Leather Shoes", image: "img/products/Reebok Classic Leather Shoes.jpeg", price: 89, year: 2015 },
        { id: 22, brand: "Reebok", name: "Reebok Club C", image: "img/products/Reebok Club C.png", price: 119, year: 2021 },
        { id: 23, brand: "Reebok", name: "Reebok Floatzig 1 Footwear", image: "img/products/Reebok Floatzig 1 Footwear.png", price: 169, year: 2024 },
        { id: 24, brand: "Reebok", name: "Reebok Nano X4", image: "img/products/Reebok Nano X4.png", price: 139, year: 2024 },
    ];

    const stmt = await db.prepare("INSERT INTO products (id, brand, name, image, price, year) VALUES (?, ?, ?, ?, ?, ?)");
    for (let p of products) {
        await stmt.run(p.id, p.brand, p.name, p.image, p.price, p.year);
    }
    await stmt.finalize();
}

async function insertSizes(db) {
    const sizes = [34, 37, 40, 42, 44];

    const stmt = await db.prepare("INSERT INTO sizes (size) VALUES (?)");
    for (let size of sizes) {
        await stmt.run(size);
    }
    await stmt.finalize();
}

module.exports = connectDB;
