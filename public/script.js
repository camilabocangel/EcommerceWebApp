// Catálogo (lee de /api/products → MongoDB). El carrito vive en el servidor
// (MongoDB) vía /api/cart; ver cart.html y sproduct.html.
document.addEventListener("DOMContentLoaded", async () => {
    try {
        const response = await fetch('/api/products');
        const products = await response.json();

        if (!Array.isArray(products) || products.length === 0) {
            console.error("No products found");
            return;
        }

        if (document.getElementById("new-arrivals-container")) {
            showNewArrivals(products);
        }

        const brands = {
            adidas: [], nike: [], puma: [], converse: [], newbalance: [], reebok: []
        };

        products.forEach(product => {
            const brandKey = product.brand.toLowerCase().replace(/\s+/g, '');
            if (brands[brandKey]) brands[brandKey].push(product);
        });

        Object.keys(brands).forEach(brand => {
            const section = document.getElementById(brand);
            if (section) {
                const container = section.querySelector('.pro-container');
                if (container) container.innerHTML = brands[brand].map(createProductHTML).join('');
            }
        });

        assignProductClickEvents();
    } catch (error) {
        console.error("Error fetching products:", error);
    }
});

function createProductHTML(product) {
    return `
        <div class="pro">
            <img src="${product.image}" alt="${product.name}" class="product-link" data-id="${product.id}">
            <div class="des">
                <span>${product.brand}</span>
                <h5>${product.name}</h5>
                <h4> $${product.price}</h4>
            </div>
        </div>
    `;
}

function showNewArrivals(products) {
    const container = document.getElementById("new-arrivals-container");
    if (!container) return;

    const latestProducts = [...products].sort((a, b) => b.year - a.year).slice(0, 8);
    container.innerHTML = latestProducts.map(product => `
        <div class="pro">
            <img src="${product.image}" alt="${product.name}" class="product-link" data-id="${product.id}">
            <div class="des">
                <span>${product.brand}</span>
                <h5 class="product-link" data-id="${product.id}">${product.name}</h5>
                <h4>$${product.price}</h4>
            </div>
        </div>
    `).join("");

    assignProductClickEvents();
}

function assignProductClickEvents() {
    document.querySelectorAll(".pro").forEach(element => {
        element.addEventListener("click", (event) => {
            const productId = event.currentTarget.querySelector(".product-link").getAttribute("data-id");
            if (productId) {
                window.location.href = `sproduct.html?id=${productId}`;
            } else {
                console.error("No se encontró el ID del producto.");
            }
        });
    });
}

// Detalle de producto (sproduct.html)
document.addEventListener("DOMContentLoaded", function () {
    if (window.location.pathname.includes("sproduct.html")) {
        const params = new URLSearchParams(window.location.search);
        const productId = params.get("id");
        if (productId) {
            fetch(`/api/products/${productId}`)
                .then(response => response.json())
                .then(product => {
                    const img = document.getElementById("MainImg");
                    if (img) img.src = product.image;
                    const h4 = document.querySelector(".single-pro-details h4");
                    if (h4) h4.textContent = product.brand + " " + product.name;
                    const h2 = document.querySelector(".single-pro-details h2");
                    if (h2) h2.textContent = "$" + product.price;
                    const span = document.querySelector(".single-pro-details span");
                    if (span) span.textContent = "Year: " + product.year;
                })
                .catch(error => console.error("Error fetching product:", error));
        }
    }
});

// FAQ acordeón
document.addEventListener("DOMContentLoaded", function () {
    const faqs = document.querySelectorAll(".faq-question");
    faqs.forEach((faq) => {
        faq.addEventListener("click", function () {
            document.querySelectorAll(".faq-answer").forEach(answer => {
                if (answer !== this.nextElementSibling) answer.style.display = "none";
            });
            let answer = this.nextElementSibling;
            answer.style.display = (answer.style.display === "block") ? "none" : "block";
        });
    });
});
