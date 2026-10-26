document.addEventListener("DOMContentLoaded", () => {
    "use strict";

    /* =========================================================
       RESTAURANT ORDERS - BACKEND INTEGRATION
       ========================================================= */

    const api = window.FoodDeliveryAuthApi;

    const sidebar = document.getElementById("restaurantSidebar");
    const menuButton = document.getElementById("restaurantMenuButton");
    const restaurantStatusButton = document.getElementById("restaurantStatusButton");
    const restaurantStatusText = document.getElementById("restaurantStatusText");
    const sidebarName = document.getElementById("restaurantSidebarName");
    const topbarName = document.getElementById("restaurantTopbarName");
    const sidebarAvatar = document.getElementById("restaurantSidebarAvatar");
    const topbarAvatar = document.getElementById("restaurantTopbarAvatar");

    const orderSearch = document.getElementById("orderSearch");
    const orderStatusFilter = document.getElementById("orderStatusFilter");
    const orderDateFilter = document.getElementById("orderDateFilter");
    const clearOrderFilters = document.getElementById("clearOrderFilters");

    const orderTabs = document.querySelectorAll(".restaurant-order-tab");
    const ordersList = document.getElementById("restaurantOrdersList");
    const noOrdersMessage = document.getElementById("noOrdersMessage");
    const statisticsCards = document.querySelectorAll(".restaurant-stat-card");
    const dashboardDate = document.querySelector(".dashboard-date strong");
    const pendingNavBadge = document.querySelector(
        '.restaurant-nav-link[href="orders.html"] .nav-badge'
    );
    const orderMessage = document.getElementById("restaurantOrderMessage");

    const paginationInfo = document.querySelector(".orders-pagination-info");
    const paginationContainer = document.querySelector(".orders-pagination-buttons");

    const notificationButton = document.querySelector(".restaurant-notification-button");
    const profileButton = document.querySelector(".restaurant-topbar-profile");

    const PAGE_SIZE = 10;

    let allOrders = [];
    let filteredOrders = [];
    let currentPage = 1;
    let restaurantIsOpen = null;
    let messageTimeout = null;

    /* =========================================================
       API
       ========================================================= */

    async function apiRequest(path, options = {}) {
        if (!api || typeof api.request !== "function") {
            throw new Error(
                "API helper is missing. Load auth-api.js before orders.js."
            );
        }

        if (!api.getToken || !api.getToken()) {
            throw new Error("Your session has expired. Please log in again.");
        }

        const user = api.getCurrentUser ? api.getCurrentUser() : null;

        if (user && user.role && user.role !== "restaurant") {
            throw new Error("This page is only available to restaurant accounts.");
        }

        return api.request(path, {
            ...options,
            authenticated: true
        });
    }

    /* =========================================================
       MESSAGE
       ========================================================= */

    function showMessage(message, type = "info") {
        if (!orderMessage) {
            console.log(message);
            return;
        }

        orderMessage.textContent = message;
        orderMessage.hidden = false;
        orderMessage.dataset.type = type;

        if (messageTimeout) {
            clearTimeout(messageTimeout);
        }

        messageTimeout = setTimeout(() => {
            orderMessage.hidden = true;
        }, 4500);
    }

    function escapeHtml(value) {
        return String(value ?? "").replace(/[&<>"']/g, character => ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#039;"
        })[character]);
    }

    function formatCurrency(value) {
        return "KSh " + (Number(value) || 0).toLocaleString("en-KE", {
            maximumFractionDigits: 2
        });
    }

    function getCustomerName(order) {
        const fullName = [
            order.customer_first_name,
            order.customer_last_name
        ].filter(Boolean).join(" ").trim();

        return fullName ||
            order.recipient_name ||
            "Customer";
    }

    function getInitials(name) {
        return String(name)
            .trim()
            .split(/\s+/)
            .filter(Boolean)
            .slice(0, 2)
            .map(part => part[0].toUpperCase())
            .join("") || "C";
    }

    function getOrderNumber(order) {
        return order.order_number || `#${order.id}`;
    }

    function getOrderDate(order) {
        return order.placed_at || order.created_at || null;
    }

    function getStatusLabel(status) {
        const labels = {
            pending: "Pending",
            confirmed: "Confirmed",
            preparing: "Preparing",
            ready: "Ready",
            out_for_delivery: "Out for Delivery",
            delivered: "Delivered",
            cancelled: "Cancelled"
        };

        return labels[String(status || "").toLowerCase()] || status || "Unknown";
    }

    function getStatusClass(status) {
        const value = String(status || "").toLowerCase();

        return [
            "pending",
            "confirmed",
            "preparing",
            "ready",
            "out_for_delivery",
            "delivered",
            "cancelled"
        ].includes(value) ? value : "pending";
    }

    function formatTime(value) {
        if (!value) return "—";

        const date = new Date(value);

        if (Number.isNaN(date.getTime())) return "—";

        return date.toLocaleString("en-KE", {
            day: "numeric",
            month: "short",
            hour: "numeric",
            minute: "2-digit"
        });
    }

    /* =========================================================
       RESTAURANT STATUS
       Load persisted status instead of assuming the restaurant
       is open. The status endpoint was fixed in the previous step.
       ========================================================= */

    async function loadRestaurantStatus() {
        try {
            const result = await apiRequest("/restaurants/owner/me");
            const restaurant = result.data?.restaurant || result.restaurant || result.data || result;

            if (!restaurant || typeof restaurant !== "object") {
                throw new Error("The server did not return your restaurant profile.");
            }

            const name = String(restaurant.name || restaurant.restaurant_name || "").trim();
            if (name) {
                if (sidebarName) sidebarName.textContent = name;
                if (topbarName) topbarName.textContent = name;
                const initials = name.split(/\\s+/).filter(Boolean).slice(0, 2)
                    .map(part => part.charAt(0).toUpperCase()).join("") || "R";
                if (sidebarAvatar) sidebarAvatar.textContent = initials;
                if (topbarAvatar) topbarAvatar.textContent = initials;
            }

            if (typeof restaurant.is_open === "boolean") {
                restaurantIsOpen = restaurant.is_open;
                renderRestaurantStatus();
            }
        } catch (error) {
            console.error("Could not load restaurant status:", error);
        }
    }

    function renderRestaurantStatus() {
        if (restaurantStatusText && restaurantIsOpen !== null) {
            restaurantStatusText.textContent =
                restaurantIsOpen ? "Open" : "Closed";
        }

        if (restaurantStatusButton && restaurantIsOpen !== null) {
            restaurantStatusButton.classList.toggle("closed", !restaurantIsOpen);
            restaurantStatusButton.setAttribute(
                "aria-pressed",
                String(restaurantIsOpen)
            );
        }
    }

    async function toggleRestaurantStatus() {
        if (restaurantIsOpen === null) {
            showMessage("Restaurant status has not loaded yet.", "error");
            return;
        }

        const button = restaurantStatusButton;
        if (button) button.disabled = true;

        try {
            const desiredStatus = !restaurantIsOpen;

            const result = await apiRequest("/restaurants/owner/status", {
                method: "PATCH",
                body: { is_open: desiredStatus }
            });

            const restaurant = result.restaurant || result;

            restaurantIsOpen = typeof restaurant.is_open === "boolean"
                ? restaurant.is_open
                : desiredStatus;

            renderRestaurantStatus();

            showMessage(
                restaurantIsOpen
                    ? "Restaurant is now open."
                    : "Restaurant is now closed.",
                "success"
            );
        } catch (error) {
            showMessage(error.message || "Could not update restaurant status.", "error");
        } finally {
            if (button) button.disabled = false;
        }
    }

    if (restaurantStatusButton) {
        restaurantStatusButton.addEventListener("click", toggleRestaurantStatus);
    }

    /* =========================================================
       FETCH ORDERS
       ========================================================= */

    async function loadOrders() {
        if (ordersList) {
            ordersList.setAttribute("aria-busy", "true");
            ordersList.innerHTML = `
                <tr>
                    <td colspan="8" style="text-align:center;padding:24px;">
                        Loading restaurant orders...
                    </td>
                </tr>
            `;
        }

        try {
            const result = await apiRequest("/orders/restaurant");

            allOrders = Array.isArray(result.orders)
                ? result.orders
                : Array.isArray(result)
                    ? result
                    : [];

            // Keep newest orders first.
            allOrders.sort((a, b) => {
                const dateA = new Date(getOrderDate(a) || 0).getTime();
                const dateB = new Date(getOrderDate(b) || 0).getTime();
                return dateB - dateA;
            });

            currentPage = 1;
            renderOrderStatistics();
            applyFilters();
        } catch (error) {
            console.error("Could not load restaurant orders:", error);

            if (ordersList) {
                ordersList.innerHTML = `
                    <tr>
                        <td colspan="8" style="text-align:center;padding:24px;">
                            Could not load orders. Please refresh or log in again.
                        </td>
                    </tr>
                `;
            }

            showMessage(error.message || "Failed to load restaurant orders.", "error");
        } finally {
            if (ordersList) {
                ordersList.setAttribute("aria-busy", "false");
            }
        }
    }

    /* =========================================================
       FILTERS
       ========================================================= */

    function isInSelectedDateRange(order) {
        const filter = orderDateFilter ? orderDateFilter.value : "all";

        if (filter === "all") return true;

        const value = getOrderDate(order);
        if (!value) return false;

        const orderDate = new Date(value);
        if (Number.isNaN(orderDate.getTime())) return false;

        const now = new Date();
        const startToday = new Date(
            now.getFullYear(),
            now.getMonth(),
            now.getDate()
        );

        const startOrderDate = new Date(
            orderDate.getFullYear(),
            orderDate.getMonth(),
            orderDate.getDate()
        );

        if (filter === "today") {
            return startOrderDate.getTime() === startToday.getTime();
        }

        if (filter === "yesterday") {
            const yesterday = new Date(startToday);
            yesterday.setDate(yesterday.getDate() - 1);

            return startOrderDate.getTime() === yesterday.getTime();
        }

        if (filter === "week") {
            const startWeek = new Date(startToday);
            const day = (startWeek.getDay() + 6) % 7;
            startWeek.setDate(startWeek.getDate() - day);

            return orderDate >= startWeek && orderDate <= now;
        }

        if (filter === "month") {
            const startMonth = new Date(
                now.getFullYear(),
                now.getMonth(),
                1
            );

            return orderDate >= startMonth && orderDate <= now;
        }

        return true;
    }

    function applyFilters() {
        const search = orderSearch
            ? orderSearch.value.trim().toLowerCase()
            : "";

        const selectedStatus = orderStatusFilter
            ? orderStatusFilter.value
            : "all";

        filteredOrders = allOrders.filter(order => {
            const orderNumber = getOrderNumber(order).toLowerCase();
            const customer = getCustomerName(order).toLowerCase();
            const status = String(order.status || "").toLowerCase();
            const phone = String(
                order.customer_phone || order.recipient_phone || ""
            ).toLowerCase();

            const matchesSearch =
                !search ||
                orderNumber.includes(search) ||
                customer.includes(search) ||
                phone.includes(search);

            const matchesStatus =
                selectedStatus === "all" ||
                status === selectedStatus.replaceAll("-", "_");

            return matchesSearch &&
                matchesStatus &&
                isInSelectedDateRange(order);
        });

        currentPage = 1;
        renderOrders();
        renderTabCounts();
    }

    /* =========================================================
       STATUS TABS
       ========================================================= */

    function renderTabCounts() {
    orderTabs.forEach(tab => {
        const status = tab.dataset.status || "all";
        const countElement = tab.querySelector("span");

        if (!countElement) return;

        const count = status === "all"
            ? allOrders.length
            : allOrders.filter(order =>
                String(order.status || "").toLowerCase() ===
                status.replaceAll("-", "_")
            ).length;

        countElement.textContent = String(count);
    });
}

    function setActiveTab(status) {
        orderTabs.forEach(tab => {
            const active = tab.dataset.status === status;

            tab.classList.toggle("active", active);
            tab.setAttribute("aria-pressed", String(active));
        });
    }

    orderTabs.forEach(tab => {
        tab.addEventListener("click", () => {
            const status = tab.dataset.status || "all";

            if (orderStatusFilter) {
                orderStatusFilter.value = status;
            }

            setActiveTab(status);
            applyFilters();
        });
    });

    if (orderStatusFilter) {
        orderStatusFilter.addEventListener("change", () => {
            const value = orderStatusFilter.value || "all";
            setActiveTab(value.replaceAll("_", "-"));
            applyFilters();
        });
    }

    if (orderSearch) {
        orderSearch.addEventListener("input", applyFilters);
    }

    if (orderDateFilter) {
        orderDateFilter.addEventListener("change", applyFilters);
    }

    if (clearOrderFilters) {
        clearOrderFilters.addEventListener("click", () => {
            if (orderSearch) orderSearch.value = "";
            if (orderStatusFilter) orderStatusFilter.value = "all";
            if (orderDateFilter) orderDateFilter.value = "all";

            setActiveTab("all");
            applyFilters();

            showMessage("Filters cleared.", "success");
        });
    }

    /* =========================================================
       RENDER ORDERS TABLE
       ========================================================= */

    function renderOrderStatistics() {
    const today = new Date();

    const todaysOrders = allOrders.filter(order => {
        const value = getOrderDate(order);
        if (!value) return false;

        const date = new Date(value);

        return !Number.isNaN(date.getTime()) &&
            date.getFullYear() === today.getFullYear() &&
            date.getMonth() === today.getMonth() &&
            date.getDate() === today.getDate();
    });

    const pendingCount = allOrders.filter(
        order => String(order.status).toLowerCase() === "pending"
    ).length;

    const preparingCount = allOrders.filter(
        order => String(order.status).toLowerCase() === "preparing"
    ).length;

    const completedCount = allOrders.filter(
        order => String(order.status).toLowerCase() === "delivered"
    ).length;

    const cards = [
        {
            value: todaysOrders.length,
            description: "Orders placed today",
            badge: "Today"
        },
        {
            value: pendingCount,
            description: "Waiting for action",
            badge: pendingCount > 0 ? "Attention" : "Clear"
        },
        {
            value: preparingCount,
            description: "Currently in kitchen",
            badge: "Active"
        },
        {
            value: completedCount,
            description: "Successfully delivered",
            badge: "Delivered"
        }
    ];

    cards.forEach((data, index) => {
        const card = statisticsCards[index];
        if (!card) return;

        const value = card.querySelector(".stat-card-content strong");
        const description = card.querySelector(".stat-card-content small");
        const badge = card.querySelector(".stat-change");

        if (value) value.textContent = String(data.value);
        if (description) description.textContent = data.description;
        if (badge) badge.textContent = data.badge;
    });

    if (dashboardDate) {
        dashboardDate.textContent = today.toLocaleDateString("en-KE", {
            day: "numeric",
            month: "long",
            year: "numeric"
        });
    }

    if (pendingNavBadge) {
        pendingNavBadge.textContent = String(pendingCount);
        pendingNavBadge.style.display = pendingCount > 0 ? "" : "none";
    }
}   

    function renderOrders() {
        if (!ordersList) return;

        const total = filteredOrders.length;
        const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

        if (currentPage > totalPages) currentPage = totalPages;

        const startIndex = (currentPage - 1) * PAGE_SIZE;
        const pageOrders = filteredOrders.slice(
            startIndex,
            startIndex + PAGE_SIZE
        );

        if (!pageOrders.length) {
            ordersList.innerHTML = `
                <tr>
                    <td colspan="8" style="text-align:center;padding:24px;">
                        No orders match your filters.
                    </td>
                </tr>
            `;
        } else {
            ordersList.innerHTML = pageOrders.map(order => {
                const orderId = escapeHtml(order.id);
                const orderNumber = escapeHtml(getOrderNumber(order));
                const customer = getCustomerName(order);
                const status = getStatusClass(order.status);
                const amount = formatCurrency(order.total_amount);
                const time = formatTime(getOrderDate(order));

                // The list endpoint doesn't include order items or payment
                // information. The detail endpoint loads items when requested.
                return `
                    <tr class="restaurant-order-row"
                        data-order-id="${orderId}"
                        data-order-number="${orderNumber}"
                        data-status="${escapeHtml(status)}">

                        <td><strong>#${orderNumber.replace(/^#/, "")}</strong></td>

                        <td>
                            <div class="customer-table-info">
                                <span class="customer-small-avatar">
                                    ${escapeHtml(getInitials(customer))}
                                </span>
                                <span>${escapeHtml(customer)}</span>
                            </div>
                        </td>

                        <td>Open View for items</td>

                        <td><strong>${escapeHtml(amount)}</strong></td>

                        <td>—</td>

                        <td>
                            <span class="order-status ${escapeHtml(status)}">
                                ${escapeHtml(getStatusLabel(status))}
                            </span>
                        </td>

                        <td>${escapeHtml(time)}</td>

                        <td>
                            <div class="restaurant-order-actions">
                                <button type="button"
                                    class="order-action-button"
                                    data-action="view"
                                    data-order-id="${orderId}">
                                    View
                                </button>
                                ${renderStatusAction(order)}
                            </div>
                        </td>
                    </tr>
                `;
            }).join("");
        }

        if (noOrdersMessage) {
            noOrdersMessage.hidden = total > 0;
        }

        if (paginationInfo) {
            if (total === 0) {
                paginationInfo.textContent = "Showing 0 orders";
            } else {
                const first = startIndex + 1;
                const last = Math.min(startIndex + PAGE_SIZE, total);
                paginationInfo.textContent =
                    `Showing ${first}–${last} of ${total} orders`;
            }
        }

        renderPagination(totalPages);
    }

    function renderStatusAction(order) {
        const id = escapeHtml(order.id);
        const status = String(order.status || "").toLowerCase();

        if (status === "pending") {
            return `
                <button type="button" class="order-action-button"
                    data-action="confirm" data-order-id="${id}">
                    Confirm
                </button>
            `;
        }

        if (status === "confirmed") {
            return `
                <button type="button" class="order-action-button"
                    data-action="preparing" data-order-id="${id}">
                    Start Preparing
                </button>
            `;
        }

        if (status === "preparing") {
            return `
                <button type="button" class="order-action-button"
                    data-action="ready" data-order-id="${id}">
                    Mark Ready
                </button>
            `;
        }

        return "";
    }

    /* =========================================================
       PAGINATION
       ========================================================= */

    function renderPagination(totalPages) {
        if (!paginationContainer) return;

        paginationContainer.innerHTML = "";

        function addButton(label, page, disabled = false, active = false) {
            const button = document.createElement("button");

            button.type = "button";
            button.textContent = label;
            button.disabled = disabled;

            if (active) button.classList.add("active");

            button.addEventListener("click", () => {
                currentPage = page;
                renderOrders();
            });

            paginationContainer.appendChild(button);
        }

        addButton("‹", Math.max(1, currentPage - 1), currentPage === 1);

        const maxVisiblePages = 5;
        let firstPage = Math.max(1, currentPage - 2);
        let lastPage = Math.min(totalPages, firstPage + maxVisiblePages - 1);

        firstPage = Math.max(1, lastPage - maxVisiblePages + 1);

        for (let page = firstPage; page <= lastPage; page++) {
            addButton(
                String(page),
                page,
                false,
                page === currentPage
            );
        }

        addButton(
            "›",
            Math.min(totalPages, currentPage + 1),
            currentPage === totalPages
        );
    }

    /* =========================================================
       VIEW ORDER DETAILS
       ========================================================= */

    /* =========================================================
   ORDER DETAILS MODAL
========================================================= */

const orderDetailsModal = document.getElementById("orderDetailsModal");
const orderModalTitle = document.getElementById("orderModalTitle");
const orderModalSubtitle = document.getElementById("orderModalSubtitle");
const orderModalBody = document.getElementById("orderModalBody");
const orderModalStatus = document.getElementById("orderModalStatus");
const orderModalActions = document.getElementById("orderModalActions");
const closeOrderModalButton = document.getElementById("closeOrderModal");
const closeOrderModalFooter = document.getElementById("closeOrderModalFooter");

let modalOrderId = null;
let lastFocusedElement = null;
let modalRequestNumber = 0;

function closeOrderDetailsModal() {
    if (!orderDetailsModal) return;

    orderDetailsModal.hidden = true;
    modalOrderId = null;
    document.body.style.overflow = "";

    if (lastFocusedElement && document.contains(lastFocusedElement)) {
        lastFocusedElement.focus();
    }
}

function openOrderDetailsModal() {
    if (!orderDetailsModal) return;

    lastFocusedElement = document.activeElement;
    orderDetailsModal.hidden = false;
    document.body.style.overflow = "hidden";

    if (closeOrderModalButton) {
        closeOrderModalButton.focus();
    }
}

function modalField(label, value) {
    return `
        <div class="restaurant-modal-field">
            <small>${escapeHtml(label)}</small>
            <strong>${escapeHtml(value || "Not provided")}</strong>
        </div>
    `;
}

function getItemName(item) {
    return item.food_name ||
        item.name ||
        item.food?.name ||
        item.title ||
        "Food item";
}

function getItemQuantity(item) {
    return Number(item.quantity) || 0;
}

function getItemUnitPrice(item) {
    return Number(
        item.unit_price ??
        item.price ??
        item.food_price ??
        item.food?.price
    ) || 0;
}

function getItemTotal(item) {
    const total = item.subtotal ??
        item.total_price ??
        item.line_total;

    if (total !== undefined && total !== null) {
        return Number(total) || 0;
    }

    return getItemQuantity(item) * getItemUnitPrice(item);
}

function renderModalItems(items) {
    if (!items.length) {
        return "<p>No item details were returned for this order.</p>";
    }

    const rows = items.map(item => `
        <tr>
            <td>${escapeHtml(getItemName(item))}</td>
            <td>${escapeHtml(getItemQuantity(item))}</td>
            <td>${escapeHtml(formatCurrency(getItemUnitPrice(item)))}</td>
            <td>${escapeHtml(formatCurrency(getItemTotal(item)))}</td>
        </tr>
    `).join("");

    return `
        <div style="overflow-x:auto;">
            <table class="restaurant-modal-items">
                <thead>
                    <tr>
                        <th>Item</th>
                        <th>Qty</th>
                        <th>Price</th>
                        <th>Total</th>
                    </tr>
                </thead>
                <tbody>${rows}</tbody>
            </table>
        </div>
    `;
}

function renderModalTotals(order) {
    return `
        <div class="restaurant-modal-totals">
            <div class="restaurant-modal-total-row">
                <span>Subtotal</span>
                <strong>${escapeHtml(formatCurrency(order.subtotal))}</strong>
            </div>
            <div class="restaurant-modal-total-row">
                <span>Delivery fee</span>
                <strong>${escapeHtml(formatCurrency(order.delivery_fee))}</strong>
            </div>
            <div class="restaurant-modal-total-row">
                <span>Discount</span>
                <strong>${escapeHtml(formatCurrency(order.discount))}</strong>
            </div>
            <div class="restaurant-modal-total-row grand-total">
                <span>Total</span>
                <strong>${escapeHtml(formatCurrency(order.total_amount))}</strong>
            </div>
        </div>
    `;
}

function renderOrderModalActions(order) {
    const status = String(order.status || "")
        .trim()
        .toLowerCase()
        .replaceAll("-", "_")
        .replaceAll(" ", "_");

    const nextActions = {
        pending: {
            status: "confirmed",
            label: "Confirm Order"
        },
        confirmed: {
            status: "preparing",
            label: "Start Preparing"
        },
        preparing: {
            status: "ready",
            label: "Mark Ready"
        },
        ready: {
            status: "out_for_delivery",
            label: "Send Out for Delivery"
        }
    };

    const nextAction = nextActions[status];

    const actionButton = nextAction
        ? `
            <button
                type="button"
                class="restaurant-modal-button"
                data-modal-action="${nextAction.status}"
                data-order-id="${escapeHtml(order.id)}">
                ${nextAction.label}
            </button>
        `
        : "";

    orderModalActions.innerHTML = `
        <button
            type="button"
            class="restaurant-modal-button secondary"
            id="closeOrderModalFooter">
            Close
        </button>
        ${actionButton}
    `;

    document
        .getElementById("closeOrderModalFooter")
        ?.addEventListener("click", closeOrderDetailsModal);
}

async function showOrderDetails(orderId) {
    if (!orderDetailsModal || !orderModalBody) {
        showMessage("Order details modal is missing from orders.html.", "error");
        return;
    }

    modalOrderId = String(orderId);
    const requestNumber = ++modalRequestNumber;

    openOrderDetailsModal();

    orderModalTitle.textContent = "Order details";
    orderModalSubtitle.textContent = "Loading order information...";
    orderModalBody.innerHTML = `
        <p class="restaurant-modal-loading">Loading order details...</p>
    `;

    orderModalStatus.textContent = "Loading";
    orderModalStatus.className = "order-status pending";

    orderModalActions.innerHTML = `
        <button type="button"
            class="restaurant-modal-button secondary"
            id="closeOrderModalFooter">
            Close
        </button>
    `;

    const initialClose = document.getElementById("closeOrderModalFooter");

    if (initialClose) {
        initialClose.addEventListener("click", closeOrderDetailsModal);
    }

    try {
        const result = await apiRequest(
            `/orders/restaurant/${encodeURIComponent(orderId)}`
        );

        if (
            requestNumber !== modalRequestNumber ||
            modalOrderId !== String(orderId)
        ) {
            return;
        }

        const order = result.order || result;
        const items = Array.isArray(order.items) ? order.items : [];
        const orderNumber = getOrderNumber(order);
        const status = getStatusClass(order.status);

        orderModalTitle.textContent = `Order ${orderNumber}`;
        orderModalSubtitle.textContent =
            `Placed ${formatTime(getOrderDate(order))}`;

        orderModalStatus.textContent = getStatusLabel(order.status);
        orderModalStatus.className = `order-status ${status}`;

        const customerName = getCustomerName(order);
        const customerPhone =
            order.customer_phone ||
            order.customer_phone_number ||
            order.recipient_phone;

        const address = [
            order.delivery_address,
            order.delivery_city
        ].filter(Boolean).join(", ");

        orderModalBody.innerHTML = `
            <section class="restaurant-modal-section">
                <h3>Customer information</h3>
                <div class="restaurant-modal-grid">
                    ${modalField("Customer", customerName)}
                    ${modalField("Phone", customerPhone)}
                    ${modalField("Email", order.customer_email)}
                    ${modalField("Recipient", order.recipient_name)}
                </div>
            </section>

            <section class="restaurant-modal-section">
                <h3>Delivery information</h3>
                <div class="restaurant-modal-grid">
                    ${modalField("Delivery address", address)}
                    ${modalField("Delivery phone", customerPhone)}
                    ${modalField("Order number", orderNumber)}
                    ${modalField("Placed at", formatTime(getOrderDate(order)))}
                </div>
            </section>

            <section class="restaurant-modal-section">
                <h3>Order items (${items.reduce(
                    (total, item) => total + getItemQuantity(item), 0
                )} total units)</h3>
                ${renderModalItems(items)}
                ${renderModalTotals(order)}
            </section>

            <section class="restaurant-modal-section">
                <h3>Instructions and notes</h3>
                <div class="restaurant-modal-notes">${escapeHtml(
                    [
                        order.delivery_instructions
                            ? `Delivery instructions: ${order.delivery_instructions}`
                            : "",
                        order.notes ? `Order notes: ${order.notes}` : ""
                    ].filter(Boolean).join("\n") || "No additional instructions."
                )}</div>
            </section>
        `;

        renderOrderModalActions(order);
    } catch (error) {
        if (requestNumber !== modalRequestNumber) return;

        orderModalSubtitle.textContent = "Unable to load order details.";
        orderModalBody.innerHTML = `
            <p role="alert">
                ${escapeHtml(error.message || "Could not load this order.")}
            </p>
        `;

        orderModalActions.innerHTML = `
            <button type="button"
                class="restaurant-modal-button secondary"
                id="closeOrderModalFooter">
                Close
            </button>
            <button type="button"
                class="restaurant-modal-button"
                id="retryOrderModal">
                Try Again
            </button>
        `;

        document.getElementById("closeOrderModalFooter")
            ?.addEventListener("click", closeOrderDetailsModal);

        document.getElementById("retryOrderModal")
            ?.addEventListener("click", () => showOrderDetails(orderId));
    }
}

if (closeOrderModalButton) {
    closeOrderModalButton.addEventListener("click", closeOrderDetailsModal);
}

if (closeOrderModalFooter) {
    closeOrderModalFooter.addEventListener("click", closeOrderDetailsModal);
}

if (orderDetailsModal) {
    orderDetailsModal.addEventListener("click", event => {
        if (event.target === orderDetailsModal) {
            closeOrderDetailsModal();
        }
    });
}

document.addEventListener("keydown", event => {
    if (event.key === "Escape" && orderDetailsModal && !orderDetailsModal.hidden) {
        closeOrderDetailsModal();
    }
});

/* Order actions from inside the modal */
if (orderModalActions) {
    orderModalActions.addEventListener("click", async event => {
        const button = event.target.closest("[data-modal-action]");

        if (!button) return;

        const orderId = button.dataset.orderId;
        const action = button.dataset.modalAction;

        if (!orderId || !action) return;

        button.disabled = true;

        try {
            // Reuse the existing status-transition validation and API call.
            await updateOrderStatus(orderId, action, button);

            // Refresh details after the order action so the modal shows
            // the latest status and available next action.
            if (orderDetailsModal && !orderDetailsModal.hidden) {
                await showOrderDetails(orderId);
            }
        } finally {
            button.disabled = false;
        }
    });
}

    /* =========================================================
       UPDATE ORDER STATUS
       Uses the existing backend endpoints and transition rules.
       ========================================================= */

    async function updateOrderStatus(orderId, action, button) {
        const endpoints = {
            confirm: "confirm",
            preparing: "preparing",
            ready: "ready"
        };

        const endpoint = endpoints[action];

        if (!endpoint) return;

        const order = allOrders.find(item => String(item.id) === String(orderId));

        if (!order) {
            showMessage("Order not found. Refresh the list and try again.", "error");
            return;
        }

        const expectedStatus = {
            confirm: "pending",
            preparing: "confirmed",
            ready: "preparing"
        }[action];

        if (String(order.status).toLowerCase() !== expectedStatus) {
            showMessage(
                `This order is currently ${getStatusLabel(order.status)}. Refresh the list before changing it.`,
                "error"
            );
            await loadOrders();
            return;
        }

        const confirmations = {
            confirm: "Confirm this order?",
            preparing: "Start preparing this order?",
            ready: "Mark this order as ready?"
        };

        if (!window.confirm(confirmations[action])) return;

        if (button) button.disabled = true;

        try {
            const result = await apiRequest(
                `/orders/restaurant/${encodeURIComponent(orderId)}/${endpoint}`,
                { method: "PATCH" }
            );

            const updatedOrder = result.order || result;

            const index = allOrders.findIndex(
                item => String(item.id) === String(orderId)
            );

            if (index !== -1) {
                allOrders[index] = {
                    ...allOrders[index],
                    ...updatedOrder
                };
            }

            showMessage(
                result.message || `Order ${getOrderNumber(order)} updated successfully.`,
                "success"
            );

            // Reload from the database so the UI reflects the server's
            // authoritative status and timestamps.
            await loadOrders();
        } catch (error) {
            showMessage(
                error.message || "Could not update the order status.",
                "error"
            );

            await loadOrders();
        } finally {
            if (button) button.disabled = false;
        }
    }

    if (ordersList) {
        ordersList.addEventListener("click", event => {
            const button = event.target.closest("[data-action]");

            if (!button) return;

            const orderId = button.dataset.orderId;
            const action = button.dataset.action;

            if (!orderId) return;

            if (action === "view") {
                showOrderDetails(orderId);
                return;
            }

            if (["confirm", "preparing", "ready"].includes(action)) {
                updateOrderStatus(orderId, action, button);
            }
        });
    }

    /* =========================================================
       SIDEBAR
       ========================================================= */

    if (menuButton && sidebar) {
        menuButton.addEventListener("click", () => {
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

    if (sidebar) {
        sidebar.querySelectorAll(".restaurant-nav-link").forEach(link => {
            link.addEventListener("click", () => {
                if (window.innerWidth <= 900) {
                    sidebar.classList.remove("active");
                }
            });
        });
    }

    if (notificationButton) {
        notificationButton.addEventListener("click", () => {
            showMessage("Restaurant notifications are not connected yet.");
        });
    }

    if (profileButton) {
        profileButton.addEventListener("click", () => {
            window.location.href = "restaurant-profile.html";
        });
    }

    /* =========================================================
       KEYBOARD SHORTCUTS
       ========================================================= */

    document.addEventListener("keydown", event => {
        const activeTag = document.activeElement?.tagName;

        if (
            event.key === "/" &&
            activeTag !== "INPUT" &&
            activeTag !== "TEXTAREA" &&
            activeTag !== "SELECT"
        ) {
            event.preventDefault();
            if (orderSearch) orderSearch.focus();
        }

        if (
            event.key === "Escape" &&
            document.activeElement === orderSearch
        ) {
            orderSearch.value = "";
            applyFilters();
        }
    });

    /* =========================================================
       INITIALIZE
       ========================================================= */

    setActiveTab(
        orderStatusFilter
            ? orderStatusFilter.value
            : "all"
    );

    loadRestaurantStatus();
    loadOrders();
});