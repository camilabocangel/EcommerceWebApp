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

    } catch (error) {
        console.error("Error fetching products:", error);
    }
});

function createProductHTML(product) {
    return `
        <div class="pro-box">
            <img src="${product.image}" alt="${product.name}">
            <h3>${product.name}</h3>
            <p>Price: $${product.price}</p>
            <p>${product.brand}</p>
            <p>Year: ${product.year}</p>
        </div>
    `;
}

function showNewArrivals(products) {
    const container = document.getElementById("new-arrivals-container");
    if (!container) return;

    const latestProducts = products.sort((a, b) => b.year - a.year).slice(0, 8);

    container.innerHTML = latestProducts.map(product => `
        <div class="pro">
            <img src="${product.image}" alt="${product.name}">
            <div class="des">
                <span>${product.brand}</span>
                <h5>${product.name}</h5>
                <h4>$${product.price}</h4>
            </div>
            <a href="#"><i class="fal fa-shopping-cart cart"></i></a>
        </div>
    `).join("");
}

function addToCart(productId) {
    console.log("Product added to cart: ", productId);
}



document.addEventListener("DOMContentLoaded", function () {
    console.log("Product ID:", productId);
    fetch("/api/products") 
        .then(response => response.json())
        .then(products => {
            const container = document.querySelector(".pro-container");
            container.innerHTML = ""; 

            products.forEach(product => {
                const productHTML = `
                    <div class="pro">
                        <img src="${product.image}" alt="${product.name}" class="product-link" data-id="${product.id}">
                        <div class="des">
                            <span>${product.brand}</span>
                            <h5 class="product-link" data-id="${product.id}">${product.name}</h5>
                            <h4>$${product.price}</h4>
                        </div>
                        <a href="#"><i class="fal fa-shopping-cart cart"></i></a>
                    </div>
                `;
                container.innerHTML += productHTML;
            });

            document.addEventListener("DOMContentLoaded", () => {
                document.querySelectorAll(".product-link").forEach((element) => {
                    element.addEventListener("click", () => {
                        const productId = element.getAttribute("data-id");
                        if (productId) {
                            window.location.href = `sproduct.html?id=${productId}`;
                        } else {
                            console.error("No se encontró el ID del producto.");
                        }
                    });
                });
            });
            
            
        })
        .catch(error => console.error("Error cargando productos:", error));
});



document.addEventListener("DOMContentLoaded", function () {
    console.log("Product ID:", productId);
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

                    fetch(`/api/products/${productId}/sizes`)
                        .then(response => response.json())
                        .then(sizes => {
                            const select = document.querySelector(".single-pro-details select");
                            select.innerHTML = sizes.map(size => `<option>${size}</option>`).join("");
                        });
                })
                .catch(error => console.error("Error fetching product:", error));
        }
    }
});

