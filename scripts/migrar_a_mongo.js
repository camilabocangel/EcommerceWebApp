// scripts/migrar_a_mongo.js
// Migra los 24 productos existentes de SQLite (shoes.db) a MongoDB
// (base "ecommerce_multitienda", colección "productos"), enriqueciéndolos.
// Idempotente: re-ejecutar no duplica documentos ni cambia los UUID ya asignados.
//
// Uso: node scripts/migrar_a_mongo.js

const { randomUUID } = require('crypto');
const connectSqlite = require('../db');        // SQLite actual (NO se modifica)
const mongo = require('../db/mongo');

// ──────────────────────────────────────────────────────────────
// Metadatos por producto (clave = id original de SQLite)
// Solo clasifican los datos EXISTENTES; no se inventan productos.
// ──────────────────────────────────────────────────────────────

// Tipo de zapatilla por producto (define etiqueta `tipo:` y el esquema de `atributos`)
const TIPO = {
    1: 'lifestyle', 2: 'lifestyle', 3: 'lifestyle', 4: 'lifestyle', 5: 'lifestyle',
    6: 'running', 7: 'skate', 8: 'lifestyle', 9: 'lifestyle', 10: 'basketball',
    11: 'basketball', 12: 'running', 13: 'lifestyle', 14: 'lifestyle', 15: 'lifestyle',
    16: 'lifestyle', 17: 'trail-running', 18: 'lifestyle', 19: 'running', 20: 'lifestyle',
    21: 'formal', 22: 'lifestyle', 23: 'running', 24: 'entrenamiento'
};

// Colaboraciones (derivadas del nombre real)
const COLABS = {
    2: ['jeremy-scott'], 4: ['yeezy'], 6: ['nathan-bell'], 8: ['yeezy'],
    11: ['lamelo-ball'], 13: ['off-white'], 14: ['carhartt'], 15: ['jw-anderson'],
    16: ['feng-chen-wang']
};

// Colores (derivados del nombre real)
const COLORES = {
    3: ['crema', 'blanco'], 4: ['arena'], 5: ['negro'], 8: ['rojo'],
    13: ['blanco'], 14: ['blanco'], 15: ['blanco'], 20: ['blanco']
};

// Género (los que dicen "Men's" => hombre; el resto unisex)
const GENEROS = { 10: ['hombre'], 11: ['hombre'] };

// ──────────────────────────────────────────────────────────────
// Reglas de derivación (según plan_migracion.md)
// ──────────────────────────────────────────────────────────────

function categoriaPrecio(precio) {
    if (precio < 100) return 'economico';
    if (precio < 150) return 'medio';
    return 'premium';
}

function categoriaEpoca(year) {
    if (year < 2010) return 'retro';
    if (year < 2020) return 'clasico';
    if (year < 2023) return 'actual';
    return 'nuevo';
}

function marcaKey(brand) {
    return brand.toLowerCase().replace(/\s+/g, '');
}

function industriaPorTipo(tipo) {
    if (tipo === 'lifestyle') return ['calzado', 'moda', 'streetwear'];
    if (tipo === 'formal') return ['calzado', 'formal', 'moda'];
    return ['calzado', 'deportivo']; // running, trail-running, basketball, skate, entrenamiento
}

// Esquema DINÁMICO de atributos según el tipo
function atributosPorTipo(tipo, epoca) {
    switch (tipo) {
        case 'skate':
            return { soporte_tobillo: 'medio', durabilidad: 'alta', tipo_suela: 'vulcanizada' };
        case 'running':
            return { drop_mm: 8, amortiguacion: 'alta', superficie: 'asfalto' };
        case 'trail-running':
            return { drop_mm: 6, amortiguacion: 'alta', superficie: 'trail' };
        case 'basketball':
            return { cana_alta: true, traccion: 'alta', soporte_tobillo: 'alto' };
        case 'formal':
            return { material_suela: 'goma', material_upper: 'cuero', acolchado: 'bajo' };
        case 'entrenamiento':
            return { estabilidad: 'alta', flexibilidad: 'media', drop_mm: 4 };
        case 'lifestyle':
        default:
            return {
                transpirable: true,
                estilo: (epoca === 'retro' || epoca === 'clasico') ? 'retro' : 'moderno',
                material_upper: 'sintetico'
            };
    }
}

// Distribuye el stock total en variantes por talla (la suma = quantity)
function generarVariantes(quantity) {
    const tallas = [40, 41, 42];
    const base = Math.floor(quantity / tallas.length);
    let resto = quantity - base * tallas.length;
    return tallas.map(talla => {
        let stock = base;
        if (resto > 0) { stock += 1; resto -= 1; }
        return { talla, stock };
    });
}

// Construye el documento enriquecido a partir de la fila de SQLite
function construirDocumento(p) {
    const tipo = TIPO[p.id] || 'lifestyle';
    const generos = GENEROS[p.id] || ['unisex'];
    const colores = COLORES[p.id] || [];
    const colaboraciones = COLABS[p.id] || [];
    const precioCat = categoriaPrecio(p.price);
    const epocaCat = categoriaEpoca(p.year);

    const etiquetas = [
        `marca:${marcaKey(p.brand)}`,
        `tipo:${tipo}`,
        ...generos.map(g => `genero:${g}`),
        `precio:${precioCat}`,
        `epoca:${epocaCat}`,
        ...colaboraciones.map(c => `colab:${c}`),
        ...colores.map(c => `color:${c}`)
    ];

    const destacado = p.price >= 150 || colaboraciones.length > 0;

    return {
        // --- núcleo (numéricos se mantienen numéricos) ---
        legacy_id: p.id,                 // id original de SQLite (enlace de trazabilidad)
        marca: p.brand,
        nombre: p.name,
        imagen: p.image,
        precio: p.price,                 // numérico
        year: p.year,                    // numérico
        quantity: p.quantity,            // numérico
        // --- clasificación / enriquecimiento ---
        tipo,
        destacado,
        etiquetas,                       // varias etiquetas por producto
        generos,
        colores,
        colaboraciones,
        industria: industriaPorTipo(tipo),
        variantes: generarVariantes(p.quantity),  // [{talla, stock}]
        atributos: atributosPorTipo(tipo, epocaCat) // esquema dinámico por tipo
    };
}

// ──────────────────────────────────────────────────────────────
// Vistas (db.createView) — repetibles: se eliminan y recrean
// ──────────────────────────────────────────────────────────────
async function crearVistas(db) {
    const vistas = [
        {
            nombre: 'vista_ofertas',
            pipeline: [{ $match: { etiquetas: 'precio:economico' } }]
        },
        {
            nombre: 'vista_skate',
            pipeline: [{ $match: { etiquetas: 'tipo:skate' } }]
        },
        {
            nombre: 'vista_reporte_premium',
            // $and + $or + $gt + $lt: precio entre (100, 200) Y (destacado O year>=2023)
            pipeline: [{
                $match: {
                    $and: [
                        { precio: { $gt: 100 } },
                        { precio: { $lt: 200 } },
                        { $or: [{ destacado: true }, { year: { $gte: 2023 } }] }
                    ]
                }
            }]
        }
    ];

    for (const v of vistas) {
        try { await db.collection(v.nombre).drop(); } catch (e) { /* no existía */ }
        await db.createCollection(v.nombre, { viewOn: 'productos', pipeline: v.pipeline });
        console.log(`  vista creada: ${v.nombre}`);
    }
}

// ──────────────────────────────────────────────────────────────
// Main
// ──────────────────────────────────────────────────────────────
async function main() {
    // 1) Leer los 24 productos desde SQLite
    const sqlite = await connectSqlite();
    const productos = await sqlite.all('SELECT * FROM products ORDER BY id');
    console.log(`Leídos ${productos.length} productos desde SQLite.`);

    // 2) Conectar a MongoDB
    const db = await mongo.connect();
    const col = db.collection('productos');

    // 3) Upsert idempotente (clave: legacy_id). El uuid solo se asigna al insertar.
    let insertados = 0, actualizados = 0;
    for (const p of productos) {
        const doc = construirDocumento(p);
        const res = await col.updateOne(
            { legacy_id: p.id },
            { $set: doc, $setOnInsert: { uuid: randomUUID() } },
            { upsert: true }
        );
        if (res.upsertedCount > 0) insertados++; else actualizados++;
    }
    console.log(`Mongo: ${insertados} insertados, ${actualizados} actualizados.`);

    // 4) Índices: etiquetas, precio y atributos (+ uuid único)
    await col.createIndex({ uuid: 1 }, { unique: true });
    await col.createIndex({ etiquetas: 1 });
    await col.createIndex({ precio: 1 });
    await col.createIndex({ atributos: 1 });
    console.log('Índices creados: uuid(único), etiquetas, precio, atributos.');

    // 5) Vistas
    await crearVistas(db);

    const total = await col.countDocuments();
    console.log(`\nMigración completa. Total documentos en "productos": ${total}`);

    await mongo.close();
}

main().catch(err => {
    console.error('Error en la migración:', err);
    process.exit(1);
});
