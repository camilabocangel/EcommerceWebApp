// db/mongo.js — Cliente de MongoDB (catálogo de productos)
// Base de datos: "ecommerce_multitienda". Config desde variables de entorno (.env).
require('dotenv').config();
const { MongoClient } = require('mongodb');

const host = process.env.MONGO_HOST || 'localhost';
const port = process.env.MONGO_PORT || 27017;
const user = process.env.MONGO_USER;
const password = process.env.MONGO_PASSWORD;
const dbName = process.env.MONGO_DB || 'ecommerce_multitienda';

// authSource=admin porque el usuario root se crea en la base "admin" (MONGO_INITDB_ROOT_*)
const credentials = user && password
    ? `${encodeURIComponent(user)}:${encodeURIComponent(password)}@`
    : '';
const uri = `mongodb://${credentials}${host}:${port}/?authSource=admin`;

const client = new MongoClient(uri);

let db = null;

/**
 * Conecta (una sola vez) y devuelve la instancia de la base "ecommerce_multitienda".
 */
async function connect() {
    if (db) return db;
    await client.connect();
    db = client.db(dbName);
    console.log(`Conectado a MongoDB. Base de datos: ${dbName}`);
    return db;
}

/**
 * Devuelve la base conectada (lanza si aún no se ha llamado a connect()).
 */
function getDb() {
    if (!db) {
        throw new Error('MongoDB no está conectado. Llama a connect() primero.');
    }
    return db;
}

/**
 * Cierra la conexión.
 */
async function close() {
    await client.close();
    db = null;
}

module.exports = { client, connect, getDb, close, dbName };
