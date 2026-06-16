// scripts/verificar_integracion.js — Verificación end-to-end de la Fase 4.
// Flujo: register → login → add to cart (2 productos) → checkout.
// Muestra: stock ANTES/DESPUÉS en Mongo (debe bajar), carrito vacío tras checkout,
// pedido+factura en Postgres y la vista 360 unida por UUID.
//
// Requiere el server corriendo en http://localhost:3000.
// Uso: node scripts/verificar_integracion.js

const BASE = 'http://localhost:3000';

async function api(path, { method = 'GET', token, body } = {}) {
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers.Authorization = 'Bearer ' + token;
    const res = await fetch(BASE + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
    const text = await res.text();
    let data; try { data = JSON.parse(text); } catch { data = text; }
    if (!res.ok) throw new Error(`${method} ${path} → ${res.status}: ${JSON.stringify(data)}`);
    return data;
}

const stockDe = (productos, uuid) => productos.find(p => p.uuid === uuid)?.quantity;

async function main() {
    const email = 'e2e.cliente@example.com';
    const password = 'E2e123!';

    // 1) REGISTER (si ya existe, se ignora el 409)
    try {
        await api('/api/register', { method: 'POST', body: { nombre: 'E2E Cliente', email, password } });
        console.log('register → cuenta creada:', email);
    } catch (e) {
        console.log('register → ya existía (ok):', email);
    }

    // 2) LOGIN
    const { token, cliente } = await api('/api/login', { method: 'POST', body: { email, password } });
    console.log('login → uuid cliente:', cliente.uuid);

    // 3) Elegir 2 productos reales del catálogo (Mongo)
    const productosAntes = await api('/api/products');
    const p1 = productosAntes[0];
    const p2 = productosAntes[1];
    console.log('\n=== STOCK ANTES (MongoDB) ===');
    console.log(`  ${p1.uuid}  ${p1.brand} ${p1.name}  stock=${p1.quantity}`);
    console.log(`  ${p2.uuid}  ${p2.brand} ${p2.name}  stock=${p2.quantity}`);

    // 4) Carrito limpio + agregar 2 productos
    await api('/api/cart', { method: 'DELETE', token });            // vaciar por si quedó algo
    await api('/api/cart', { method: 'POST', token, body: { producto_uuid: p1.uuid, cantidad: 2 } });
    await api('/api/cart', { method: 'POST', token, body: { producto_uuid: p2.uuid, cantidad: 1 } });
    const carrito = await api('/api/cart', { token });
    console.log('\n=== CARRITO (MongoDB) ===');
    console.log('  items:', carrito.items);

    // 5) CHECKOUT (integra Mongo→Postgres ACID→Mongo)
    const compra = await api('/api/checkout', {
        method: 'POST', token,
        body: { metodo: 'tarjeta', token: '4111111111111111', ultimos4: '1111' }
    });
    console.log('\n=== CHECKOUT ===');
    console.log('  estado:', compra.estado);
    console.log('  pedido_id:', compra.pedido_id);
    console.log('  factura:', compra.numero_factura, '| subtotal', compra.subtotal, '| impuestos', compra.impuestos, '| total', compra.total);

    // 6) STOCK DESPUÉS + carrito vacío
    const productosDespues = await api('/api/products');
    console.log('\n=== STOCK DESPUÉS (MongoDB) — debe bajar ===');
    console.log(`  ${p1.brand} ${p1.name}: ${stockDe(productosAntes, p1.uuid)} → ${stockDe(productosDespues, p1.uuid)} (compró 2)`);
    console.log(`  ${p2.brand} ${p2.name}: ${stockDe(productosAntes, p2.uuid)} → ${stockDe(productosDespues, p2.uuid)} (compró 1)`);

    const carritoFinal = await api('/api/cart', { token });
    console.log('\n=== CARRITO TRAS CHECKOUT (debe estar vacío) ===');
    console.log('  items:', carritoFinal.items);

    // 7) Preferencias (PUT/GET) — demuestra la otra colección Mongo por cliente
    await api('/api/preferences', { method: 'PUT', token, body: { marcas_favoritas: ['Nike', 'Adidas'], talla: 42 } });

    // 8) VISTA 360 (unida por UUID)
    const resumen = await api(`/api/clientes/${cliente.uuid}/resumen`, { token });
    console.log('\n=== VISTA 360 (GET /api/clientes/:uuid/resumen) ===');
    console.log(JSON.stringify(resumen, null, 2));

    console.log('\nVerificación end-to-end completa.');
}

main().catch(e => { console.error('FALLO:', e.message); process.exit(1); });
