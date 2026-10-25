/* =========================================================
   CUSTOMER ORDER DETAILS
   Authenticated order details with retry and automatic refresh.
   ========================================================= */
document.addEventListener("DOMContentLoaded", () => {
    "use strict";

    const API_BASE = (window.FOOD_DELIVERY_API_BASE || document.querySelector('meta[name="api-base-url"]')?.content?.trim() || "http://localhost:5000/api").replace(/\/+$/, "");
    const TOKEN_KEY = "foodDeliveryAccessToken";
    const pageHeader = document.querySelector(".order-details-header");
    const timeline = document.querySelector(".order-timeline");
    const restaurantInfo = document.querySelector(".restaurant-order-info");
    const orderItemsContainer = document.querySelector(".order-detail-items");
    const deliveryInfo = document.querySelector(".delivery-info-grid");
    const summaryCard = document.querySelector(".summary-card");
    const paymentCard = document.querySelector(".payment-card");
    const actionMessage = document.getElementById("orderActionMessage");
    const refreshButton = document.getElementById("refreshOrderButton");
    let currentOrder = null;
    let loading = false;
    let lastLoadFailed = false;

    function escapeHtml(value) {
        return String(value ?? "").replace(/[&<>"']/g, character => ({
            "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
        })[character]);
    }
    function formatMoney(value) {
        const amount = Number(value);
        return Number.isFinite(amount) ? `KSh ${amount.toLocaleString("en-KE", {minimumFractionDigits: 0, maximumFractionDigits: 2})}` : "Not available";
    }
    function formatDate(value) {
        if (!value) return "Not recorded";
        const date = new Date(value);
        return Number.isNaN(date.getTime()) ? "Not available" : date.toLocaleString("en-KE", {dateStyle: "medium", timeStyle: "short"});
    }
    function getToken() {
        try { return localStorage.getItem(TOKEN_KEY) || sessionStorage.getItem(TOKEN_KEY); }
        catch (_) { return null; }
    }
    function getOrderId() { return new URLSearchParams(window.location.search).get("id"); }
    function getStatusLabel(status) {
        const labels = {pending:"Pending", confirmed:"Confirmed", preparing:"Preparing", ready:"Ready for pickup", out_for_delivery:"Out for delivery", delivered:"Delivered", cancelled:"Cancelled"};
        const normalized = String(status || "").toLowerCase();
        return labels[normalized] || (normalized ? normalized.replaceAll("_", " ") : "Unknown");
    }
    function showMessage(message, type = "info") {
        if (!actionMessage) return;
        actionMessage.textContent = message;
        actionMessage.className = `order-action-message ${type}`;
        actionMessage.setAttribute("role", type === "error" ? "alert" : "status");
        actionMessage.setAttribute("aria-live", "polite");
    }
    function setPageMessage(message, type = "info", showRetry = false) {
        const container = document.querySelector(".order-details-container");
        if (!container) return;
        let element = document.getElementById("orderLoadMessage");
        if (!element) {
            element = document.createElement("div");
            element.id = "orderLoadMessage";
            element.className = "order-load-message";
            element.setAttribute("role", type === "error" ? "alert" : "status");
            const backLink = container.querySelector(".order-back-link");
            if (backLink) backLink.insertAdjacentElement("afterend", element);
            else container.prepend(element);
        }
        element.className = `order-load-message ${type}`;
        element.textContent = message;
        element.setAttribute("role", type === "error" ? "alert" : "status");
        let retry = element.querySelector("button");
        if (showRetry && !retry) {
            retry = document.createElement("button");
            retry.type = "button";
            retry.className = "secondary-action-button";
            retry.textContent = "Try again";
            retry.addEventListener("click", () => loadOrder({manual: true}));
            element.append(" ", retry);
        } else if (!showRetry && retry) retry.remove();
    }
    function clearLoadMessage() {
        document.getElementById("orderLoadMessage")?.remove();
    }
    function updateHeading(order) {
        if (!pageHeader) return;
        const title = pageHeader.querySelector("h1");
        const description = pageHeader.querySelector("p");
        const badge = pageHeader.querySelector(".order-status");
        if (title) title.textContent = `Order #${order.order_number || order.id}`;
        if (description) description.textContent = `Placed ${formatDate(order.placed_at || order.created_at)}`;
        if (badge) {
            const status = String(order.status || "unknown").toLowerCase();
            badge.textContent = getStatusLabel(status);
            badge.className = `order-status status-${status.replace(/[^a-z0-9_-]/g, "")}`;
        }
    }

    function renderTimeline(order) {
        if (!timeline) return;
        const status = String(order.status || "pending").toLowerCase();
        if (status === "cancelled") {
            timeline.innerHTML = `<div class="timeline-step current"><div class="timeline-icon">!</div><div class="timeline-content"><strong>Order Cancelled</strong><span>${escapeHtml(formatDate(order.cancelled_at))}</span></div></div>`;
            return;
        }
        const steps = [
            {key:"pending", title:"Order Placed", description:"Your order has been received", date:order.placed_at || order.created_at},
            {key:"confirmed", title:"Confirmed", description:"The restaurant confirmed your order", date:order.confirmed_at},
            {key:"preparing", title:"Preparing", description:"Your food is being prepared", date:order.preparing_at},
            {key:"ready", title:"Ready for Pickup", description:"Your order is ready for the rider", date:order.ready_at},
            {key:"out_for_delivery", title:"Out for Delivery", description:"Your order is on its way", date:order.out_for_delivery_at},
            {key:"delivered", title:"Delivered", description:"Your order has been delivered", date:order.delivered_at}
        ];
        const currentIndex = steps.findIndex(step => step.key === status);
        timeline.innerHTML = steps.map((step, index) => {
            const reached = index === 0 ? Boolean(step.date) : Boolean(step.date);
            let className = "timeline-step";
            let icon = String(index + 1);
            if (index === currentIndex) className += " current";
            else if (reached && (currentIndex < 0 || index < currentIndex)) { className += " completed"; icon = "✓"; }
            let detail = step.date ? formatDate(step.date) : step.description;
            if (index < currentIndex && !step.date) detail = "Previous stage; timestamp not recorded";
            if (index === currentIndex && !step.date) detail = `${step.description} · timestamp not recorded`;
            return `<div class="${className}"><div class="timeline-icon">${icon}</div><div class="timeline-content"><strong>${escapeHtml(step.title)}</strong><span>${escapeHtml(detail)}</span></div></div>`;
        }).join("");
    }
    function renderRestaurant(order) {
        if (!restaurantInfo) return;
        const name = order.restaurant_name || "Restaurant";
        const logo = order.restaurant_logo;
        restaurantInfo.innerHTML = `<div class="restaurant-order-avatar">${logo ? `<img src="${escapeHtml(logo)}" alt="${escapeHtml(name)}" style="width:100%;height:100%;object-fit:cover;border-radius:inherit;">` : escapeHtml(name.charAt(0).toUpperCase())}</div><div class="restaurant-order-details"><h3>${escapeHtml(name)}</h3><p>Restaurant</p></div>`;
        const image = restaurantInfo.querySelector("img");
        if (image) image.addEventListener("error", () => { image.remove(); const avatar = restaurantInfo.querySelector(".restaurant-order-avatar"); if (avatar) avatar.textContent = name.charAt(0).toUpperCase(); });
    }
    function renderItems(order) {
        if (!orderItemsContainer) return;
        const items = Array.isArray(order.items) ? order.items : [];
        if (!items.length) { orderItemsContainer.innerHTML = '<p class="order-empty-state">No item details were returned for this order.</p>'; return; }
        orderItemsContainer.innerHTML = items.map(item => {
            const name = item.food_name || item.name || "Food item";
            const quantity = Math.max(0, Number(item.quantity) || 0);
            const unitPrice = Number(item.unit_price);
            const imageUrl = item.image_url;
            return `<div class="order-detail-item"><div class="order-item-image">${imageUrl ? `<img src="${escapeHtml(imageUrl)}" alt="${escapeHtml(name)}" style="width:100%;height:100%;object-fit:cover;">` : escapeHtml(name.charAt(0).toUpperCase())}</div><div class="order-item-info"><h3>${escapeHtml(name)}</h3><p>Quantity: ${quantity}</p><p>Unit price: ${formatMoney(unitPrice)}</p></div><div class="order-item-price">${formatMoney(item.subtotal ?? unitPrice * quantity)}</div></div>`;
        }).join("");
        orderItemsContainer.querySelectorAll("img").forEach(image => image.addEventListener("error", () => { const parent = image.parentElement; if (parent) parent.textContent = image.alt.charAt(0).toUpperCase(); }));
    }
    function renderDeliveryInfo(order) {
        if (!deliveryInfo) return;
        const fields = [
            {label:"Delivery Address", value:[order.delivery_address, order.delivery_city].filter(Boolean).join(", ") || "Not provided"},
            {label:"Recipient", value:order.recipient_name || "Not provided"},
            {label:"Contact Phone", value:order.recipient_phone || order.delivery_phone || "Not provided"},
            {label:"Delivery Instructions", value:order.delivery_instructions || "None"},
            {label:"Order Number", value:order.order_number || order.id},
            {label:"Date Placed", value:formatDate(order.placed_at || order.created_at)}
        ];
        deliveryInfo.innerHTML = fields.map(field => `<div class="delivery-info-item"><span class="info-label">${escapeHtml(field.label)}</span><strong>${escapeHtml(field.value)}</strong></div>`).join("");
    }
    function normalizePaymentMethod(value) {
        const raw = String(value || "").trim().toLowerCase().replace(/[\s_-]+/g, "");
        if (!raw) return "Not recorded";
        if (raw === "mpesa") return "M-Pesa";
        if (raw === "cash") return "Cash";
        if (raw === "card") return "Card";
        return String(value).trim().replaceAll("_", " ");
    }
    function normalizePaymentStatus(value) {
        const raw = String(value || "").trim().toLowerCase().replace(/[\s-]+/g, "_");
        const labels = {pending:"Pending", paid:"Paid", completed:"Paid", succeeded:"Paid", failed:"Failed", refunded:"Refunded", cancelled:"Cancelled", canceled:"Cancelled", processing:"Processing"};
        return labels[raw] || (raw ? raw.replaceAll("_", " ") : "Payment record missing");
    }
    function renderPayment(order) {
        if (!paymentCard) return;
        const statusElement = paymentCard.querySelector(".payment-status");
        const methodElement = paymentCard.querySelector(".payment-method") || paymentCard.querySelector(".payment-info > div:nth-child(2) strong");
        const method = normalizePaymentMethod(order.payment_method);
        const status = normalizePaymentStatus(order.payment_status);
        if (methodElement) methodElement.textContent = method;
        if (statusElement) {
            statusElement.textContent = status;
            statusElement.className = `payment-status payment-status-${String(order.payment_status || "missing").toLowerCase().replace(/[^a-z0-9_-]/g, "")}`;
            statusElement.title = order.payment_status ? "Status returned by the payment record" : "No payment record was returned for this order";
        }
        const methodLabel = paymentCard.querySelector(".payment-info > div:nth-child(2) span");
        if (methodLabel) methodLabel.textContent = order.payment_status ? "Payment method" : "Payment record not found";
    }
    function renderSummary(order) {
        if (!summaryCard) return;
        const items = Array.isArray(order.items) ? order.items : [];
        const restaurant = summaryCard.querySelector(".summary-restaurant");
        const itemContainer = summaryCard.querySelector(".summary-items");
        const total = summaryCard.querySelector(".summary-total strong");
        if (restaurant) restaurant.innerHTML = `<strong>${escapeHtml(order.restaurant_name || "Restaurant")}</strong><span>Order #${escapeHtml(order.order_number || order.id)}</span>`;
        if (itemContainer) {
            itemContainer.innerHTML = items.length ? items.map(item => {
                const name = item.food_name || item.name || "Food item";
                const quantity = Math.max(0, Number(item.quantity) || 0);
                const amount = Number(item.subtotal ?? (Number(item.unit_price) || 0) * quantity);
                return `<div class="summary-row"><span>${escapeHtml(name)} × ${quantity}</span><strong>${formatMoney(amount)}</strong></div>`;
            }).join("") : '<p class="order-empty-state">No item details available.</p>';
        }
        const outsideRows = [...summaryCard.querySelectorAll(".summary-row")].filter(row => !row.closest(".summary-items"));
        const subtotalRow = outsideRows.find(row => row.querySelector("span")?.textContent.trim().toLowerCase() === "subtotal");
        const deliveryRow = outsideRows.find(row => row.querySelector("span")?.textContent.trim().toLowerCase() === "delivery fee");
        if (subtotalRow?.querySelector("strong")) subtotalRow.querySelector("strong").textContent = formatMoney(order.subtotal);
        if (deliveryRow?.querySelector("strong")) deliveryRow.querySelector("strong").textContent = formatMoney(order.delivery_fee);
        if (total) total.textContent = formatMoney(order.total_amount);
    }

    async function loadOrder(options = {}) {
        if (loading) return;
        const orderId = getOrderId();
        if (!orderId || !/^[1-9]\d*$/.test(orderId)) {
            setPageMessage("A valid order ID is missing from the URL. Open this page from your Orders list.", "error");
            return;
        }
        const token = getToken();
        if (!token) {
            setPageMessage("You are not signed in or your session has expired. Please sign in and open this order again.", "error");
            return;
        }
        loading = true;
        if (refreshButton) { refreshButton.disabled = true; refreshButton.textContent = "Refreshing…"; }
        if (!currentOrder || options.manual) setPageMessage(currentOrder ? "Refreshing order details…" : "Loading order details…");
        try {
            const response = await fetch(`${API_BASE}/orders/my-orders/${encodeURIComponent(orderId)}`, {
                method:"GET", headers:{Accept:"application/json", Authorization:`Bearer ${token}`}, cache:"no-store"
            });
            const result = await response.json().catch(() => ({}));
            if (response.status === 401 || response.status === 403) throw new Error("Your session has expired or you are not authorized to view this order. Please sign in again.");
            if (response.status === 404) throw new Error("This order was not found in your account. Check the Orders page and try again.");
            if (!response.ok || result.success === false) throw new Error(result.message || `The server could not load this order (HTTP ${response.status}).`);
            const order = result.data?.order || result.order;
            if (!order || order.id == null) throw new Error("The server response did not contain valid order details.");
            currentOrder = order;
            updateHeading(order);
            renderTimeline(order);
            renderRestaurant(order);
            renderItems(order);
            renderDeliveryInfo(order);
            renderSummary(order);
            renderPayment(order);
            clearLoadMessage();
            if (options.manual) showMessage("Order details refreshed.", "success");
            document.title = `Order #${order.order_number || order.id} | FoodDelivery`;
            lastLoadFailed = false;
        } catch (error) {
            console.error("Failed to load order details:", error);
            const message = error instanceof TypeError
                ? "Could not reach the server. Check your internet connection and try again."
                : (error.message || "Unable to load order details. Please try again.");
            if (currentOrder) showMessage(`Refresh failed: ${message} The last loaded details are still shown.`, "error");
            else setPageMessage(message, "error", true);
            lastLoadFailed = true;
        } finally {
            loading = false;
            if (refreshButton) { refreshButton.disabled = false; refreshButton.textContent = "Refresh order"; }
        }
    }

    // Remove any remaining static fallback content immediately; only API data should populate order fields.
    if (timeline) timeline.innerHTML = "<p>Loading order status…</p>";
    if (restaurantInfo) restaurantInfo.innerHTML = "<p>Loading restaurant…</p>";
    if (orderItemsContainer) orderItemsContainer.innerHTML = "<p>Loading order items…</p>";
    if (deliveryInfo) deliveryInfo.innerHTML = "<p>Loading delivery information…</p>";
    if (refreshButton) refreshButton.addEventListener("click", () => loadOrder({manual:true}));
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
    loadOrder();
    window.setInterval(() => { if (!document.hidden && !loading && currentOrder) loadOrder(); }, 30000);
});
