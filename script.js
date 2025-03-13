document.addEventListener("DOMContentLoaded", async () => {
    try {
        const response = await fetch('http://localhost:3000/api/products');
        const products = await response.json();

        console.log(products);

        if (!Array.isArray(products) || products.length === 0) {
            console.error("No products found");
            return;
        }

        if (document.getElementById("new-arrivals-container")) {
            showNewArrivals(products);
        }

        const brands = {
            adidas: [],
            nike: [],
            puma: [],
            converse: [],
            newbalance: [],
            reebok: []
        };

        products.forEach(product => {
            const brandKey = product.brand.toLowerCase().replace(/\s+/g, '');
            if (brands[brandKey]) {
                brands[brandKey].push(product);
            }
        });

        Object.keys(brands).forEach(brand => {
            const section = document.getElementById(brand);
            if (section) {
                const container = section.querySelector('.pro-container');
                if (container) {
                    container.innerHTML = brands[brand].map(createProductHTML).join('');
                }
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

    const latestProducts = products.sort((a, b) => b.year - a.year).slice(0, 8);

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


document.addEventListener("DOMContentLoaded", function () {
    if (window.location.pathname.includes("sproduct.html")) {
        const params = new URLSearchParams(window.location.search);
        const productId = params.get("id");

        if (productId) {
            fetch(`/api/products/${productId}`)
                .then(response => response.json())
                .then(product => {
                    document.getElementById("MainImg").src = product.image;
                    document.querySelector(".single-pro-details h4").textContent = product.brand + " " + product.name;
                    document.querySelector(".single-pro-details h2").textContent = "$" + product.price;
                    document.querySelector(".single-pro-details span").textContent = "Year: " + product.year;


                })
                .catch(error => console.error("Error fetching product:", error));
        }
    }
});


document.addEventListener("DOMContentLoaded", function () {
    const faqs = document.querySelectorAll(".faq-question");

    faqs.forEach((faq) => {
        faq.addEventListener("click", function () {
            document.querySelectorAll(".faq-answer").forEach(answer => {
                if (answer !== this.nextElementSibling) {
                    answer.style.display = "none";
                }
            });

            let answer = this.nextElementSibling;
            answer.style.display = (answer.style.display === "block") ? "none" : "block";
        });
    });
});


document.addEventListener('DOMContentLoaded', () => {
    const cartTableBody = document.querySelector('#cart-table-body');
    const cartSubtotal = document.querySelector('#cart-subtotal');
    const cartTotal = document.querySelector('#cart-total');

    const products = JSON.parse(localStorage.getItem('products')) || [];

    if (products.length === 0) {
        cartTableBody.innerHTML = '<tr><td colspan="7">Your cart is empty.</td></tr>';
        return;
    }

    let total = 0;

    products.forEach(item => {
        const product = products.find(p => p.id == item.id); 

        if (product) {
            const subtotal = product.price * item.quantity;
            total += subtotal;

            cartTableBody.innerHTML += `
                <tr>
                    <td><a href="#" class="remove-item" data-id="${item.id}"><i class="far fa-times-circle"></i></a></td>
                    <td><img src="${product.image}" alt="${product.name}" width="50"></td>
                    <td>${product.name}</td>
                    <td>$${product.price}</td>
                    <td>${item.quantity}</td>
                    <td>$${subtotal}</td>
                </tr>`;
        }
    });

    cartSubtotal.textContent = `$${total}`;
    cartTotal.innerHTML = `<strong>$${total}</strong>`;

    document.querySelectorAll('.remove-item').forEach(button => {
        button.addEventListener('click', (e) => {
            e.preventDefault();
            const id = button.getAttribute('data-id');
            removeFromCart(id);
        });
    });
});

function removeFromCart(id) {
    let products = JSON.parse(localStorage.getItem('products')) || [];
    products = products.filter(product => product.id != id); 
    localStorage.setItem('products', JSON.stringify(products));
    location.reload(); 
}

