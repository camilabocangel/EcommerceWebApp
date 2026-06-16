// public/auth.js — Helpers de sesión en el frontend.
// Guarda SOLO el JWT en localStorage (no el carrito; el carrito vive en el servidor).
const Auth = {
    token: () => localStorage.getItem('token'),
    cliente: () => JSON.parse(localStorage.getItem('cliente') || 'null'),
    estaLogueado: () => !!localStorage.getItem('token'),
    guardarSesion: (token, cliente) => {
        localStorage.setItem('token', token);
        localStorage.setItem('cliente', JSON.stringify(cliente));
    },
    logout: () => {
        localStorage.removeItem('token');
        localStorage.removeItem('cliente');
        window.location.href = 'login.html';
    },
    // fetch con el header Authorization. Si expira la sesión, manda a login.
    fetch: async (url, options = {}) => {
        const headers = Object.assign({ 'Content-Type': 'application/json' }, options.headers || {});
        const token = Auth.token();
        if (token) headers['Authorization'] = 'Bearer ' + token;
        const res = await fetch(url, Object.assign({}, options, { headers }));
        if (res.status === 401) {
            Auth.logout();
            throw new Error('Session expired');
        }
        return res;
    },
    // Redirige a login si no hay sesión
    requerir: () => {
        if (!Auth.estaLogueado()) {
            window.location.href = 'login.html';
            return false;
        }
        return true;
    },
    // Pinta el estado de sesión en el navbar: muestra "Ingresar" si no hay sesión,
    // o "Hola, <nombre>" + botón "Salir" si la hay. No modifica la lógica de auth.
    pintarSesion: () => {
        const login = document.getElementById('nav-login');
        const sesion = document.getElementById('nav-session');
        const cli = Auth.cliente();
        if (Auth.estaLogueado() && cli) {
            if (login) login.style.display = 'none';
            if (sesion) {
                sesion.innerHTML = `<a style="cursor:default">Hi, ${cli.nombre}</a>`
                    + `<a href="#" id="nav-logout">Log out</a>`;
                const out = document.getElementById('nav-logout');
                if (out) out.addEventListener('click', (e) => { e.preventDefault(); Auth.logout(); });
            }
        } else {
            if (login) login.style.display = '';
            if (sesion) sesion.innerHTML = '';
        }
    }
};

// Al cargar cualquier página que incluya auth.js, refleja la sesión en el navbar.
document.addEventListener('DOMContentLoaded', () => Auth.pintarSesion());
