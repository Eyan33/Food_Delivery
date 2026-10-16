
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

        const fee = Number(
            cart[0].delivery_fee ?? cart[0].deliveryFee
        );

        // Display-only fallback for older cart items.
        // The backend calculates the actual fee when placing the order.
        return Number.isFinite(fee) && fee >= 0 ? fee : 100;
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
                    <strong>${formatCurrency(deliveryFee)}</strong>
                </div>
            `;
        }

        if (summaryTotal) {
            summaryTotal.innerHTML = `
                <span>Total</span>
                <strong>${formatCurrency(subtotal + deliveryFee)}</strong>
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
            !Number.isFinite(Number(item.price)) ||
            Number(item.price) < 0
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
            items: cart.map(item => ({
                food_id: Number(item.id),
                quantity: Number(item.quantity)
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

            /*
             * Record the selected payment method after the order exists.
             * If this second request fails, do NOT tell the customer that
             * the order failed: the order was already committed. Preserve
             * its ID and redirect so the customer does not accidentally
             * create a duplicate order by retrying checkout.
             */
            let paymentRecordCreated = false;
            let paymentRecordError = null;

            try {
                const paymentResponse = await fetch(`${API_BASE}/payments`, {
                    method: "POST",
                    headers: {
                        "Accept": "application/json",
                        "Content-Type": "application/json",
                        "Authorization": `Bearer ${token}`
                    },
                    body: JSON.stringify({
                        order_id: order.id,
                        payment_method: "cash"
                    })
                });

                const paymentResult = await paymentResponse.json().catch(() => ({}));

                if (!paymentResponse.ok || paymentResult.success !== true) {
                    // A duplicate payment may mean a previous attempt already
                    // created it. Verify before treating this as a failure.
                    if (paymentResponse.status === 409) {
                        const verifyResponse = await fetch(
                            `${API_BASE}/payments/order/${encodeURIComponent(order.id)}`,
                            {
                                headers: {
                                    "Accept": "application/json",
                                    "Authorization": `Bearer ${token}`
                                }
                            }
                        );
                        const verifyResult = await verifyResponse.json().catch(() => ({}));
                        paymentRecordCreated = verifyResponse.ok &&
                            verifyResult.success === true &&
                            Boolean(verifyResult.data?.payment);
                    }

                    if (!paymentRecordCreated) {
                        throw new Error(
                            paymentResult.message ||
                            `Payment record could not be created (HTTP ${paymentResponse.status}).`
                        );
                    }
                } else {
                    paymentRecordCreated = Boolean(paymentResult.data?.payment);
                }
            } catch (paymentError) {
                console.error("Order created but cash payment record failed:", paymentError);
                paymentRecordError = paymentError;
            }

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
       INITIALIZE
    ===================================================== */

    loadCart();
    updateOrderSummary();

    console.log("Checkout initialized. Cart items:", cart.length);
});
