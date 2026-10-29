/* CUSTOMER CART PAGE */
document.addEventListener("DOMContentLoaded", () => {
    "use strict";

    const CART_STORAGE_KEY = "foodDeliveryCart";
    const MAX_QUANTITY = 99;
    const FOOD_PLACEHOLDER = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='640' height='360' viewBox='0 0 640 360'%3E%3Crect width='100%25' height='100%25' fill='%23f1f3f5'/%3E%3Ctext x='50%25' y='48%25' dominant-baseline='middle' text-anchor='middle' font-family='Arial,sans-serif' font-size='26' fill='%2368707a'%3EFoodDelivery%3C/text%3E%3Ctext x='50%25' y='60%25' dominant-baseline='middle' text-anchor='middle' font-family='Arial,sans-serif' font-size='16' fill='%2368707a'%3EImage unavailable%3C/text%3E%3C/svg%3E";

    const cartItemsContainer = document.getElementById("cartItems");
    const emptyCart = document.getElementById("emptyCart");
    const cartSubtotal = document.getElementById("cartSubtotal");
    const cartTotal = document.getElementById("cartTotal");
    const checkoutButton = document.getElementById("checkoutButton");
    const restaurantHeader = document.querySelector(".cart-restaurant-header h2");
    const restaurantStatus = document.querySelector(".cart-restaurant-header .cart-status");
    let cart = [];

    function escapeHtml(value) {
        return String(value ?? "").replace(/[&<>"']/g, character => ({
            "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
        })[character]);
    }

    function formatCurrency(amount) {
        return `KSh ${Number(amount).toLocaleString("en-KE", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
    }

    function normalizeBoolean(value) {
        if (value === true || value === 1) return true;
        if (value === false || value === 0) return false;
        if (typeof value === "string") {
            const normalized = value.trim().toLowerCase();
            if (["true", "1", "yes", "open", "available"].includes(normalized)) return true;
            if (["false", "0", "no", "closed", "unavailable"].includes(normalized)) return false;
        }
        return null;
    }

    function normalizeItem(item) {
        if (!item || item.id == null || String(item.id).trim() === "") return null;
        const price = Number(item.price);
        const quantity = Number(item.quantity);
        const restaurantId = item.restaurant_id ?? item.restaurantId;
        if (!Number.isFinite(price) || price < 0 ||
            !Number.isInteger(quantity) || quantity < 1 || quantity > MAX_QUANTITY ||
            restaurantId == null || String(restaurantId).trim() === "") return null;
        return {
            ...item,
            id: item.id,
            restaurant_id: restaurantId,
            restaurant_name: item.restaurant_name || item.restaurantName || "Your restaurant",
            name: String(item.name || "Food item"),
            description: String(item.description || ""),
            price,
            quantity,
            image: typeof item.image === "string" ? item.image : "",
            restaurant_is_open: normalizeBoolean(item.restaurant_is_open ?? item.is_open)
        };
    }

    function loadCart() {
        try {
            const raw = localStorage.getItem(CART_STORAGE_KEY);
            const parsed = raw ? JSON.parse(raw) : [];
            if (!Array.isArray(parsed)) throw new Error("Saved cart is not a list");
            const normalized = parsed.map(normalizeItem).filter(Boolean);
            const firstRestaurantId = normalized[0]?.restaurant_id;
            cart = firstRestaurantId == null ? [] : normalized.filter(
                item => String(item.restaurant_id) === String(firstRestaurantId)
            );
            if (cart.length !== parsed.length) {
                try { localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cart)); }
                catch (storageError) { console.warn("Could not normalize saved cart:", storageError); }
            }
        } catch (error) {
            console.error("Unable to load cart:", error);
            cart = [];
        }
    }

    function saveCart() {
        try {
            localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cart));
            return true;
        } catch (error) {
            console.error("Unable to save cart:", error);
            alert("Your cart could not be saved. Check browser storage settings and available space.");
            return false;
        }
    }

    function updateSummary() {
        const subtotal = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
        if (cartSubtotal) cartSubtotal.textContent = formatCurrency(subtotal);
        if (cartTotal) cartTotal.textContent = formatCurrency(subtotal);
    }

    function updateCartCount() {
        const count = cart.reduce((sum, item) => sum + item.quantity, 0);
        document.querySelectorAll("#cartCount").forEach(element => element.textContent = String(count));
    }

    function createCartItem(item) {
        const article = document.createElement("article");
        article.className = "cart-item";
        article.dataset.foodId = String(item.id);
        const image = item.image || FOOD_PLACEHOLDER;
        article.innerHTML = `
            <div class="cart-item-image"><img src="${escapeHtml(image)}" alt="${escapeHtml(item.name)}" loading="lazy"></div>
            <div class="cart-item-info">
                <h3>${escapeHtml(item.name)}</h3>
                <p>${escapeHtml(item.description)}</p>
                <strong class="cart-item-price">${formatCurrency(item.price)}</strong>
                <p class="cart-line-total">Item total: ${formatCurrency(item.price * item.quantity)}</p>
            </div>
            <div class="cart-item-actions">
                <div class="quantity-control">
                    <button type="button" class="quantity-button decrease-quantity" aria-label="Decrease quantity for ${escapeHtml(item.name)}">−</button>
                    <span class="quantity">${item.quantity}</span>
                    <button type="button" class="quantity-button increase-quantity" aria-label="Increase quantity for ${escapeHtml(item.name)}" ${item.quantity >= MAX_QUANTITY ? "disabled" : ""}>+</button>
                </div>
                <button type="button" class="remove-item-button">Remove</button>
            </div>`;
        const imageElement = article.querySelector("img");
        imageElement.addEventListener("error", () => {
            imageElement.onerror = null;
            imageElement.src = FOOD_PLACEHOLDER;
        });
        return article;
    }

    function renderCart() {
        if (!cartItemsContainer) return;
        cartItemsContainer.replaceChildren();
        cart.forEach(item => cartItemsContainer.appendChild(createCartItem(item)));
        const isEmpty = cart.length === 0;
        cartItemsContainer.hidden = isEmpty;
        if (emptyCart) emptyCart.hidden = !isEmpty;
        if (checkoutButton) {
            checkoutButton.disabled = isEmpty;
            checkoutButton.setAttribute("aria-disabled", String(isEmpty));
        }
        updateRestaurantHeader();
        updateSummary();
        updateCartCount();
    }

    function changeQuantity(foodId, change) {
        const index = cart.findIndex(item => String(item.id) === String(foodId));
        if (index < 0) return;
        const previous = cart[index].quantity;
        const next = previous + change;
        if (next < 1) return;
        if (next > MAX_QUANTITY) {
            alert(`You can add up to ${MAX_QUANTITY} of one item per order.`);
            return;
        }
        cart[index].quantity = next;
        if (!saveCart()) cart[index].quantity = previous;
        renderCart();
    }

    function removeItem(foodId) {
        const previous = cart;
        cart = cart.filter(item => String(item.id) !== String(foodId));
        if (!saveCart()) cart = previous;
        renderCart();
    }

    if (cartItemsContainer) {
        cartItemsContainer.addEventListener("click", event => {
            const itemElement = event.target.closest(".cart-item");
            if (!itemElement) return;
            const foodId = itemElement.dataset.foodId;
            if (event.target.closest(".increase-quantity")) changeQuantity(foodId, 1);
            else if (event.target.closest(".decrease-quantity")) changeQuantity(foodId, -1);
            else if (event.target.closest(".remove-item-button")) removeItem(foodId);
        });
    }

    if (checkoutButton) {
        checkoutButton.addEventListener("click", () => {
            if (!cart.length) {
                alert("Your cart is empty. Add food before checking out.");
                return;
            }
            const restaurantIds = new Set(cart.map(item => String(item.restaurant_id)));
            if (restaurantIds.size !== 1) {
                alert("Your cart must contain items from one restaurant. Please review your cart.");
                return;
            }
            window.location.href = "checkout.html";
        });
    }

    const mobileMenuButton = document.getElementById("mobileMenuButton");
    const mobileNavigation = document.getElementById("mobileNavigation");
    if (mobileMenuButton && mobileNavigation) {
        mobileMenuButton.addEventListener("click", () => {
            mobileNavigation.classList.toggle("active");
            mobileMenuButton.setAttribute("aria-expanded", String(mobileNavigation.classList.contains("active")));
        });
        mobileNavigation.querySelectorAll("a").forEach(link => link.addEventListener("click", () => {
            mobileNavigation.classList.remove("active");
            mobileMenuButton.setAttribute("aria-expanded", "false");
        }));
    }

    loadCart();
    renderCart();
    console.log("Customer cart initialized. Items:", cart.length);
});
