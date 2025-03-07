document.addEventListener("DOMContentLoaded", async () => {
    const container = document.getElementById("product-container");

    try {
        const response = await fetch("http://localhost:3000/api/products");
        const products = await response.json();

        if (!Array.isArray(products)) {
            throw new Error("Los productos no se recibieron correctamente");
        }

        container.innerHTML = products.map(product => `
            <div class="pro-box">
                <img src="${product.image}" alt="${product.name}">
                <h3>${product.name}</h3>
                <p>Color: ${product.color}</p>
                <p>Año: ${product.year}</p>
            </div>
        `).join("");
    } catch (error) {
        console.error("Error cargando los productos:", error);
        container.innerHTML = "<p>Error al cargar productos.</p>";
    }
});
