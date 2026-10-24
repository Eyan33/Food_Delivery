
document.addEventListener("DOMContentLoaded", () => {
    "use strict";

    // =========================================================
    // CONFIGURATION
    // =========================================================

    const API_BASE = (window.FOOD_DELIVERY_API_BASE || document.querySelector('meta[name="api-base-url"]')?.content?.trim() || "http://localhost:5000/api").replace(/\/+$/, "");
    const TOKEN_KEY = "foodDeliveryAccessToken";

    const elements = {
        search: document.getElementById("orderSearch"),
        
        earningFilter: document.getElementById("earningFilter"),
        container: document.querySelector(".rider-orders-container"),
        emptyState: document.getElementById("riderEmptyOrders"),
        clearFilters: document.getElementById("clearOrderFilters"),
        message: document.getElementById("riderMessage"),
        statusButton: document.getElementById("riderStatusButton"),
        statusText: document.getElementById("riderStatusText"),
        menuButton: document.getElementById("riderMenuButton"),
        sidebar: document.getElementById("riderSidebar"),
        notificationButton: document.querySelector(".rider-notification-button"),
        badge: document.querySelector(".rider-nav-link.active .rider-nav-badge"),
        summaryCards: document.querySelectorAll(".rider-summary-card"),
        profileNames: document.querySelectorAll(
            ".rider-profile-info strong, .rider-topbar-profile-info strong"
        ),
        profileAvatars: document.querySelectorAll(
            ".rider-profile-avatar, .rider-topbar-avatar"
        )
    };

    let rider = null;
    let availableOrders = [];
    let loading = false;
    let messageTimer = null;

    // =========================================================
    // API
    // =========================================================

    function getToken() {
        return localStorage.getItem(TOKEN_KEY) ||
            sessionStorage.getItem(TOKEN_KEY);
    }

    async function apiRequest(path, options = {}) {
        const token = getToken();

        if (!token) {
            throw new Error("Please sign in to access available orders.");
        }

        const headers = {
            Accept: "application/json",
            Authorization: `Bearer ${token}`,
            ...(options.body ? { "Content-Type": "application/json" } : {}),
            ...(options.headers || {})
        };

        const response = await fetch(`${API_BASE}${path}`, {
            ...options,
            headers
        });

        const result = await response.json().catch(() => ({}));

        if (!response.ok || result.success === false) {
            throw new Error(
                result.message || `Request failed (${response.status}).`
            );
        }

        return result;
    }

    function getData(result, key) {
        if (Array.isArray(result?.data?.[key])) {
            return result.data[key];
        }

        if (Array.isArray(result?.[key])) {
            return result[key];
        }

        return [];
    }

    // =========================================================
    // UTILITIES
    // =========================================================

    function escapeHTML(value) {
        return String(value ?? "").replace(/[&<>"']/g, character => ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#39;"
        })[character]);
    }

    function money(value) {
        const amount = Number(value);

        if (!Number.isFinite(amount)) return "KSh 0";

        return `KSh ${amount.toLocaleString("en-KE", {
            maximumFractionDigits: 2
        })}`;
    }

    function getOrderNumber(order) {
        return order.order_number || `#${order.id}`;
    }

    function showMessage(text, type = "success") {
        if (!elements.message) {
            console[type === "error" ? "error" : "log"](text);
            return;
        }

        clearTimeout(messageTimer);

        elements.message.textContent = text;
        elements.message.className = `rider-message show ${type}`;
        elements.message.style.display = "block";

        messageTimer = setTimeout(() => {
            elements.message.classList.remove("show");
            elements.message.style.display = "none";
        }, 4000);
    }

    // =========================================================
    // RIDER PROFILE
    // =========================================================

    async function loadRiderProfile() {
        const result = await apiRequest("/riders/me");
        rider = result?.data?.rider || result?.rider || null;

        if (!rider) {
            throw new Error("Could not load your rider profile.");
        }

        const name = [
            rider.first_name,
            rider.last_name
        ].filter(Boolean).join(" ") ||
            rider.full_name ||
            rider.name ||
            "Delivery Rider";

        elements.profileNames.forEach(element => {
            element.textContent = name;
        });

        const initials = name
            .split(/\s+/)
            .filter(Boolean)
            .slice(0, 2)
            .map(part => part.charAt(0).toUpperCase())
            .join("") || "R";

        elements.profileAvatars.forEach(element => {
            element.textContent = initials;
        });

        renderOnlineStatus();
        renderSummary();
    }

    function renderOnlineStatus() {
        const button = elements.statusButton;
        const text = elements.statusText;

        if (!button || !text || !rider) return;

        const availability = String(rider.availability || "offline")
            .toLowerCase();

        const online = availability === "available";
        const onDelivery = availability === "on_delivery";

        button.classList.toggle("online", online);
        button.classList.toggle("offline", !online);
        button.setAttribute("aria-pressed", String(online));

        if (onDelivery) {
            text.textContent = "You're on a delivery";
            button.disabled = true;
            button.title = "Finish your delivery before changing availability.";
        } else {
            text.textContent = online ? "You're Online" : "You're Offline";
            button.disabled = false;
            button.title = online ? "Go offline" : "Go online";
        }
    }

    async function toggleAvailability() {
        if (!rider || rider.availability === "on_delivery") return;

        const button = elements.statusButton;
        const previousAvailability = rider.availability;
        const nextAvailability =
            previousAvailability === "available" ? "offline" : "available";

        if (button) button.disabled = true;

        try {
            const result = await apiRequest("/riders/me/availability", {
                method: "PATCH",
                body: JSON.stringify({ availability: nextAvailability })
            });

            rider = result?.data?.rider || result?.rider || rider;

            renderOnlineStatus();
            renderOrders();
            renderSummary();

            showMessage(
                rider.availability === "available"
                    ? "You are online and can accept available orders."
                    : "You are now offline.",
                "success"
            );
        } catch (error) {
            showMessage(error.message, "error");

            // Re-fetch the persisted state after a failed update.
            try {
                await loadRiderProfile();
            } catch (profileError) {
                console.error(profileError);
            }
        } finally {
            if (button && rider?.availability !== "on_delivery") {
                button.disabled = false;
            }
        }
    }

    // =========================================================
    // AVAILABLE ORDERS API
    // =========================================================

    async function loadAvailableOrders() {
        const result = await apiRequest("/riders/available-orders");
        availableOrders = getData(result, "orders");
    }

    async function refreshOrders() {
        if (loading) return;

        loading = true;

        if (elements.container) {
            elements.container.setAttribute("aria-busy", "true");
        }

        try {
            await loadAvailableOrders();
            renderOrders();
            renderSummary();
        } catch (error) {
            console.error("Failed to load available orders:", error);

            if (elements.container) {
                elements.container.innerHTML = `
                    <div class="rider-empty-orders">
                        <div class="rider-empty-orders-icon">!</div>
                        <h3>Unable to load orders</h3>
                        <p>${escapeHTML(error.message)}</p>
                        <button type="button"
                                class="rider-primary-button"
                                id="retryAvailableOrders">
                            Try Again
                        </button>
                    </div>
                `;

                document.getElementById("retryAvailableOrders")
                    ?.addEventListener("click", refreshOrders);
            }

            updateCount(0);
        } finally {
            loading = false;

            if (elements.container) {
                elements.container.setAttribute("aria-busy", "false");
            }
        }
    }

    // =========================================================
    // ORDER FILTERS
    // =========================================================

    function getFilteredOrders() {
        const search = elements.search?.value.trim().toLowerCase() || "";
        
        const minAmount = elements.earningFilter?.value || "all";

        return availableOrders.filter(order => {
            const searchableText = [
                order.order_number,
                order.restaurant_name,
                order.delivery_address,
                order.delivery_city,
                order.recipient_name
            ].filter(Boolean).join(" ").toLowerCase();

            if (search && !searchableText.includes(search)) {
                return false;
            }

            const amount = Number(order.delivery_fee ?? 0);

            if (
                minAmount !== "all" &&
                amount < Number(minAmount)
            ) {
                return false;
            }

            // Only show orders still eligible for pickup.
            return (
                String(order.status).toLowerCase() === "ready" &&
                (order.rider_id === null || order.rider_id === undefined)
            );
        });
    }

    function renderOrders() {
        if (!elements.container) return;

        const filteredOrders = getFilteredOrders();

        if (filteredOrders.length === 0) {
            elements.container.innerHTML = "";
            renderEmptyState();
            updateCount(0);
            return;
        }

        if (elements.emptyState) {
            elements.emptyState.hidden = true;
        }

        elements.container.innerHTML = filteredOrders
            .map(renderOrderCard)
            .join("");

        elements.container.querySelectorAll("[data-view-order]")
            .forEach(button => {
                button.addEventListener("click", () => {
                    const order = availableOrders.find(
                        item => String(item.id) === button.dataset.viewOrder
                    );

                    if (order) viewOrderDetails(order);
                });
            });

        elements.container.querySelectorAll("[data-accept-order]")
            .forEach(button => {
                button.addEventListener("click", () => {
                    acceptOrder(button.dataset.acceptOrder, button);
                });
            });

        updateCount(availableOrders.length);
    }

    function renderOrderCard(order) {
        const id = escapeHTML(order.id);
        const number = escapeHTML(getOrderNumber(order));
        const restaurant = escapeHTML(order.restaurant_name || "Restaurant");
        const pickupAddress = escapeHTML(
            order.restaurant_address || "Pickup location not provided"
        );
        const deliveryAddress = escapeHTML(
            [order.delivery_address, order.delivery_city]
                .filter(Boolean).join(", ") ||
            "Delivery address not provided"
        );
        const recipient = escapeHTML(order.recipient_name || "Customer");
        const amount = order.delivery_fee == null ? "Delivery fee unavailable" : money(order.delivery_fee);
        const online = rider?.availability === "available";

        return `
            <article class="rider-available-order" data-order-id="${id}">
                <div class="rider-available-order-header">
                    <div class="rider-order-restaurant">
                        <div class="rider-order-icon">◈</div>
                        <div>
                            <span class="rider-order-number">
                                Order ${number}
                            </span>
                            <h3>${restaurant}</h3>
                            <small>Ready for pickup</small>
                        </div>
                    </div>

                    <div class="rider-order-earning">
                        <span>Rider Delivery Fee</span>
                        <strong>${amount}</strong>
                    </div>
                </div>

                <div class="rider-available-order-body">
                    <div class="rider-order-location">
                        <span class="location-label">PICKUP</span>
                        <strong>${restaurant}</strong>
                        <p>${pickupAddress}</p>
                    </div>

                    <div class="rider-route-arrow">→</div>

                    <div class="rider-order-location">
                        <span class="location-label">DELIVERY</span>
                        <strong>${recipient}</strong>
                        <p>${deliveryAddress}</p>
                    </div>
                </div>

                <div class="rider-available-order-footer">
                    <div class="rider-order-meta">
                        <span>● Ready for pickup</span>
                        <span>● ${amount} delivery fee</span>
                    </div>

                    <div class="rider-order-actions">
                        <button type="button"
                                class="rider-secondary-button view-order-button"
                                data-view-order="${id}">
                            View Details
                        </button>

                        <button type="button"
                                class="rider-primary-button accept-order-button"
                                data-accept-order="${id}"
                                ${online ? "" : "disabled"}
                                title="${online ? "Accept this order" : "Go online to accept orders"}">
                            Accept Order
                        </button>
                    </div>
                </div>
            </article>
        `;
    }

    function renderEmptyState() {
        if (!elements.container) return;

        const search = elements.search?.value.trim() || "";
        const filtered =
            search ||
            (elements.earningFilter && elements.earningFilter.value !== "all") ||


        elements.container.innerHTML = `
            <div class="rider-empty-orders">
                <div class="rider-empty-orders-icon">◈</div>
                <h3>${filtered ? "No matching orders" : "No available orders"}</h3>
                <p>
                    ${
                        filtered
                            ? "Try changing your search or filters."
                            : "New orders will appear here when they are ready for pickup and have no rider assigned."
                    }
                </p>
                ${
                    filtered
                        ? `<button type="button"
                                   class="rider-secondary-button"
                                   id="emptyClearFilters">
                               Clear Filters
                           </button>`
                        : `<button type="button"
                                   class="rider-secondary-button"
                                   id="refreshAvailableOrders">
                               Refresh Orders
                           </button>`
                }
            </div>
        `;

        document.getElementById("emptyClearFilters")
            ?.addEventListener("click", clearFilters);

        document.getElementById("refreshAvailableOrders")
            ?.addEventListener("click", refreshOrders);

        if (elements.emptyState) {
            elements.emptyState.hidden = true;
        }
    }

    function updateCount(count) {
        if (elements.badge) {
            elements.badge.textContent = String(count);
            elements.badge.hidden = count === 0;
        }
    }

    function clearFilters() {
        if (elements.search) elements.search.value = "";
        
        if (elements.earningFilter) elements.earningFilter.value = "all";

        renderOrders();
        showMessage("Filters cleared.", "success");
    }

    // =========================================================
    // ORDER SUMMARY CARDS
    // =========================================================

    function renderSummary() {
        const cards = elements.summaryCards;
        if (!cards.length) return;

        // Card 1: available orders.
        const countElement = cards[0]?.querySelector("strong");
        if (countElement) {
            countElement.textContent = String(availableOrders.length);
        }

        // Card 2: distance cannot be calculated without coordinates.
        const nearestElement = cards[1]?.querySelector("strong");
        if (nearestElement) {
            nearestElement.textContent = "Not available";
        }

        // Card 3: highest delivery fee among currently available orders.
        const highestElement = cards[2]?.querySelector("strong");

        if (highestElement) {
            const fees = availableOrders.filter(order => order.delivery_fee != null);
            const highest = fees.reduce(
                (max, order) => Math.max(max, Number(order.delivery_fee) || 0),
                0
            );

            highestElement.textContent = fees.length
                ? money(highest)
                : "Not provided";
        }

        // Card 4: persisted rider availability.
        const statusElement = cards[3]?.querySelector("strong");

        if (statusElement) {
            const availability = rider?.availability || "offline";

            statusElement.textContent =
                availability === "available"
                    ? "Online"
                    : availability === "on_delivery"
                        ? "On Delivery"
                        : "Offline";
        }
    }

    // =========================================================
    // ACCEPT ORDER
    // =========================================================

    async function acceptOrder(id, button) {
        if (rider?.availability !== "available") {
            showMessage("Go online before accepting an order.", "error");
            return;
        }

        if (button.disabled) return;

        button.disabled = true;
        button.textContent = "Accepting...";

        try {
            const result = await apiRequest(
                `/riders/available-orders/${encodeURIComponent(id)}/accept`,
                { method: "POST" }
            );

            const acceptedOrder = result?.data?.order;
            const label = acceptedOrder
                ? getOrderNumber(acceptedOrder)
                : `#${id}`;

            showMessage(`${label} accepted successfully.`, "success");

            // Refresh from the server so the order disappears only after
            // the backend confirms that it has been assigned.
            await refreshOrders();
            if (!refreshTimer) refreshTimer = setInterval(refreshOrders, 30000);
        } catch (error) {
            showMessage(error.message, "error");

            // Another rider may have accepted it first.
            await refreshOrders();
        }
    }

    // =========================================================
    // ORDER DETAILS MODAL
    // =========================================================

    function viewOrderDetails(order) {
        let modal = document.getElementById("riderOrderDetailsModal");

        if (!modal) {
            modal = document.createElement("div");
            modal.id = "riderOrderDetailsModal";
            modal.className = "rider-order-details-overlay";
            modal.setAttribute("role", "dialog");
            modal.setAttribute("aria-modal", "true");
            modal.setAttribute("aria-labelledby", "riderOrderDetailsTitle");

            modal.innerHTML = `
                <div class="rider-order-details-modal">
                    <button type="button"
                            class="rider-order-details-close"
                            aria-label="Close details">
                        &times;
                    </button>
                    <div id="riderOrderDetailsContent"></div>
                </div>
            `;

            document.body.appendChild(modal);

            modal.addEventListener("click", event => {
                if (event.target === modal) closeDetailsModal();
            });

            modal.querySelector(".rider-order-details-close")
                .addEventListener("click", closeDetailsModal);
        }

        const content = modal.querySelector("#riderOrderDetailsContent");

        content.innerHTML = `
            <h2 id="riderOrderDetailsTitle">
                Order ${escapeHTML(getOrderNumber(order))}
            </h2>

            <p class="rider-order-details-status">Ready for pickup</p>

            <div class="rider-order-details-row">
                <span>Restaurant</span>
                <strong>${escapeHTML(order.restaurant_name || "Restaurant")}</strong>
            </div>

            <div class="rider-order-details-row">
                <span>Order value</span>
                <strong>${money(order.delivery_fee)}</strong>
            </div>

            <div class="rider-order-details-row">
                <span>Pickup address</span>
                <strong>
                    ${escapeHTML(order.restaurant_address || "Not provided")}
                </strong>
            </div>

            <div class="rider-order-details-row">
                <span>Recipient</span>
                <strong>${escapeHTML(order.recipient_name || "Customer")}</strong>
            </div>

            <div class="rider-order-details-row">
                <span>Delivery address</span>
                <strong>
                    ${escapeHTML(
                        [order.delivery_address, order.delivery_city]
                            .filter(Boolean).join(", ") || "Not provided"
                    )}
                </strong>
            </div>

            ${
                order.recipient_phone
                    ? `<div class="rider-order-details-row">
                           <span>Recipient phone</span>
                           <strong>${escapeHTML(order.recipient_phone)}</strong>
                       </div>`
                    : ""
            }

            ${
                order.delivery_instructions
                    ? `<div class="rider-order-details-row">
                           <span>Delivery instructions</span>
                           <strong>${escapeHTML(order.delivery_instructions)}</strong>
                       </div>`
                    : ""
            }

            <button type="button"
                    class="rider-primary-button rider-order-details-accept"
                    data-modal-accept="${escapeHTML(order.id)}"
                    ${rider?.availability === "available" ? "" : "disabled"}>
                Accept Order
            </button>
        `;

        modal.hidden = false;
        modal.classList.add("open");
        document.body.classList.add("rider-modal-open");

        content.querySelector("[data-modal-accept]")
            ?.addEventListener("click", async event => {
                const button = event.currentTarget;
                await acceptOrder(button.dataset.modalAccept, button);
                closeDetailsModal();
            });
    }

    function closeDetailsModal() {
        const modal = document.getElementById("riderOrderDetailsModal");

        if (modal) {
            modal.classList.remove("open");
            modal.hidden = true;
        }

        document.body.classList.remove("rider-modal-open");
    }

    // =========================================================
    // SEARCH AND FILTER EVENTS
    // =========================================================

    elements.search?.addEventListener("input", renderOrders);
    
    elements.earningFilter?.addEventListener("change", renderOrders);
    elements.clearFilters?.addEventListener("click", clearFilters);

    elements.statusButton?.addEventListener("click", toggleAvailability);

    // =========================================================
    // MOBILE SIDEBAR
    // =========================================================

    elements.menuButton?.addEventListener("click", event => {
        event.stopPropagation();
        elements.sidebar?.classList.toggle("active");
    });

    document.addEventListener("click", event => {
        if (
            elements.sidebar?.classList.contains("active") &&
            !elements.sidebar.contains(event.target) &&
            !elements.menuButton?.contains(event.target)
        ) {
            elements.sidebar.classList.remove("active");
        }
    });

    elements.sidebar?.querySelectorAll(".rider-nav-link").forEach(link => {
        link.addEventListener("click", () => {
            if (window.innerWidth <= 768) {
                elements.sidebar.classList.remove("active");
            }
        });
    });

    document.addEventListener("keydown", event => {
        if (event.key === "Escape") {
            closeDetailsModal();
            elements.sidebar?.classList.remove("active");
        }
    });

    // =========================================================
    // NOTIFICATIONS
    // =========================================================

    elements.notificationButton?.addEventListener("click", () => {
        showMessage("Notifications are not connected yet.", "info");
    });

    // =========================================================
    // MODAL STYLES
    // =========================================================

    const modalStyles = document.createElement("style");

    modalStyles.textContent = `
        .rider-order-details-overlay {
            position: fixed;
            inset: 0;
            z-index: 9999;
            display: none;
            align-items: center;
            justify-content: center;
            padding: 20px;
            background: rgba(15, 23, 42, 0.55);
            overflow-y: auto;
        }

        .rider-order-details-overlay.open {
            display: flex;
        }

        .rider-order-details-modal {
            position: relative;
            width: 100%;
            max-width: 560px;
            max-height: 90vh;
            overflow-y: auto;
            padding: 28px;
            border-radius: 14px;
            background: #fff;
            box-shadow: 0 20px 60px rgba(0, 0, 0, 0.2);
        }

        .rider-order-details-modal h2 {
            margin: 0 36px 8px 0;
            color: #0f172a;
            font-size: 22px;
        }

        .rider-order-details-close {
            position: absolute;
            top: 12px;
            right: 16px;
            border: 0;
            background: transparent;
            color: #64748b;
            font-size: 30px;
            cursor: pointer;
        }

        .rider-order-details-status {
            margin: 0 0 20px;
            color: #15803d;
            font-weight: 600;
        }

        .rider-order-details-row {
            display: flex;
            flex-direction: column;
            gap: 5px;
            padding: 12px 0;
            border-bottom: 1px solid #e2e8f0;
        }

        .rider-order-details-row span {
            color: #64748b;
            font-size: 12px;
        }

        .rider-order-details-row strong {
            color: #0f172a;
            font-size: 14px;
            overflow-wrap: anywhere;
        }

        .rider-order-details-accept {
            width: 100%;
            margin-top: 20px;
        }

        .rider-order-details-accept:disabled {
            opacity: 0.55;
            cursor: not-allowed;
        }

        body.rider-modal-open {
            overflow: hidden;
        }

        .rider-order-actions button:disabled {
            opacity: 0.55;
            cursor: not-allowed;
        }

        @media (max-width: 520px) {
            .rider-order-details-modal {
                padding: 22px 18px;
            }
        }
    `;

    document.head.appendChild(modalStyles);

    // =========================================================
    // AUTO REFRESH
    // =========================================================

    let refreshTimer = null;
    document.addEventListener("visibilitychange", () => {
        if (document.hidden) {
            if (refreshTimer) clearInterval(refreshTimer);
            refreshTimer = null;
        } else if (!refreshTimer) {
            refreshTimer = setInterval(refreshOrders, 30000);
        }
    });

    // =========================================================
    // INITIALIZE
    // =========================================================

    async function initialize() {
        try {
            await loadRiderProfile();
            await refreshOrders();
        } catch (error) {
            console.error("Available Orders initialization failed:", error);
            showMessage(error.message, "error");
        }
    }

    initialize();
});
