
document.addEventListener("DOMContentLoaded", () => {
    "use strict";

    // =========================================================
    // CONFIGURATION
    // =========================================================

    const API_BASE = (window.FOOD_DELIVERY_API_BASE || document.querySelector('meta[name="api-base-url"]')?.content?.trim() || "http://localhost:5000/api").replace(/\/+$/, "");
    const TOKEN_KEY = "foodDeliveryAccessToken";

    const elements = {
        statusButton: document.getElementById("riderStatusButton"),
        statusText: document.getElementById("riderStatusText"),
        message: document.getElementById("riderMessage"),
        sidebar: document.getElementById("riderSidebar"),
        menuButton: document.getElementById("riderMenuButton"),
        availableList: document.querySelector(".rider-orders-list"),
        deliveryContent: document.querySelector(".rider-delivery-content"),
        deliveryStatus: document.querySelector(
            ".active-delivery-card .rider-order-status"
        ),
        recentTable: document.querySelector(".rider-table tbody"),
        summaryList: document.querySelector(".rider-summary-list"),
        statCards: document.querySelectorAll(".rider-stat-card"),
        notificationButton: document.querySelector(".rider-notification-button"),
        notificationBadge: document.querySelector(".rider-notification-button .notification-badge"),
        greeting: document.querySelector(".rider-page-header h2"),
        availableBadge: document.querySelector(".rider-nav-badge")
    };

    let rider = null;
    let availableOrders = [];
    let myOrders = [];
    let earnings = null;
    let refreshTimer = null;
    let messageTimeout = null;
    let isRefreshing = false;

    // =========================================================
    // API HELPERS
    // =========================================================

    function getToken() {
        return (
            localStorage.getItem(TOKEN_KEY) ||
            sessionStorage.getItem(TOKEN_KEY)
        );
    }

    async function apiRequest(path, options = {}) {
        const token = getToken();

        if (!token) {
            throw new Error("Please sign in to access your rider dashboard.");
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
                result.message ||
                `Request failed with status ${response.status}.`
            );
        }

        return result;
    }

    function getResponseData(result, key) {
        if (Array.isArray(result?.data?.[key])) {
            return result.data[key];
        }

        if (Array.isArray(result?.[key])) {
            return result[key];
        }

        if (Array.isArray(result?.data)) {
            return result.data;
        }

        return [];
    }

    // =========================================================
    // FORMATTING AND UTILITIES
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

        if (!Number.isFinite(amount)) {
            return "KSh 0";
        }

        return `KSh ${amount.toLocaleString("en-KE", {
            minimumFractionDigits: 0,
            maximumFractionDigits: 2
        })}`;
    }

    function orderNumber(order) {
        return order.order_number || `#${order.id}`;
    }

    function getStatus(order) {
        return String(order?.status || "pending").toLowerCase();
    }

    function formatStatus(status) {
        const labels = {
            pending: "Pending",
            confirmed: "Confirmed",
            preparing: "Preparing",
            ready: "Ready for Pickup",
            out_for_delivery: "Out for Delivery",
            delivered: "Completed",
            cancelled: "Cancelled"
        };

        return labels[status] || status.replaceAll("_", " ");
    }

    function validDate(value) {
        if (!value) return null;

        const date = new Date(value);

        return Number.isNaN(date.getTime()) ? null : date;
    }

    function isToday(value) {
        const date = validDate(value);

        if (!date) return false;

        const now = new Date();

        return (
            date.getFullYear() === now.getFullYear() &&
            date.getMonth() === now.getMonth() &&
            date.getDate() === now.getDate()
        );
    }

    function getCompletedDate(order) {
        return order.delivered_at || order.updated_at || order.placed_at;
    }

    function showMessage(text, type = "info") {
        if (!elements.message) {
            console[type === "error" ? "error" : "log"](text);
            return;
        }

        clearTimeout(messageTimeout);

        elements.message.textContent = text;
        elements.message.hidden = false;
        elements.message.classList.remove("error", "success", "info");
        elements.message.classList.add("show", type);

        messageTimeout = setTimeout(() => {
            elements.message.classList.remove("show");
            elements.message.hidden = true;
        }, 4000);
    }

    function setStatValue(cardIndex, value, smallText) {
        const card = elements.statCards[cardIndex];

        if (!card) return;

        const strong = card.querySelector(".rider-stat-content strong");
        const small = card.querySelector(".rider-stat-content small");

        if (strong) {
            strong.textContent = value;
        }

        if (small && smallText !== undefined) {
            small.textContent = smallText;
        }
    }

    // =========================================================
    // RIDER PROFILE AND ONLINE STATUS
    // =========================================================

    function renderAvailability() {
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

    async function loadProfile() {
        const result = await apiRequest("/riders/me");

        rider = result?.data?.rider || result?.rider || null;

        if (!rider) {
            throw new Error("The rider profile could not be loaded.");
        }

        renderRiderIdentity();
        renderAvailability();
    }

    function renderRiderIdentity() {
        const first = rider?.first_name || rider?.user?.first_name || "";
        const last = rider?.last_name || rider?.user?.last_name || "";
        const fullName = [first, last].filter(Boolean).join(" ").trim();
        const displayName = fullName || rider?.name || "Rider";
        const initials = displayName.split(/\s+/).map(part => part[0]).join("").slice(0, 2).toUpperCase() || "R";

        document.querySelectorAll(".rider-profile-info strong, .rider-topbar-profile-info strong").forEach(el => {
            el.textContent = displayName;
        });
        document.querySelectorAll(".rider-profile-avatar, .rider-topbar-avatar").forEach(el => {
            el.textContent = initials;
            el.setAttribute("aria-label", displayName);
        });
        if (elements.greeting) {
            const hour = new Date().getHours();
            const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
            elements.greeting.textContent = greeting + ", " + displayName;
        }
    }

    async function toggleAvailability() {
        if (!rider || rider.availability === "on_delivery") {
            return;
        }

        const button = elements.statusButton;
        const previousAvailability = rider.availability;

        const nextAvailability =
            previousAvailability === "available" ? "offline" : "available";

        if (button) button.disabled = true;

        try {
            const result = await apiRequest("/riders/me/availability", {
                method: "PATCH",
                body: JSON.stringify({
                    availability: nextAvailability
                })
            });

            rider = result?.data?.rider || result?.rider || rider;

            renderAvailability();

            showMessage(
                rider.availability === "available"
                    ? "You are online and available for orders."
                    : "You are now offline.",
                "success"
            );

            await loadDashboardData();
        } catch (error) {
            showMessage(error.message, "error");

            // Restore the previously confirmed state.
            rider.availability = previousAvailability;
            renderAvailability();
        } finally {
            if (button && rider?.availability !== "on_delivery") {
                button.disabled = false;
            }
        }
    }

    // =========================================================
    // AVAILABLE ORDERS
    // =========================================================

    function renderAvailableOrders() {
        const list = elements.availableList;

        if (!list) return;

        if (availableOrders.length === 0) {
            list.innerHTML = `
                <p class="rider-empty-state">
                    No orders are currently waiting for pickup.
                </p>
            `;

            updateAvailableOrderBadge();
            return;
        }

        const online = rider?.availability === "available";

        list.innerHTML = availableOrders.map(order => `
            <div
                class="rider-order-item"
                data-order-id="${escapeHTML(order.id)}"
            >
                <div class="rider-order-item-main">
                    <div class="rider-order-icon">◈</div>

                    <div>
                        <strong>
                            Order ${escapeHTML(orderNumber(order))}
                        </strong>

                        <span>
                            ${escapeHTML(order.restaurant_name || "Restaurant")}
                        </span>

                        <small>
                            ${escapeHTML(order.delivery_city || "")}
                            ${
                                order.delivery_address
                                    ? ` · ${escapeHTML(order.delivery_address)}`
                                    : ""
                            }
                        </small>
                    </div>
                </div>

                <div class="rider-order-item-right">
                    <strong>${money(order.total_amount)}</strong>

                    <button
                        type="button"
                        class="rider-small-button"
                        data-accept-order="${escapeHTML(order.id)}"
                        ${online ? "" : "disabled"}
                    >
                        Accept
                    </button>
                </div>
            </div>
        `).join("");

        list.querySelectorAll("[data-accept-order]").forEach(button => {
            button.addEventListener("click", () => {
                acceptOrder(button.dataset.acceptOrder, button);
            });
        });

        updateAvailableOrderBadge();
    }

    function updateAvailableOrderBadge() {
        const badge = document.querySelector(".rider-nav-badge");

        if (badge) {
            badge.textContent = String(availableOrders.length);
            badge.hidden = availableOrders.length === 0;
        }
    }

    async function acceptOrder(id, button) {
        if (rider?.availability !== "available") {
            showMessage("Go online before accepting an order.", "error");
            return;
        }

        if (button) {
            button.disabled = true;
            button.textContent = "Accepting...";
        }

        try {
            const result = await apiRequest(
                `/riders/available-orders/${encodeURIComponent(id)}/accept`,
                { method: "POST" }
            );

            const acceptedOrder = result?.data?.order;

            showMessage(
                acceptedOrder
                    ? `Order ${orderNumber(acceptedOrder)} has been assigned to you.`
                    : "Order accepted successfully.",
                "success"
            );

            await loadDashboardData();
        } catch (error) {
            showMessage(error.message, "error");

            try {
                await loadDashboardData();
            } catch (refreshError) {
                console.error("Could not refresh orders:", refreshError);
            }
        }
    }

    // =========================================================
    // ACTIVE DELIVERY
    // =========================================================

    function getActiveOrders() {
        return myOrders
            .filter(order =>
                ["ready", "out_for_delivery"].includes(getStatus(order))
            )
            .sort((a, b) => {
                const dateA = validDate(a.placed_at)?.getTime() || 0;
                const dateB = validDate(b.placed_at)?.getTime() || 0;

                return dateA - dateB;
            });
    }

    function renderMyDelivery() {
        const content = elements.deliveryContent;

        if (!content) return;

        const activeOrders = getActiveOrders();
        const activeOrder = activeOrders[0];

        if (!activeOrder) {
            if (elements.deliveryStatus) {
                elements.deliveryStatus.textContent = "No Active Delivery";
            }

            content.innerHTML = `
                <p class="rider-empty-state">
                    You don't have an active delivery yet.
                    Accept an available order when you're online.
                </p>
            `;

            return;
        }

        const status = getStatus(activeOrder);
        const outForDelivery = status === "out_for_delivery";

        if (elements.deliveryStatus) {
            elements.deliveryStatus.textContent = formatStatus(status);
        }

        content.innerHTML = `
            <div class="rider-order-header">
                <div>
                    <span class="rider-order-number">
                        Order ${escapeHTML(orderNumber(activeOrder))}
                    </span>

                    <strong>${money(activeOrder.total_amount)}</strong>
                </div>

                <span class="rider-order-time">
                    ${escapeHTML(formatStatus(status))}
                </span>
            </div>

            <div class="rider-route">
                <div class="rider-route-item">
                    <span class="rider-route-dot restaurant"></span>

                    <div>
                        <small>PICKUP</small>

                        <strong>
                            ${escapeHTML(activeOrder.restaurant_name || "Restaurant")}
                        </strong>

                        <p>Collect the order from the restaurant.</p>
                    </div>
                </div>

                <div class="rider-route-line"></div>

                <div class="rider-route-item">
                    <span class="rider-route-dot customer"></span>

                    <div>
                        <small>DELIVERY</small>

                        <strong>
                            ${escapeHTML(activeOrder.recipient_name || "Customer")}
                        </strong>

                        <p>
                            ${escapeHTML(
                                activeOrder.delivery_address ||
                                "Delivery address unavailable"
                            )}
                            ${
                                activeOrder.delivery_city
                                    ? `, ${escapeHTML(activeOrder.delivery_city)}`
                                    : ""
                            }
                        </p>

                        ${
                            activeOrder.recipient_phone
                                ? `<p>Phone: ${escapeHTML(activeOrder.recipient_phone)}</p>`
                                : ""
                        }

                        ${
                            activeOrder.delivery_instructions
                                ? `<p>Instructions: ${escapeHTML(activeOrder.delivery_instructions)}</p>`
                                : ""
                        }
                    </div>
                </div>
            </div>

            <div class="rider-delivery-actions">
                ${
                    outForDelivery
                        ? `
                            <button
                                type="button"
                                class="rider-primary-button"
                                data-mark-delivered="${escapeHTML(activeOrder.id)}"
                            >
                                Mark Delivered
                            </button>
                        `
                        : `
                            <button
                                type="button"
                                class="rider-primary-button"
                                data-start-delivery="${escapeHTML(activeOrder.id)}"
                            >
                                Start Delivery
                            </button>
                        `
                }
            </div>
        `;

        const startButton = content.querySelector("[data-start-delivery]");

        if (startButton) {
            startButton.addEventListener("click", () => {
                updateOrderStatus(
                    startButton.dataset.startDelivery,
                    "out-for-delivery",
                    startButton
                );
            });
        }

        const deliveredButton = content.querySelector("[data-mark-delivered]");

        if (deliveredButton) {
            deliveredButton.addEventListener("click", () => {
                updateOrderStatus(
                    deliveredButton.dataset.markDelivered,
                    "delivered",
                    deliveredButton
                );
            });
        }
    }

    async function updateOrderStatus(id, action, button) {
        if (button) {
            button.disabled = true;
            button.textContent = "Updating...";
        }

        const endpoint = action === "delivered"
            ? "delivered"
            : "out-for-delivery";

        try {
            await apiRequest(
                `/riders/my-orders/${encodeURIComponent(id)}/${endpoint}`,
                { method: "PATCH" }
            );

            showMessage(
                action === "delivered"
                    ? "Delivery completed successfully."
                    : "Order marked as out for delivery.",
                "success"
            );

            // Reload the profile because delivery completion can change
            // the rider's saved availability.
            await loadProfile();
            await loadDashboardData();
        } catch (error) {
            showMessage(error.message, "error");

            if (button) {
                button.disabled = false;
                button.textContent = action === "delivered"
                    ? "Mark Delivered"
                    : "Start Delivery";
            }
        }
    }

    // =========================================================
    // RECENT DELIVERIES - REAL ASSIGNED ORDERS
    // =========================================================

    function renderRecentDeliveries() {
        const tbody = elements.recentTable;

        if (!tbody) return;

        const recentOrders = [...myOrders]
            .filter(order =>
                ["delivered", "cancelled"].includes(getStatus(order))
            )
            .sort((a, b) => {
                const dateA = validDate(getCompletedDate(a))?.getTime() || 0;
                const dateB = validDate(getCompletedDate(b))?.getTime() || 0;

                return dateB - dateA;
            })
            .slice(0, 5);

        if (recentOrders.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="4">
                        No completed or cancelled deliveries to display.
                    </td>
                </tr>
            `;

            return;
        }

        tbody.innerHTML = recentOrders.map(order => {
            const status = getStatus(order);
            const statusClass = status === "delivered"
                ? "completed"
                : "cancelled";

            return `
                <tr>
                    <td>${escapeHTML(orderNumber(order))}</td>

                    <td>
                        ${escapeHTML(order.restaurant_name || "Restaurant")}
                    </td>

                    <td>${money(order.total_amount)}</td>

                    <td>
                        <span class="rider-status ${statusClass}">
                            ${escapeHTML(formatStatus(status))}
                        </span>
                    </td>
                </tr>
            `;
        }).join("");
    }

    // =========================================================
    // TODAY'S SUMMARY AND TOP STATISTICS
    // =========================================================

    function renderTodaySummary() {
        // Count orders assigned to this rider today.
        const todayOrders = myOrders.filter(order =>
            isToday(order.placed_at)
        );

        const completedToday = myOrders.filter(order =>
            getStatus(order) === "delivered" &&
            isToday(order.delivered_at)
        );

        const cancelledToday = myOrders.filter(order => {
            if (getStatus(order) !== "cancelled") {
                return false;
            }

            // updated_at is a fallback only. A dedicated cancelled_at
            // timestamp is more accurate when available from the API.
            return isToday(order.cancelled_at || order.updated_at);
        });

        const activeOrders = myOrders.filter(order =>
            ["ready", "out_for_delivery"].includes(getStatus(order))
        );

        const completionRate = todayOrders.length > 0
            ? Math.round(
                (completedToday.length / todayOrders.length) * 100
            )
            : 0;

        // These match the five summary rows in dashboard.html.
        const summaryItems = elements.summaryList
            ? elements.summaryList.querySelectorAll(".rider-summary-item")
            : [];

        const todayEarnings = Number(earnings?.summary?.today);
        const summaryValues = [
            String(todayOrders.length),
            String(completedToday.length),
            String(cancelledToday.length),
            "Not tracked",
            Number.isFinite(todayEarnings) ? money(todayEarnings) : "Unavailable"
        ];

        summaryItems.forEach((item, index) => {
            const strong = item.querySelector("strong");

            if (strong && summaryValues[index] !== undefined) {
                strong.textContent = summaryValues[index];
            }
        });

        // First statistic: today's assigned orders.
        setStatValue(
            0,
            String(todayOrders.length),
            "Orders assigned today"
        );

        // Second statistic: completed orders today.
        setStatValue(
            1,
            String(completedToday.length),
            `${completionRate}% of today's assigned orders`
        );

        // Earnings come from the backend's delivered-order payout calculation.
        setStatValue(
            2,
            Number.isFinite(todayEarnings) ? money(todayEarnings) : "Unavailable",
            Number.isFinite(todayEarnings) ? "From completed deliveries" : "Earnings data could not be loaded"
        );

        // Fourth statistic: active deliveries.
        setStatValue(
            3,
            String(activeOrders.length),
            activeOrders.length > 0
                ? "Currently in progress"
                : "No active deliveries"
        );
    }

    // =========================================================
    // DASHBOARD DATA LOADING
    // =========================================================

    async function loadDashboardData() {
        if (isRefreshing) return;
        isRefreshing = true;

        try {
            const [availableResult, myOrdersResult, earningsResult] = await Promise.allSettled([
                apiRequest("/riders/available-orders"),
                apiRequest("/riders/my-orders"),
                apiRequest("/riders/my-earnings?period=This%20Week")
            ]);

            if (availableResult.status === "fulfilled") {
                availableOrders = getResponseData(availableResult.value, "orders");
                renderAvailableOrders();
            } else {
                if (elements.availableList) elements.availableList.innerHTML = '<p class="rider-empty-state">Available orders could not be loaded. Please refresh to try again.</p>';
                if (elements.availableBadge) elements.availableBadge.hidden = true;
                showMessage(availableResult.reason?.message || "Could not load available orders.", "error");
            }

            if (myOrdersResult.status === "fulfilled") {
                myOrders = getResponseData(myOrdersResult.value, "orders");
                renderMyDelivery();
                renderRecentDeliveries();
            } else {
                if (elements.deliveryContent) elements.deliveryContent.innerHTML = '<p class="rider-empty-state">Your delivery information could not be loaded.</p>';
                if (elements.recentTable) elements.recentTable.innerHTML = '<tr><td colspan="4">Recent deliveries could not be loaded.</td></tr>';
                showMessage(myOrdersResult.reason?.message || "Could not load your deliveries.", "error");
            }

            earnings = earningsResult.status === "fulfilled"
                ? (earningsResult.value?.data?.earnings || earningsResult.value?.earnings || null)
                : null;

            if (availableResult.status === "fulfilled" || myOrdersResult.status === "fulfilled") {
                renderTodaySummary();
            }
        } finally {
            isRefreshing = false;
        }
    }

    // =========================================================
    // SIDEBAR
    // =========================================================

    function initializeSidebar() {
        const sidebar = elements.sidebar;
        const menuButton = elements.menuButton;

        if (menuButton && sidebar) {
            menuButton.addEventListener("click", event => {
                event.stopPropagation();
                sidebar.classList.toggle("active");
            });

            document.addEventListener("click", event => {
                if (
                    sidebar.classList.contains("active") &&
                    !sidebar.contains(event.target) &&
                    !menuButton.contains(event.target)
                ) {
                    sidebar.classList.remove("active");
                }
            });
        }

        document.addEventListener("keydown", event => {
            if (event.key === "Escape" && sidebar) {
                sidebar.classList.remove("active");
            }
        });

        document.querySelectorAll(
            ".rider-navigation .rider-nav-link"
        ).forEach(link => {
            link.addEventListener("click", () => {
                sidebar?.classList.remove("active");
            });
        });
    }

    // =========================================================
    // INITIALIZATION
    // =========================================================

    function clearSampleContent() {
        if (elements.statusButton) elements.statusButton.disabled = true;
        if (elements.availableList) elements.availableList.innerHTML = '<p class="rider-empty-state">Loading available orders…</p>';
        if (elements.deliveryContent) elements.deliveryContent.innerHTML = '<p class="rider-empty-state">Loading your active delivery…</p>';
        if (elements.recentTable) elements.recentTable.innerHTML = '<tr><td colspan="4">Loading recent deliveries…</td></tr>';
        if (elements.availableBadge) {
            elements.availableBadge.textContent = "…";
            elements.availableBadge.hidden = false;
        }
        elements.statCards.forEach(card => {
            const strong = card.querySelector(".rider-stat-content strong");
            const small = card.querySelector(".rider-stat-content small");
            if (strong) strong.textContent = "—";
            if (small) small.textContent = "Loading…";
        });
        if (elements.summaryList) elements.summaryList.querySelectorAll("strong").forEach(el => el.textContent = "—");
        if (elements.notificationBadge) elements.notificationBadge.hidden = true;
        if (elements.notificationButton) {
            elements.notificationButton.title = "Notifications are not available yet";
            elements.notificationButton.addEventListener("click", () => showMessage("Rider notifications are not connected yet.", "info"));
        }
    }

    async function initialize() {
        clearSampleContent();
        if (!getToken()) {
            showMessage("Please sign in to access your rider dashboard.", "error");
            if (elements.availableList) elements.availableList.innerHTML = '<p class="rider-empty-state">Sign in to view available orders.</p>';
            if (elements.deliveryContent) elements.deliveryContent.innerHTML = '<p class="rider-empty-state">Sign in to view your deliveries.</p>';
            return;
        }

        try {
            await loadProfile();
            await loadDashboardData();
            if (elements.statusButton && rider?.availability !== "on_delivery") elements.statusButton.disabled = false;
            if (refreshTimer) clearInterval(refreshTimer);
            refreshTimer = setInterval(() => {
                if (!document.hidden) loadDashboardData().catch(error => console.error("Automatic rider dashboard refresh failed:", error));
            }, 30000);
        } catch (error) {
            console.error("Rider dashboard loading failed:", error);
            if (elements.availableList) elements.availableList.innerHTML = '<p class="rider-empty-state">Dashboard data could not be loaded. Check your connection and refresh.</p>';
            if (elements.deliveryContent) elements.deliveryContent.innerHTML = '<p class="rider-empty-state">Dashboard data could not be loaded.</p>';
            if (elements.recentTable) elements.recentTable.innerHTML = '<tr><td colspan="4">Dashboard data could not be loaded.</td></tr>';
            showMessage(error.message, "error");
        }
    }

    if (elements.statusButton) {
        elements.statusButton.addEventListener("click", toggleAvailability);
    }

    initializeSidebar();
    initialize();
});
