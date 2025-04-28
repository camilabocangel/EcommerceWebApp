document.addEventListener("DOMContentLoaded", async () => {
    try {
        const response = await fetch('/api/products');
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