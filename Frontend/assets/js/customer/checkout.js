
/* =========================================================
   CUSTOMER CHECKOUT — BACKEND INTEGRATION
   Endpoint: POST /api/orders
   ========================================================= */

document.addEventListener("DOMContentLoaded", () => {
    "use strict";

    const API_BASE = (window.FOOD_DELIVERY_API_BASE || document.querySelector('meta[name="api-base-url"]')?.content?.trim() || "http://localhost:5000/api").replace(/\/+$/, "");
    const CART_STORAGE_KEY = "foodDeliveryCart";
    const TOKEN_KEY = "foodDeliveryAccessToken";
    const USER_KEY = "foodDeliveryUser";

    const checkoutForm = document.getElementById("checkoutForm");
    const fullName = document.getElementById("fullName");
    const phone = document.getElementById("phone");
    const address = document.getElementById("address");
    const area = document.getElementById("area");
    const deliveryNotes = document.getElementById("deliveryNotes");
    const confirmOrder = document.getElementById("confirmOrder");
    const checkoutMessage = document.getElementById("checkoutMessage");
    const placeOrderButton = document.getElementById("placeOrderButton");

    let cart = [];
    let savedAddresses = [];
    let selectedAddressId = null;
    let isSubmitting = false;

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
        return `KSh ${(Number(amount) || 0).toLocaleString("en-KE", {
            minimumFractionDigits: 0,
            maximumFractionDigits: 2
        })}`;
    }

    function showMessage(message, type = "error") {
        if (!checkoutMessage) return;

        checkoutMessage.textContent = message;
        checkoutMessage.className = `checkout-message ${type}`;
        checkoutMessage.setAttribute("role", "alert");
    }

    function clearMessage() {
        if (!checkoutMessage) return;

        checkoutMessage.textContent = "";
        checkoutMessage.className = "checkout-message";
    }

    function getToken() {
        return localStorage.getItem(TOKEN_KEY) ||
            sessionStorage.getItem(TOKEN_KEY);
    }

    function getCurrentUser() {
        try {
            const raw = localStorage.getItem(USER_KEY) ||
                sessionStorage.getItem(USER_KEY);

            return raw ? JSON.parse(raw) : null;
        } catch {
            return null;
        }
    }

    /* =====================================================
       CART
    ===================================================== */

    function loadCart() {
        try {
            const saved = localStorage.getItem(CART_STORAGE_KEY);
            const parsed = saved ? JSON.parse(saved) : [];

            cart = Array.isArray(parsed)
                ? parsed.filter(item => item && item.id != null)
                : [];
        } catch (error) {
            console.error("Unable to load cart:", error);
            cart = [];
        }
    }

    function calculateSubtotal() {
        return cart.reduce((total, item) => {
            const price = Number(item.price) || 0;
            const quantity = Number(item.quantity) || 0;

            return total + price * quantity;
        }, 0);
    }

    function getDeliveryFee() {
        if (cart.length === 0) return 0;

        const raw = cart[0].delivery_fee ?? cart[0].deliveryFee;
        const fee = raw == null || raw === "" ? NaN : Number(raw);
        // Do not show a made-up fee. The server calculates the final amount at order creation.
        return Number.isFinite(fee) && fee >= 0 ? fee : null;
    }

    function updateOrderSummary() {
        const checkoutItems = document.querySelector(".checkout-items");
        const summaryCalculations =
            document.querySelector(".summary-calculations");
        const summaryTotal = document.querySelector(".summary-total");

        if (!checkoutItems) return;

        if (cart.length === 0) {
            checkoutItems.innerHTML = `
                <div class="checkout-empty">
                    <strong>Your cart is empty</strong>
                    <span>Add some food before checking out.</span>
                </div>
            `;

            if (summaryCalculations) {
                summaryCalculations.innerHTML = `
                    <div class="summary-row">
                        <span>Subtotal</span><strong>KSh 0</strong>
                    </div>
                    <div class="summary-row">
                        <span>Delivery Fee</span><strong>KSh 0</strong>
                    </div>
                `;
            }

            if (summaryTotal) {
                summaryTotal.innerHTML =
                    "<span>Total</span><strong>KSh 0</strong>";
            }

            if (placeOrderButton) placeOrderButton.disabled = true;
            return;
        }

        checkoutItems.replaceChildren();

        cart.forEach(item => {
            const quantity = Math.max(1, Number(item.quantity) || 1);
            const price = Number(item.price) || 0;

            const itemElement = document.createElement("div");
            itemElement.className = "checkout-item";

            itemElement.innerHTML = `
                <div class="checkout-item-quantity">
                    ${quantity}x
                </div>
                <div class="checkout-item-info">
                    <strong>${escapeHtml(item.name || "Food item")}</strong>
                    <span>${formatCurrency(price)}</span>
                </div>
                <strong class="checkout-item-price">
                    ${formatCurrency(price * quantity)}
                </strong>
            `;

            checkoutItems.appendChild(itemElement);
        });

        const subtotal = calculateSubtotal();
        const deliveryFee = getDeliveryFee();

        if (summaryCalculations) {
            summaryCalculations.innerHTML = `
                <div class="summary-row">
                    <span>Subtotal</span>
                    <strong>${formatCurrency(subtotal)}</strong>
                </div>
                <div class="summary-row">
                    <span>Delivery Fee</span>
                    <strong>${deliveryFee == null ? "Calculated at checkout" : formatCurrency(deliveryFee)}</strong>
                </div>
            `;
        }

        if (summaryTotal) {
            summaryTotal.innerHTML = `
                <span>Total</span>
                <strong>${deliveryFee == null ? "Calculated at checkout" : formatCurrency(subtotal + deliveryFee)}</strong>
            `;
        }

        if (placeOrderButton) {
            placeOrderButton.disabled = false;
        }
    }

    /* =====================================================
       FORM VALIDATION
    ===================================================== */

    function getPaymentMethod() {
        return document.querySelector(
            'input[name="paymentMethod"]:checked'
        )?.value || null;
    }

    function validatePhoneNumber(value) {
        const cleaned = value.replace(/[\s-]/g, "");
        return /^(?:0|254|\+254)(?:7|1)\d{8}$/.test(cleaned);
    }

    function validateCheckout() {
        clearMessage();

        if (cart.length === 0) {
            showMessage("Your cart is empty. Add food before placing an order.");
            return false;
        }

        const restaurantIds = [
            ...new Set(cart.map(item => String(item.restaurant_id ?? "")))
        ];

        if (restaurantIds.length !== 1 || !restaurantIds[0]) {
            showMessage(
                "Your cart must contain items from one restaurant. " +
                "Return to the menu and add the items again if needed."
            );
            return false;
        }

        if (cart.some(item =>
            !Number.isInteger(Number(item.quantity)) ||
            Number(item.quantity) < 1 ||
            Number(item.quantity) > 99 ||
            !Number.isFinite(Number(item.price)) ||
            Number(item.price) < 0 ||
            !/^[1-9][0-9]*$/.test(String(item.id ?? "")) ||
            !/^[1-9][0-9]*$/.test(String(item.restaurant_id ?? ""))
        )) {
            showMessage("Your cart contains an invalid item or quantity. Please review your cart.");
            return false;
        }

        if (!fullName || fullName.value.trim().length < 2) {
            showMessage("Please enter your full name.");
            fullName?.focus();
            return false;
        }

        if (!phone || !validatePhoneNumber(phone.value.trim())) {
            showMessage("Please enter a valid Kenyan phone number, such as 0712345678.");
            phone?.focus();
            return false;
        }

        if (!address || address.value.trim().length < 5) {
            showMessage("Please enter your delivery address.");
            address?.focus();
            return false;
        }

        if (!area || area.value.trim().length < 2) {
            showMessage("Please enter your city or area.");
            area?.focus();
            return false;
        }

        if (getPaymentMethod() !== "cash") {
            showMessage("Cash on delivery is the only payment method currently available.");
            return false;
        }

        if (!confirmOrder?.checked) {
            showMessage("Please confirm your delivery information.");
            confirmOrder?.focus();
            return false;
        }

        return true;
    }

    /* =====================================================
       PREPARE API PAYLOAD
    ===================================================== */

    function buildOrderPayload() {
        const restaurantId = cart[0].restaurant_id;

        return {
            restaurant_id: Number(restaurantId),
            recipient_name: fullName.value.trim(),
            delivery_phone: phone.value.trim(),
            delivery_address: address.value.trim(),
            delivery_city: area.value.trim(),
            delivery_instructions: deliveryNotes
                ? deliveryNotes.value.trim()
                : "",
            notes: null,
            address_id: selectedAddressId || null,
            expected_delivery_fee: (() => { const fee = cart[0].delivery_fee ?? cart[0].deliveryFee; return fee == null || fee === "" ? null : Number(fee); })(),
            items: cart.map(item => ({
                food_id: Number(item.id),
                quantity: Number(item.quantity),
                expected_price: Number(item.price)
            }))
        };
    }

    /* =====================================================
       SUBMIT ORDER TO BACKEND
    ===================================================== */

    async function submitOrder() {
        const token = getToken();

        if (!token) {
            showMessage("Please log in before placing your order.");
            return;
        }

        if (isSubmitting) return;

        isSubmitting = true;
        clearMessage();

        if (placeOrderButton) {
            placeOrderButton.disabled = true;
            placeOrderButton.textContent = "Placing Order...";
        }

        try {
            const payload = buildOrderPayload();

            const response = await fetch(`${API_BASE}/orders`, {
                method: "POST",
                headers: {
                    "Accept": "application/json",
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${token}`
                },
                body: JSON.stringify(payload)
            });

            const result = await response.json().catch(() => ({}));

            if (response.status === 401 || response.status === 403) {
                throw new Error(
                    result.message ||
                    "Your session has expired or you do not have permission. Please log in again."
                );
            }

            if (!response.ok || result.success !== true) {
                throw new Error(
                    result.message || `Unable to place order (HTTP ${response.status}).`
                );
            }

            const order = result.data?.order;

            if (!order || order.id == null) {
                throw new Error(
                    "The server response did not include the created order. " +
                    "Please check your order history before trying again."
                );
            }

            // The backend creates the pending cash payment in the same transaction.
            const paymentRecordCreated = true;

            // Clear cart only after the backend confirms the order.
            localStorage.removeItem(CART_STORAGE_KEY);
            cart = [];

            if (paymentRecordCreated) {
                showMessage(
                    `Order ${order.order_number || order.id} placed successfully. Pay cash on delivery.`,
                    "success"
                );
            } else {
                showMessage(
                    `Order ${order.order_number || order.id} was created, but its cash payment record needs support review. Please do not place the order again.`,
                    "error"
                );
            }

            if (placeOrderButton) {
                placeOrderButton.textContent = "Order Placed";
            }

            // Save the ID only as a navigation convenience.
            // The order itself is stored in the backend.
            sessionStorage.setItem(
                "foodDeliveryLastOrderId",
                String(order.id)
            );

            window.setTimeout(() => {
                window.location.href = "orders.html";
            }, paymentRecordCreated ? 1500 : 3500);

        } catch (error) {
            console.error("Checkout failed:", error);
            showMessage(error.message || "Something went wrong while placing your order.");

            if (placeOrderButton) {
                placeOrderButton.disabled = false;
                placeOrderButton.textContent = "Place Order";
            }

        } finally {
            isSubmitting = false;
        }
    }

    /* =====================================================
       FORM SUBMIT
    ===================================================== */

    if (checkoutForm) {
        checkoutForm.addEventListener("submit", async event => {
            event.preventDefault();

            if (!validateCheckout()) return;

            await submitOrder();
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

            const isOpen = mobileNavigation.classList.contains("active");

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
       PREFILL CUSTOMER DETAILS WHEN AVAILABLE
    ===================================================== */

    const currentUser = getCurrentUser();

    if (currentUser) {
        const name = [
            currentUser.first_name,
            currentUser.last_name
        ].filter(Boolean).join(" ");

        if (fullName && !fullName.value && name) {
            fullName.value = name;
        }

        if (phone && !phone.value && currentUser.phone) {
            phone.value = currentUser.phone;
        }
    }

    /* =====================================================
       SAVED DELIVERY ADDRESSES
    ===================================================== */

    async function loadSavedAddresses() {
        const select = document.getElementById("savedAddressSelect");
        if (!select) return;
        const token = getToken();
        if (!token) return;
        try {
            const response = await fetch(`${API_BASE}/addresses`, { headers: { Accept: "application/json", Authorization: `Bearer ${token}` } });
            const result = await response.json().catch(() => ({}));
            if (!response.ok || result.success !== true) throw new Error(result.message || "Could not load saved addresses.");
            const rows = result.data?.addresses;
            if (!Array.isArray(rows)) throw new Error("The saved address list is invalid.");
            savedAddresses = rows;
            select.replaceChildren(new Option("Enter a new address", ""));
            savedAddresses.forEach(item => select.add(new Option(`${item.label || "Address"}: ${item.address_line}, ${item.city}`, String(item.id))));
            const preferred = savedAddresses.find(item => item.is_default) || savedAddresses[0];
            if (preferred) { select.value = String(preferred.id); applySavedAddress(preferred); }
        } catch (error) {
            console.warn("Saved addresses could not be loaded:", error);
            select.replaceChildren(new Option("Saved addresses unavailable — enter address below", ""));
        }
    }

    function applySavedAddress(item) {
        if (!item) return;
        selectedAddressId = String(item.id);
        if (fullName) fullName.value = item.recipient_name || fullName.value;
        if (phone) phone.value = item.phone || phone.value;
        if (address) address.value = item.address_line || "";
        if (area) area.value = item.city || "";
        if (deliveryNotes && item.delivery_instructions) deliveryNotes.value = item.delivery_instructions;
        const locationText = document.querySelector(".location-text strong");
        if (locationText) locationText.textContent = item.address_line || item.city || "Saved address";
    }

    document.getElementById("savedAddressSelect")?.addEventListener("change", event => {
        const id = event.target.value;
        selectedAddressId = id || null;
        if (id) applySavedAddress(savedAddresses.find(item => String(item.id) === id));
        else address?.focus();
    });

    /* =====================================================
       INITIALIZE
    ===================================================== */

    loadCart();
    updateOrderSummary();
    loadSavedAddresses();

    console.log("Checkout initialized. Cart items:", cart.length);
});
