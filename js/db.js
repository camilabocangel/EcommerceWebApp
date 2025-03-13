const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');

async function connectDB() {
    const db = await open({
        filename: './shoes.db',
        driver: sqlite3.Database
    });

    console.log('Connected with the SQLite database.');

    await db.exec(`CREATE TABLE IF NOT EXISTS products (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        brand TEXT NOT NULL,
        name TEXT NOT NULL,
        image TEXT NOT NULL,
        price REAL NOT NULL,
        year INT NOT NULL,
        quantity INT DEFAULT 0
    )`);

    const { count: productCount } = await db.get("SELECT COUNT(*) AS count FROM products");
    if (productCount === 0) await insertProducts(db);

    return db;
}

async function insertProducts(db) {
    const products = [
        { brand: "Adidas", name: "Adi2000", image: "img/products/Adidas Adi2000.png", price: 86, year: 2000, quantity: 3 },
        { brand: "Adidas", name: "Jeremy Scott x Adidas Superstar Money", image: "img/products/Adidas Jeremy Scott x Adidas Superstar Money.png", price: 149, year: 2023, quantity: 3 },
        { brand: "Adidas", name: "Adidas Samba OG Cream White Sand Strata", image: "img/products/Adidas Samba OG Cream White Sand Strata.png", price: 179, year: 2024, quantity: 3 },
        { brand: "Adidas", name: "Adidas Yeezy Foam RNNR sand", image: "img/products/Adidas Yeezy Foam RNNR Sand.png", price: 129, year: 2022, quantity: 3 },
        { brand: "Nike", name: "Nike Air Rift Black Forest OG", image: "img/products/Nike Air Rift Black Forest OG.png", price: 109, year: 2015, quantity: 3 },
        { brand: "Nike", name: "Nathan Bell x Zoom Fly SP 'Doodles'", image: "img/products/Nike Nathan Bell x Zoom Fly SP 'Doodles'.png", price: 129, year: 2019, quantity: 3 },
        { brand: "Nike", name: "Nike SB Dunk Low London", image: "img/products/Nike SB Dunk Low London.png", price: 79, year: 2004, quantity: 3 },
        { brand: "Nike", name: "Nike Air Yeezy 2 SP 'Red October'", image: "img/products/Nike Air Yeezy 2 SP 'Red October'.png", price: 86, year: 2014, quantity: 3 },
        { brand: "Puma", name: "Tenis Speedcat OG", image: "img/products/Puma Tenis Speedcat OG.png", price: 119, year: 2024, quantity: 3 },
        { brand: "Puma", name: "Puma Court Pro Men's Basketball Shoes", image: "img/products/Puma Court Pro Men's Basketball Shoes.png", price: 139, year: 2023, quantity: 3 },
        { brand: "Puma", name: "Lamelo Ball Puma x Lamelo Ball MB.04 1Love Men's", image: "img/products/Puma Lamelo Ball Puma x Lamelo Ball MB.04 1Love Men's.png", price: 129, year: 2024, quantity: 3 },
        { brand: "Puma", name: "Puma Magmax Nitro", image: "img/products/Puma Magmax Nitro.png", price: 179, year: 2024, quantity: 3 },
        { brand: "Converse", name: "Converse Off White", image: "img/products/Converse converse off white.png", price: 139, year: 2021, quantity: 3 },
        { brand: "Converse", name: "Carhartt x Converse One Star WIP White", image: "img/products/Converse Carhartt x Converse One Star WIP White.png", price: 139, year: 2023, quantity: 3 },
        { brand: "Converse", name: "Converse Run Star Hike JW Anderson White", image: "img/products/Converse Run Star Hike JW Anderson White.png", price: 119, year: 2019, quantity: 3 },
        { brand: "Converse", name: "Feng Chen Wang x Converse Chuck 70 2-in-1", image: "img/products/Converse Feng Chen Wang x Converse Chuck 70 2-in-1.png", price: 129, year: 2021, quantity: 3 },
        { brand: "New Balance", name: "Fresh Foam X Hierro v9", image: "img/products/New Balance Fresh Foam X Hierro v9.png", price: 179, year: 2025, quantity: 3 },
        { brand: "New Balance", name: "New Balance 327", image: "img/products/New Balance 327.png", price: 119, year: 2022, quantity: 3 },
        { brand: "New Balance", name: "530 Retro Running Shoes", image: "img/products/New Balance 530 Retro Running Shoes.png", price: 129, year: 2023, quantity: 3 },
        { brand: "New Balance", name: "9060 Trainers White", image: "img/products/New Balance 9060 Trainers White.png", price: 159, year: 2024, quantity: 3 },
        { brand: "Reebok", name: "Reebok Classic Leather Shoes", image: "img/products/Reebok Classic Leather Shoes.jpeg", price: 89, year: 2015, quantity: 3 },
        { brand: "Reebok", name: "Reebok Club C", image: "img/products/Reebok Club C.png", price: 119, year: 2021, quantity: 3 },
        { brand: "Reebok", name: "Reebok Floatzig 1 Footwear", image: "img/products/Reebok Floatzig 1 Footwear.png", price: 169, year: 2024, quantity: 3 },
        { brand: "Reebok", name: "Reebok Nano X4", image: "img/products/Reebok Nano X4.png", price: 139, year: 2024, quantity: 3 }

      ];

    const stmt = await db.prepare("INSERT INTO products (brand, name, image, price, year, quantity) VALUES (?, ?, ?, ?, ?, ?)");
    for (let p of products) {
        await stmt.run(p.brand, p.name, p.image, p.price, p.year, p.quantity );
    }
    await stmt.finalize();
}

module.exports = connectDB;