
/* =========================================================
   CUSTOMER ORDERS — BACKEND INTEGRATION
   ========================================================= */

document.addEventListener("DOMContentLoaded", () => {
    "use strict";

    const API_BASE = (window.FOOD_DELIVERY_API_BASE || document.querySelector('meta[name="api-base-url"]')?.content?.trim() || "http://localhost:5000/api").replace(/\/+$/, "");
    const TOKEN_KEY = "foodDeliveryAccessToken";

    const ordersList = document.getElementById("ordersList");
    const ordersCount = document.getElementById("ordersCount");
    const noOrders = document.getElementById("noOrders");
    const filterButtons = document.querySelectorAll(".order-filter");
    const refreshButton = document.getElementById("refreshOrdersButton");
    let refreshTimer = null;
    let isLoading = false;

    let orders = [];
    let selectedFilter = "all";

    function escapeHtml(value) {
        return String(value ?? "").replace(/[&<>"']/g, character => ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#39;"
        })[character]);
    }

    function money(value) {
        return `KSh ${(Number(value) || 0).toLocaleString("en-KE", {
            minimumFractionDigits: 0,
            maximumFractionDigits: 2
        })}`;
    }

    function getToken() {
        return localStorage.getItem(TOKEN_KEY) ||
            sessionStorage.getItem(TOKEN_KEY);
    }

    function getStatus(order) {
        return String(order.status || "pending").toLowerCase();
    }

    function getStatusLabel(status) {
        const labels = {
            pending: "Pending",
            confirmed: "Confirmed",
            preparing: "Preparing",
            ready: "Ready for pickup",
            out_for_delivery: "Out for delivery",
            delivered: "Delivered",
            cancelled: "Cancelled"
        };

        return labels[status] || status.replaceAll("_", " ");
    }

    function isActive(status) {
        return !["delivered", "cancelled"].includes(status);
    }

    function formatDate(value) {
        if (!value) return "Date unavailable";

        const date = new Date(value);

        if (Number.isNaN(date.getTime())) {
            return "Date unavailable";
        }

        return date.toLocaleString("en-KE", {
            dateStyle: "medium",
            timeStyle: "short"
        });
    }

    function showMessage(message, type = "error", retry = false) {
        if (!ordersList) return;
        ordersList.innerHTML = "<div class=\"orders-load-message " + type + "\" role=\"status\"><p>" + escapeHtml(message) + "</p>" + (retry ? "<button type=\"button\" id=\"retryOrdersButton\" class=\"view-order-button\">Try again</button>" : "") + "</div>";
        if (noOrders) noOrders.style.display = "none";
    }

    function normalizeOrdersResponse(result) {
        const data = result?.data;

        if (Array.isArray(data?.orders)) return data.orders;
        if (Array.isArray(result?.orders)) return result.orders;
        if (Array.isArray(data)) return data;

        return null;
    }

    function getOrderItems(order) {
        if (Array.isArray(order.items)) return order.items;
        if (Array.isArray(order.order_items)) return order.order_items;
        return [];
    }

    function renderOrder(order) {
        const status = getStatus(order);
        const orderItems = getOrderItems(order);
        const restaurantName = order.restaurant_name || "Restaurant";

        const itemsHtml = orderItems.length
            ? orderItems.slice(0, 3).map(item => {
                const name = item.food_name ||
                    item.name ||
                    item.food?.name ||
                    "Food item";

                const quantity = Number(item.quantity) || 1;

                return `
                    <div class="order-item">
                        <div class="order-item-quantity">${quantity}x</div>
                        <div class="order-item-info">
                            <h4>${escapeHtml(name)}</h4>
                            <p>${money(item.unit_price ?? item.price)}</p>
                        </div>
                    </div>
                `;
            }).join("")
            : `
                <div class="order-items-placeholder">
                    <span class="placeholder-icon" aria-hidden="true">ⓘ</span>
                    <span>Click <strong>View Order</strong> to see your order items and details.</span>
                </div>
            `;

        const moreItems = orderItems.length > 3
            ? `<p class="order-more-items">and ${orderItems.length - 3} more item(s)</p>`
            : "";

        const orderId = encodeURIComponent(order.id);
        const canCancel = ["pending", "confirmed"].includes(status);

        return `
            <article class="order-card" data-status="${escapeHtml(status)}">
                <div class="order-card-header">
                    <div class="order-restaurant">
                        <div class="restaurant-avatar">
                            ${escapeHtml(restaurantName.trim().charAt(0).toUpperCase() || "R")}
                        </div>
                        <div>
                            <h3>${escapeHtml(restaurantName)}</h3>
                            <p>Order #${escapeHtml(order.order_number || order.id)}</p>
                        </div>
                    </div>

                    <span class="order-status status-${escapeHtml(status)}">
                        ${escapeHtml(getStatusLabel(status))}
                    </span>
                </div>

                <div class="order-card-body">
                    <div class="order-items">
                        ${itemsHtml}
                        ${moreItems}
                    </div>

                    <div class="order-total">
                        <span>Total</span>
                        <strong>${money(order.total_amount)}</strong>
                    </div>
                </div>

                <div class="order-card-footer">
                    <div class="order-date">
                        ${escapeHtml(formatDate(order.placed_at || order.created_at))}
                    </div>

                    <div class="order-actions order-card-actions">
                        <a href="order-details.html?id=${orderId}"
                           class="view-order-button">
                            View Order
                        </a>

                        ${canCancel ? `
                            <button type="button"
                                    class="cancel-order-button"
                                    data-order-id="${escapeHtml(order.id)}">
                                Cancel Order
                            </button>
                        ` : ""}
                    </div>
                </div>
            </article>
        `;
    }

    function renderOrders() {
        if (!ordersList) return;

        const filteredOrders = orders.filter(order => {
            const status = getStatus(order);

            if (selectedFilter === "all") return true;
            if (selectedFilter === "active") return isActive(status);

            return status === selectedFilter;
        });

        if (ordersCount) {
            ordersCount.textContent =
                `${filteredOrders.length} ${filteredOrders.length === 1 ? "order" : "orders"}`;
        }

        if (filteredOrders.length === 0) {
            ordersList.innerHTML = "";

            if (noOrders) {
                noOrders.style.display = "block";

                const heading = noOrders.querySelector("h3");
                const paragraph = noOrders.querySelector("p");

                if (heading) heading.textContent = "No orders found";

                if (paragraph) {
                    paragraph.textContent = selectedFilter === "all"
                        ? "You haven't placed any orders yet."
                        : `You have no ${selectedFilter === "active" ? "active" : selectedFilter} orders.`;
                }
            }

            return;
        }

        if (noOrders) noOrders.style.display = "none";

        ordersList.innerHTML = filteredOrders.map(renderOrder).join("");
    }

    async function loadOrders(options = {}) {
        const quiet = options.quiet === true;
        if (isLoading) return;
        isLoading = true;
        const token = getToken();

        if (!token) {
            showMessage("Please log in to view your orders.");
            if (ordersCount) ordersCount.textContent = "0 orders";
            if (noOrders) noOrders.style.display = "none";
            isLoading = false;
            return;
        }

        if (!quiet) showMessage("Loading your orders...", "loading");
        if (refreshButton) refreshButton.disabled = true;

        try {
            const response = await fetch(`${API_BASE}/orders/my-orders`, {
                method: "GET",
                headers: {
                    Accept: "application/json",
                    Authorization: `Bearer ${token}`
                }
            });

            const result = await response.json().catch(() => ({}));

            if (response.status === 401 || response.status === 403) {
                throw new Error(
                    result.message ||
                    "Your session has expired or you are not authorized to view these orders."
                );
            }

            if (!response.ok || result.success === false) {
                throw new Error(
                    result.message || `Failed to load orders (HTTP ${response.status}).`
                );
            }

            const list = normalizeOrdersResponse(result);

            if (!list) {
                console.error("Unexpected orders API response:", result);
                throw new Error("The API response did not contain an orders list.");
            }

            orders = list;
            renderOrders();

        } catch (error) {
            console.error("Failed to load customer orders:", error);
            if (!quiet || orders.length === 0) showMessage(error.message || "Unable to load your orders. Please try again.", "error", true);
        } finally {
            isLoading = false;
            if (refreshButton) refreshButton.disabled = false;
        }
    }

    filterButtons.forEach(button => {
        button.addEventListener("click", () => {
            filterButtons.forEach(item => item.classList.remove("active"));
            button.classList.add("active");

            selectedFilter = button.dataset.status || "all";
            renderOrders();
        });
    });

    if (ordersList) {
        ordersList.addEventListener("click", async event => {
            const retryButton = event.target.closest("#retryOrdersButton");
            if (retryButton) { await loadOrders(); return; }
            const button = event.target.closest(".cancel-order-button");
            if (!button) return;

            const orderId = button.dataset.orderId;

            if (!window.confirm("Are you sure you want to cancel this order?")) {
                return;
            }

            const token = getToken();

            if (!token) {
                alert("Please log in before cancelling an order.");
                return;
            }

            button.disabled = true;
            button.textContent = "Cancelling...";

            try {
                const response = await fetch(
                    `${API_BASE}/orders/my-orders/${encodeURIComponent(orderId)}/cancel`,
                    {
                        method: "PATCH",
                        headers: {
                            Accept: "application/json",
                            Authorization: `Bearer ${token}`
                        }
                    }
                );

                const result = await response.json().catch(() => ({}));

                if (!response.ok || result.success === false) {
                    throw new Error(
                        result.message ||
                        `Could not cancel order (HTTP ${response.status}).`
                    );
                }

                await loadOrders();

            } catch (error) {
                console.error("Order cancellation failed:", error);
                alert(error.message || "Could not cancel this order.");
                button.disabled = false;
                button.textContent = "Cancel Order";
            }
        });
    }

    /* Mobile navigation */
    const mobileMenuButton = document.getElementById("mobileMenuButton");
    const mobileNavigation = document.getElementById("mobileNavigation");

    if (mobileMenuButton && mobileNavigation) {
        mobileMenuButton.addEventListener("click", () => {
            mobileNavigation.classList.toggle("active");

            mobileMenuButton.setAttribute(
                "aria-expanded",
                String(mobileNavigation.classList.contains("active"))
            );
        });

        mobileNavigation.querySelectorAll("a").forEach(link => {
            link.addEventListener("click", () => {
                mobileNavigation.classList.remove("active");
                mobileMenuButton.setAttribute("aria-expanded", "false");
            });
        });
    }

    if (refreshButton) refreshButton.addEventListener("click", () => loadOrders());
    loadOrders();
    refreshTimer = window.setInterval(() => loadOrders({ quiet: true }), 30000);
    window.addEventListener("beforeunload", () => { if (refreshTimer) window.clearInterval(refreshTimer); });
});
