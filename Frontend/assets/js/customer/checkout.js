
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
    let currentCoordinates = null;
    let locationAddressReady = false;

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

    let checkoutQuote = null;
    let quoteRequestVersion = 0;

    async function refreshCheckoutQuote() {
        const version = ++quoteRequestVersion;
        checkoutQuote = null;
        updateOrderSummary();
        if (!cart.length) return;
        const token = getToken();
        if (!token) { showMessage("Log in to calculate your delivery fee and checkout total."); return; }
        if (!currentCoordinates) {
            checkoutQuote = null;
            updateOrderSummary();
            return;
        }
        const payload = {
            restaurant_id: Number(cart[0].restaurant_id),
            delivery_latitude: currentCoordinates.latitude,
            delivery_longitude: currentCoordinates.longitude,
            items: cart.map(item => ({ food_id: Number(item.id), quantity: Number(item.quantity), expected_price: Number(item.price) }))
        };
        try {
            const response = await fetch(`${API_BASE}/orders/checkout-quote`, { method: "POST", headers: { "Accept": "application/json", "Content-Type": "application/json", "Authorization": `Bearer ${token}` }, body: JSON.stringify(payload) });
            const result = await response.json().catch(() => ({}));
            if (version !== quoteRequestVersion) return;
            if (!response.ok || result.success !== true || !result.data) throw new Error(result.message || "Unable to calculate your delivery fee.");
            const quote = result.data;
            if (!Number.isFinite(Number(quote.delivery_fee)) || Number(quote.delivery_fee) < 0 || !Number.isFinite(Number(quote.total_amount))) throw new Error("The server returned an invalid checkout total.");
            checkoutQuote = quote;
            cart = cart.map(item => ({ ...item, delivery_fee: Number(quote.delivery_fee) }));
            try { localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cart)); } catch (storageError) { console.warn("Could not cache checkout quote:", storageError); }
            updateOrderSummary();
        } catch (error) { if (version !== quoteRequestVersion) return; checkoutQuote = null; updateOrderSummary(); showMessage(error.message || "Delivery fee could not be calculated. Please retry."); }
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
        const deliveryFee = checkoutQuote ? Number(checkoutQuote.delivery_fee) : getDeliveryFee();

        if (summaryCalculations) {
            summaryCalculations.innerHTML = `
                <div class="summary-row">
                    <span>Subtotal</span>
                    <strong>${formatCurrency(subtotal)}</strong>
                </div>
                <div class="summary-row">
                    <span>Delivery Fee</span>
                    <strong>${deliveryFee == null ? "Calculating…" : formatCurrency(deliveryFee)}</strong>
                </div>
            `;
        }

        if (summaryTotal) {
            const total = checkoutQuote ? Number(checkoutQuote.total_amount) : (deliveryFee == null ? null : subtotal + deliveryFee);
            summaryTotal.innerHTML = `
                <span>Total</span>
                <strong>${total == null ? "Calculating…" : formatCurrency(total)}</strong>
            `;
        }

        if (placeOrderButton) {
            placeOrderButton.disabled = false;
        }
    }

    /* =====================================================
       LIVE GPS LOCATION ONLY
    ===================================================== */

    const useCheckoutLocationButton = document.getElementById("useCheckoutLocationButton");
    const checkoutLocationStatus = document.getElementById("checkoutLocationStatus");

    function setLocationStatus(message) {
        if (checkoutLocationStatus) checkoutLocationStatus.textContent = message;
    }

    function setLocationButtonBusy(busy) {
        if (!useCheckoutLocationButton) return;
        useCheckoutLocationButton.disabled = busy;
        useCheckoutLocationButton.textContent = busy ? "Finding location…" : "Use My Current Location";
    }

    function updateDeliveryLocationHeader(value) {
        const locationText = document.querySelector(".location-text strong");
        if (locationText) locationText.textContent = value || "Live location required";
    }

    function requestCheckoutLocation() {
        if (!navigator.geolocation) {
            currentCoordinates = null;
            locationAddressReady = false;
            setLocationStatus("This browser does not support GPS. Enable location on a supported device/browser to place your order.");
            return;
        }

        setLocationButtonBusy(true);
        setLocationStatus("Requesting permission to access your live location…");

        navigator.geolocation.getCurrentPosition(async position => {
            currentCoordinates = {
                latitude: position.coords.latitude,
                longitude: position.coords.longitude
            };
            locationAddressReady = false;
            setLocationStatus("GPS location found. Resolving the delivery area…");

            try {
                const response = await fetch(
                    "https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=" +
                    encodeURIComponent(currentCoordinates.latitude) + "&lon=" +
                    encodeURIComponent(currentCoordinates.longitude) + "&zoom=18&addressdetails=1",
                    { headers: { Accept: "application/json" } }
                );
                if (!response.ok) throw new Error("Address lookup failed");

                const data = await response.json();
                const parts = data.address || {};
                const locality = parts.neighbourhood || parts.suburb || parts.city_district ||
                    parts.city || parts.town || parts.village || parts.municipality ||
                    parts.county || parts.state_district || parts.state || "";
                const formattedAddress = String(data.display_name || "").trim();

                if (address) address.value = formattedAddress || "GPS location detected";
                if (area) area.value = locality || "GPS location";
                locationAddressReady = Boolean(address?.value.trim() && area?.value.trim());
                updateDeliveryLocationHeader(locality || "Current GPS location");

                setLocationStatus(formattedAddress
                    ? "Live GPS location detected and filled automatically. You cannot type or select a different location here."
                    : "GPS coordinates captured. The address lookup returned no street address; your GPS coordinates will still be sent with the order.");
            } catch (error) {
                // Reverse geocoding is only for readable labels. Order delivery still uses the captured GPS coordinates.
                if (address) address.value = "GPS location detected";
                if (area) area.value = "GPS location";
                locationAddressReady = true;
                updateDeliveryLocationHeader("Current GPS location");
                setLocationStatus("Live GPS coordinates captured. A readable address could not be retrieved, but the GPS coordinates will be sent with the order.");
            } finally {
                setLocationButtonBusy(false);
                if (currentCoordinates && locationAddressReady) await refreshCheckoutQuote();
            }
        }, error => {
            currentCoordinates = null;
            locationAddressReady = false;
            if (address) address.value = "";
            if (area) area.value = "";
            updateDeliveryLocationHeader("Live location required");
            setLocationStatus(error.code === 1
                ? "Location permission was denied. Enable location permission to continue; manual address entry is disabled."
                : "Unable to get your live location. Check device location services and try again; manual address entry is disabled.");
            setLocationButtonBusy(false);
        }, { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 });
    }

    useCheckoutLocationButton?.addEventListener("click", requestCheckoutLocation);

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

        if (!checkoutQuote || !Number.isFinite(Number(checkoutQuote.delivery_fee))) {
            showMessage("Your delivery fee and order total are still being calculated. Please wait or retry checkout.");
            refreshCheckoutQuote();
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

        if (!currentCoordinates || !locationAddressReady) {
            showMessage("Please select Use My Current Location and allow GPS access before placing your order.");
            useCheckoutLocationButton?.focus();
            return false;
        }


        if (!["cash", "mpesa"].includes(getPaymentMethod())) {
            showMessage("Please choose Cash on Delivery or M-Pesa.");
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
            address_id: null,
            delivery_latitude: currentCoordinates ? currentCoordinates.latitude : null,
            delivery_longitude: currentCoordinates ? currentCoordinates.longitude : null,
            expected_delivery_fee: Number(checkoutQuote.delivery_fee),
            payment_method: getPaymentMethod(),
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
            placeOrderButton.textContent = getPaymentMethod() === "mpesa" ? "Waiting for payment…" : "Placing Order...";
        }

        try {
            const payload = buildOrderPayload();

            if (getPaymentMethod() === "mpesa") {
                let sessionId = sessionStorage.getItem("foodDeliveryMpesaCheckoutSessionId");
                if (!sessionId) {
                    const startResponse = await fetch(`${API_BASE}/payments/mpesa/stk-push`, {
                        method: "POST",
                        headers: {
                            "Accept": "application/json",
                            "Content-Type": "application/json",
                            "Authorization": `Bearer ${token}`
                        },
                        body: JSON.stringify({
                            phone_number: phone.value.trim(),
                            order_payload: payload
                        })
                    });
                    const startResult = await startResponse.json().catch(() => ({}));
                    if (!startResponse.ok || startResult.success !== true) {
                        throw new Error(startResult.message || "Unable to start M-Pesa payment.");
                    }
                    sessionId = startResult.data?.checkout_session_id;
                    if (!sessionId) throw new Error("M-Pesa started without returning a checkout session.");
                    sessionStorage.setItem("foodDeliveryMpesaCheckoutSessionId", String(sessionId));
                    showMessage(startResult.message || "Check your phone and enter your M-Pesa PIN.", "success");
                } else {
                    showMessage("Your M-Pesa request is still being checked. Do not submit another payment.", "success");
                }

                // Do not create an order or clear the cart until the provider callback confirms payment.
                const deadline = Date.now() + 180000;
                while (Date.now() < deadline) {
                    await new Promise(resolve => window.setTimeout(resolve, 3000));
                    const statusResponse = await fetch(`${API_BASE}/payments/mpesa/session/${encodeURIComponent(sessionId)}`, {
                        headers: { "Accept": "application/json", "Authorization": `Bearer ${token}` }
                    });
                    const statusResult = await statusResponse.json().catch(() => ({}));
                    if (!statusResponse.ok || statusResult.success !== true) {
                        throw new Error(statusResult.message || "Unable to check M-Pesa payment status.");
                    }
                    const session = statusResult.data;
                    if (session.status === "completed" && session.order_id) {
                        localStorage.removeItem(CART_STORAGE_KEY);
                        cart = [];
                        sessionStorage.removeItem("foodDeliveryMpesaCheckoutSessionId");
                        sessionStorage.setItem("foodDeliveryLastOrderId", String(session.order_id));
                        showMessage("Payment confirmed and order placed successfully.", "success");
                        if (placeOrderButton) placeOrderButton.textContent = "Payment Confirmed";
                        window.setTimeout(() => { window.location.href = "orders.html"; }, 1500);
                        return;
                    }
                    if (session.status === "failed") {
                        sessionStorage.removeItem("foodDeliveryMpesaCheckoutSessionId");
                        throw new Error("M-Pesa payment failed or was cancelled. No order was created. You can try again.");
                    }
                    showMessage("Waiting for M-Pesa confirmation. Your order will only be created after payment succeeds.", "success");
                }
                throw new Error("Payment confirmation is taking longer than expected. Keep this page open or return later; do not start another payment.");
            }

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
                throw new Error(result.message || "Your session has expired or you do not have permission. Please log in again.");
            }
            if (!response.ok || result.success !== true) {
                throw new Error(result.message || `Unable to place order (HTTP ${response.status}).`);
            }
            const order = result.data?.order;
            if (!order || order.id == null) {
                throw new Error("The server response did not include the created order. Check order history before trying again.");
            }
            localStorage.removeItem(CART_STORAGE_KEY);
            cart = [];
            sessionStorage.setItem("foodDeliveryLastOrderId", String(order.id));
            showMessage(`Order ${order.order_number || order.id} placed successfully. Pay cash on delivery.`, "success");
            if (placeOrderButton) placeOrderButton.textContent = "Order Placed";
            window.setTimeout(() => { window.location.href = "orders.html"; }, 1500);
        } catch (error) {
            console.error("Checkout failed:", error);
            showMessage(error.message || "Something went wrong during checkout.");
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
    refreshCheckoutQuote();

    console.log("Checkout initialized. Cart items:", cart.length);
});
