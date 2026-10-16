
/* =========================================================
   CUSTOMER CART PAGE — cart.js
   ========================================================= */

document.addEventListener("DOMContentLoaded", () => {
    "use strict";

    const CART_STORAGE_KEY = "foodDeliveryCart";

    const FOOD_PLACEHOLDER =
        "../../assets/images/food/food-placeholder.jpg";

    const cartItemsContainer = document.getElementById("cartItems");
    const emptyCart = document.getElementById("emptyCart");
    const cartSubtotal = document.getElementById("cartSubtotal");
    const cartDeliveryFee = document.getElementById("cartDeliveryFee");
    const cartTotal = document.getElementById("cartTotal");
    const checkoutButton = document.getElementById("checkoutButton");
    const cartCount = document.getElementById("cartCount");

    const restaurantHeader = document.querySelector(
        ".cart-restaurant-header h2"
    );
    const restaurantStatus = document.querySelector(
        ".cart-restaurant-header .cart-status"
    );

    let cart = [];

    /* =====================================================
       HELPERS
    ===================================================== */

    function escapeHtml(value) {
        return String(value ?? "").replace(/[&<>"']/g, character => ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#39;"
        })[character]);
    }

    function formatCurrency(amount) {
        const value = Number(amount) || 0;

        return `KSh ${value.toLocaleString("en-KE", {
            minimumFractionDigits: 0,
            maximumFractionDigits: 2
        })}`;
    }

    function getQuantity(item) {
        const quantity = Number(item.quantity);
        return Number.isFinite(quantity) && quantity > 0
            ? Math.floor(quantity)
            : 1;
    }

    /* =====================================================
       LOAD AND SAVE CART
    ===================================================== */

    function loadCart() {
        try {
            const savedCart = localStorage.getItem(CART_STORAGE_KEY);
            const parsed = savedCart ? JSON.parse(savedCart) : [];

            cart = Array.isArray(parsed)
                ? parsed.filter(item => item && item.id != null)
                : [];
        } catch (error) {
            console.error("Unable to load cart:", error);
            cart = [];
        }
    }

    function saveCart() {
        try {
            localStorage.setItem(
                CART_STORAGE_KEY,
                JSON.stringify(cart)
            );
        } catch (error) {
            console.error("Unable to save cart:", error);
            alert("Your cart could not be saved. Check your browser storage.");
        }
    }

    /* =====================================================
       RESTAURANT INFORMATION
    ===================================================== */

    function getRestaurantName() {
        const item = cart[0];

        return item?.restaurant_name ||
            item?.restaurantName ||
            "Your restaurant";
    }

    function getDeliveryFee() {
        if (cart.length === 0) return 0;

        // Prefer the fee saved with the menu item.
        const item = cart[0];
        const fee = Number(
            item.delivery_fee ?? item.deliveryFee
        );

        // Temporary fallback for older cart items.
        return Number.isFinite(fee) && fee >= 0 ? fee : 100;
    }

    function updateRestaurantHeader() {
        if (restaurantHeader) {
            restaurantHeader.textContent = getRestaurantName();
        }

        if (restaurantStatus) {
            const openValue = cart[0]?.restaurant_is_open ??
                cart[0]?.is_open;

            if (openValue === false) {
                restaurantStatus.textContent = "Closed";
                restaurantStatus.classList.add("closed");
            } else {
                restaurantStatus.textContent =
                    openValue === true ? "Open" : "Restaurant";
                restaurantStatus.classList.remove("closed");
            }
        }
    }

    /* =====================================================
       TOTALS AND CART BADGE
    ===================================================== */

    function calculateSubtotal() {
        return cart.reduce((total, item) => {
            const price = Number(item.price) || 0;
            return total + price * getQuantity(item);
        }, 0);
    }

    function updateSummary() {
        const subtotal = calculateSubtotal();
        const deliveryFee = getDeliveryFee();
        const total = subtotal + deliveryFee;

        if (cartSubtotal) {
            cartSubtotal.textContent = formatCurrency(subtotal);
        }

        if (cartDeliveryFee) {
            cartDeliveryFee.textContent = formatCurrency(deliveryFee);
        }

        if (cartTotal) {
            cartTotal.textContent = formatCurrency(total);
        }
    }

    function updateCartCount() {
        const count = cart.reduce(
            (total, item) => total + getQuantity(item),
            0
        );

        // Update any cart badges on the page.
        document.querySelectorAll("#cartCount").forEach(element => {
            element.textContent = String(count);
        });
    }

    /* =====================================================
       RENDER CART ITEM
    ===================================================== */

    function createCartItem(item) {
        const article = document.createElement("article");

        article.className = "cart-item";
        article.dataset.foodId = String(item.id);

        const image = item.image || FOOD_PLACEHOLDER;
        const name = item.name || "Food item";
        const description = item.description || "";
        const price = Number(item.price) || 0;
        const quantity = getQuantity(item);

        article.innerHTML = `
            <div class="cart-item-image">
                <img
                    src="${escapeHtml(image)}"
                    alt="${escapeHtml(name)}"
                    loading="lazy"
                />
            </div>

            <div class="cart-item-info">
                <h3>${escapeHtml(name)}</h3>
                <p>${escapeHtml(description)}</p>
                <strong class="cart-item-price">
                    ${formatCurrency(price)}
                </strong>
                <p class="cart-line-total">
                    Item total: ${formatCurrency(price * quantity)}
                </p>
            </div>

            <div class="cart-item-actions">
                <div class="quantity-control">
                    <button
                        type="button"
                        class="quantity-button decrease-quantity"
                        aria-label="Decrease quantity for ${escapeHtml(name)}"
                    >−</button>

                    <span class="quantity">${quantity}</span>

                    <button
                        type="button"
                        class="quantity-button increase-quantity"
                        aria-label="Increase quantity for ${escapeHtml(name)}"
                    >+</button>
                </div>

                <button type="button" class="remove-item-button">
                    Remove
                </button>
            </div>
        `;

        const imageElement = article.querySelector("img");
        imageElement.addEventListener("error", () => {
            imageElement.onerror = null;
            imageElement.src = FOOD_PLACEHOLDER;
        });

        return article;
    }

    /* =====================================================
       RENDER CART
    ===================================================== */

    function renderCart() {
        if (!cartItemsContainer) return;

        cartItemsContainer.replaceChildren();

        cart.forEach(item => {
            cartItemsContainer.appendChild(createCartItem(item));
        });

        const isEmpty = cart.length === 0;

        cartItemsContainer.hidden = isEmpty;

        if (emptyCart) {
            emptyCart.hidden = !isEmpty;
        }

        if (checkoutButton) {
            checkoutButton.disabled = isEmpty;
            checkoutButton.setAttribute(
                "aria-disabled",
                String(isEmpty)
            );
        }

        updateRestaurantHeader();
        updateSummary();
        updateCartCount();
    }

    /* =====================================================
       FIND AND UPDATE ITEMS
    ===================================================== */

    function findCartItemIndex(foodId) {
        return cart.findIndex(
            item => String(item.id) === String(foodId)
        );
    }

    function changeQuantity(foodId, change) {
        const index = findCartItemIndex(foodId);

        if (index === -1) return;

        const newQuantity = getQuantity(cart[index]) + change;

        if (newQuantity <= 0) {
            cart.splice(index, 1);
        } else {
            cart[index].quantity = newQuantity;
        }

        saveCart();
        renderCart();
    }

    function removeItem(foodId) {
        cart = cart.filter(
            item => String(item.id) !== String(foodId)
        );

        saveCart();
        renderCart();
    }

    /* =====================================================
       CART EVENTS
    ===================================================== */

    if (cartItemsContainer) {
        cartItemsContainer.addEventListener("click", event => {
            const itemElement = event.target.closest(".cart-item");
            if (!itemElement) return;

            const foodId = itemElement.dataset.foodId;

            if (event.target.closest(".increase-quantity")) {
                changeQuantity(foodId, 1);
                return;
            }

            if (event.target.closest(".decrease-quantity")) {
                changeQuantity(foodId, -1);
                return;
            }

            if (event.target.closest(".remove-item-button")) {
                removeItem(foodId);
            }
        });
    }

    if (checkoutButton) {
        checkoutButton.addEventListener("click", event => {
            if (cart.length === 0) {
                event.preventDefault();
                alert("Your cart is empty. Add food before checking out.");
            }
        });
    }

    /* =====================================================
       MOBILE NAVIGATION
    ===================================================== */

    const mobileMenuButton =
        document.getElementById("mobileMenuButton");

    const mobileNavigation =
        document.getElementById("mobileNavigation");

    if (mobileMenuButton && mobileNavigation) {
        mobileMenuButton.addEventListener("click", () => {
            mobileNavigation.classList.toggle("active");

            const isOpen =
                mobileNavigation.classList.contains("active");

            mobileMenuButton.setAttribute(
                "aria-expanded",
                String(isOpen)
            );
        });

        mobileNavigation.querySelectorAll("a").forEach(link => {
            link.addEventListener("click", () => {
                mobileNavigation.classList.remove("active");
                mobileMenuButton.setAttribute("aria-expanded", "false");
            });
        });
    }

    /* =====================================================
       INITIALIZE
    ===================================================== */

    loadCart();
    renderCart();

    console.log("Customer cart initialized. Items:", cart.length);
});
