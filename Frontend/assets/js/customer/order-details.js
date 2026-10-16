
/* =========================================================
   CUSTOMER ORDER DETAILS
   FoodDelivery
   Backend: GET /api/orders/my-orders/:id
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
    const contactButton = document.getElementById("contactRestaurantButton");

    let currentOrder = null;

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

    function formatMoney(value) {
        return `KSh ${(Number(value) || 0).toLocaleString("en-KE", {
            minimumFractionDigits: 0,
            maximumFractionDigits: 2
        })}`;
    }

    function formatDate(value) {
        if (!value) return "Not yet";

        const date = new Date(value);

        if (Number.isNaN(date.getTime())) return "Not available";

        return date.toLocaleString("en-KE", {
            dateStyle: "medium",
            timeStyle: "short"
        });
    }

    function getToken() {
        return localStorage.getItem(TOKEN_KEY) ||
            sessionStorage.getItem(TOKEN_KEY);
    }

    function getOrderId() {
        const params = new URLSearchParams(window.location.search);
        return params.get("id");
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

        return labels[String(status || "").toLowerCase()] ||
            String(status || "Unknown").replaceAll("_", " ");
    }

    function showMessage(message, type = "info") {
        if (!actionMessage) return;

        actionMessage.textContent = message;
        actionMessage.className = `order-action-message ${type}`;
        actionMessage.setAttribute("role", "status");
        actionMessage.setAttribute("aria-live", "polite");
    }

    function setPageMessage(message) {
        const container = document.querySelector(".order-details-container");

        if (!container) return;

        let messageElement = document.getElementById("orderLoadMessage");

        if (!messageElement) {
            messageElement = document.createElement("div");
            messageElement.id = "orderLoadMessage";
            messageElement.className = "order-load-message";
            messageElement.setAttribute("role", "status");

            const backLink = container.querySelector(".order-back-link");

            if (backLink) {
                backLink.insertAdjacentElement("afterend", messageElement);
            } else {
                container.prepend(messageElement);
            }
        }

        messageElement.textContent = message;
    }

    function updateHeading(heading, paragraph, status) {
        if (!pageHeader) return;

        const title = pageHeader.querySelector("h1");
        const description = pageHeader.querySelector("p");
        const statusElement = pageHeader.querySelector(".order-status");

        if (title) {
            title.textContent = `Order #${currentOrder.order_number || currentOrder.id}`;
        }

        if (description) {
            description.textContent =
                `Placed ${formatDate(currentOrder.placed_at || currentOrder.created_at)}`;
        }

        if (statusElement) {
            statusElement.textContent = getStatusLabel(status);
            statusElement.className =
                `order-status status-${String(status).toLowerCase()}`;
        }
    }

    /* =====================================================
       ORDER STATUS TIMELINE
    ===================================================== */

    function renderTimeline(order) {
        if (!timeline) return;

        const status = String(order.status || "pending").toLowerCase();

        const steps = [
            {
                key: "pending",
                title: "Order Placed",
                description: "Your order has been received",
                date: order.placed_at || order.created_at
            },
            {
                key: "confirmed",
                title: "Confirmed",
                description: "The restaurant confirmed your order",
                date: order.confirmed_at
            },
            {
                key: "preparing",
                title: "Preparing",
                description: "Your food is being prepared",
                date: order.preparing_at
            },
            {
                key: "out_for_delivery",
                title: "Out for Delivery",
                description: "Your order is on its way",
                date: order.out_for_delivery_at
            },
            {
                key: "delivered",
                title: "Delivered",
                description: "Your order has been delivered",
                date: order.delivered_at
            }
        ];

        const progress = {
            pending: 0,
            confirmed: 1,
            preparing: 2,
            ready: 2,
            out_for_delivery: 3,
            delivered: 4,
            cancelled: -1
        };

        const currentStep = progress[status] ?? 0;

        if (status === "cancelled") {
            timeline.innerHTML = `
                <div class="timeline-step current">
                    <div class="timeline-icon">!</div>
                    <div class="timeline-content">
                        <strong>Order Cancelled</strong>
                        <span>
                            ${escapeHtml(formatDate(order.cancelled_at))}
                        </span>
                    </div>
                </div>
            `;
            return;
        }

        timeline.innerHTML = steps.map((step, index) => {
            let className = "timeline-step";
            let icon = String(index + 1);

            if (index < currentStep) {
                className += " completed";
                icon = "✓";
            } else if (index === currentStep) {
                className += " current";
            }

            // "Ready" means the kitchen has completed the order,
            // even if the rider has not collected it yet.
            if (status === "ready" && index === 2) {
                className = "timeline-step completed";
                icon = "✓";
            }

            const dateText = step.date
                ? formatDate(step.date)
                : step.description;

            return `
                <div class="${className}">
                    <div class="timeline-icon">${icon}</div>
                    <div class="timeline-content">
                        <strong>${escapeHtml(step.title)}</strong>
                        <span>${escapeHtml(dateText)}</span>
                    </div>
                </div>
            `;
        }).join("");
    }

    /* =====================================================
       RESTAURANT DETAILS
    ===================================================== */

    function renderRestaurant(order) {
        if (!restaurantInfo) return;

        const name = order.restaurant_name || "Restaurant";
        const logo = order.restaurant_logo;

        restaurantInfo.innerHTML = `
            <div class="restaurant-order-avatar">
                ${
                    logo
                        ? `<img src="${escapeHtml(logo)}"
                               alt="${escapeHtml(name)}"
                               style="width:100%;height:100%;object-fit:cover;border-radius:inherit;">`
                        : escapeHtml(name.charAt(0).toUpperCase())
                }
            </div>

            <div class="restaurant-order-details">
                <h3>${escapeHtml(name)}</h3>
                <p>Restaurant</p>
            </div>
        `;

        const image = restaurantInfo.querySelector("img");

        if (image) {
            image.addEventListener("error", () => {
                image.remove();
                const avatar = restaurantInfo.querySelector(
                    ".restaurant-order-avatar"
                );

                if (avatar) {
                    avatar.textContent = name.charAt(0).toUpperCase();
                }
            });
        }
    }

    /* =====================================================
       ORDER ITEMS
    ===================================================== */

    function renderItems(order) {
        if (!orderItemsContainer) return;

        const items = Array.isArray(order.items) ? order.items : [];

        if (items.length === 0) {
            orderItemsContainer.innerHTML =
                "<p>Item details are not available.</p>";
            return;
        }

        orderItemsContainer.innerHTML = items.map(item => {
            const name = item.food_name || item.name || "Food item";
            const quantity = Number(item.quantity) || 1;
            const unitPrice = Number(item.unit_price) || 0;
            const imageUrl = item.image_url;

            return `
                <div class="order-detail-item">
                    <div class="order-item-image">
                        ${
                            imageUrl
                                ? `<img src="${escapeHtml(imageUrl)}"
                                       alt="${escapeHtml(name)}"
                                       style="width:100%;height:100%;object-fit:cover;">`
                                : escapeHtml(name.charAt(0).toUpperCase())
                        }
                    </div>

                    <div class="order-item-info">
                        <h3>${escapeHtml(name)}</h3>
                        <p>Quantity: ${quantity}</p>
                        <p>Unit price: ${formatMoney(unitPrice)}</p>
                    </div>

                    <div class="order-item-price">
                        ${formatMoney(item.subtotal ?? unitPrice * quantity)}
                    </div>
                </div>
            `;
        }).join("");

        orderItemsContainer.querySelectorAll("img").forEach(image => {
            image.addEventListener("error", () => {
                const parent = image.parentElement;

                if (parent) {
                    parent.textContent =
                        image.alt.charAt(0).toUpperCase();
                }
            });
        });
    }

    /* =====================================================
       DELIVERY INFORMATION
    ===================================================== */

    function renderDeliveryInfo(order) {
        if (!deliveryInfo) return;

        const fields = [
            {
                label: "Delivery Address",
                value: [
                    order.delivery_address,
                    order.delivery_city
                ].filter(Boolean).join(", ") || "Not provided"
            },
            {
                label: "Recipient",
                value: order.recipient_name || "Not provided"
            },
            {
                label: "Contact Phone",
                value: order.recipient_phone || "Not provided"
            },
            {
                label: "Delivery Instructions",
                value: order.delivery_instructions || "None"
            },
            {
                label: "Order Number",
                value: order.order_number || order.id
            },
            {
                label: "Date Placed",
                value: formatDate(order.placed_at || order.created_at)
            }
        ];

        deliveryInfo.innerHTML = fields.map(field => `
            <div class="delivery-info-item">
                <span class="info-label">${escapeHtml(field.label)}</span>
                <strong>${escapeHtml(field.value)}</strong>
            </div>
        `).join("");
    }

    /* =====================================================
       ORDER SUMMARY
    ===================================================== */

    function renderSummary(order) {
        if (!summaryCard) return;

        const restaurantName = order.restaurant_name || "Restaurant";
        const items = Array.isArray(order.items) ? order.items : [];

        const summaryRestaurant =
            summaryCard.querySelector(".summary-restaurant");

        const summaryItems = summaryCard.querySelector(".summary-items");
        const rows = summaryCard.querySelectorAll(".summary-row");
        const summaryTotal = summaryCard.querySelector(".summary-total");

        if (summaryRestaurant) {
            summaryRestaurant.innerHTML = `
                <strong>${escapeHtml(restaurantName)}</strong>
                <span>Order #${escapeHtml(order.order_number || order.id)}</span>
            `;
        }

        if (summaryItems) {
            summaryItems.innerHTML = items.map(item => {
                const name = item.food_name || item.name || "Food item";
                const quantity = Number(item.quantity) || 1;
                const lineTotal = Number(
                    item.subtotal ??
                    (Number(item.unit_price) || 0) * quantity
                );

                return `
                    <div class="summary-row">
                        <span>${escapeHtml(name)} × ${quantity}</span>
                        <strong>${formatMoney(lineTotal)}</strong>
                    </div>
                `;
            }).join("");
        }

        // The summary card's first two summary rows outside summary-items
        // represent subtotal and delivery fee in the existing HTML.
        const summaryLabels = [...summaryCard.querySelectorAll(".summary-row")]
            .filter(row => !row.closest(".summary-items"));

        const subtotalRow = summaryLabels.find(row =>
            row.querySelector("span")?.textContent.trim().toLowerCase() === "subtotal"
        );

        const deliveryRow = summaryLabels.find(row =>
            row.querySelector("span")?.textContent.trim().toLowerCase() === "delivery fee"
        );

        if (subtotalRow) {
            const value = subtotalRow.querySelector("strong");
            if (value) value.textContent = formatMoney(order.subtotal);
        }

        if (deliveryRow) {
            const value = deliveryRow.querySelector("strong");
            if (value) value.textContent = formatMoney(order.delivery_fee);
        }

        if (summaryTotal) {
            const value = summaryTotal.querySelector("strong");

            if (value) {
                value.textContent = formatMoney(order.total_amount);
            }
        }
    }

    /* =====================================================
       PAYMENT INFORMATION
       Backend does not currently return a payment method.
    ===================================================== */

    function renderPayment(order) {
        if (!paymentCard) return;

        const statusElement = paymentCard.querySelector(".payment-status");

        if (statusElement) {
            statusElement.textContent =
                order.payment_status || "Payment status not available";
        }

        const paymentInfo = paymentCard.querySelector(".payment-info");

        if (paymentInfo) {
            const methodElement = paymentInfo.querySelector(
                ".payment-method"
            );

            if (methodElement) {
                methodElement.textContent =
                    order.payment_method || "Not recorded";
            }
        }
    }

    /* =====================================================
       CONTACT RESTAURANT
    ===================================================== */

    if (contactButton) {
        contactButton.addEventListener("click", () => {
            if (!currentOrder) {
                showMessage("Order details are not loaded yet.", "error");
                return;
            }

            showMessage(
                "Restaurant contact details are not available in this order response. Please use the restaurant page for contact information.",
                "info"
            );
        });
    }

    /* =====================================================
       LOAD ORDER FROM BACKEND
    ===================================================== */

    async function loadOrder() {
        const orderId = getOrderId();

        if (!orderId || !/^[1-9]\d*$/.test(orderId)) {
            setPageMessage("A valid order ID is missing from the URL.");
            return;
        }

        const token = getToken();

        if (!token) {
            setPageMessage("Please log in to view your order details.");
            return;
        }

        setPageMessage("Loading order details...");

        try {
            const response = await fetch(
                `${API_BASE}/orders/my-orders/${encodeURIComponent(orderId)}`,
                {
                    method: "GET",
                    headers: {
                        Accept: "application/json",
                        Authorization: `Bearer ${token}`
                    }
                }
            );

            const result = await response.json().catch(() => ({}));

            if (response.status === 401 || response.status === 403) {
                throw new Error(
                    result.message ||
                    "Your session has expired or you are not authorized to view this order."
                );
            }

            if (response.status === 404) {
                throw new Error("This order was not found in your account.");
            }

            if (!response.ok || result.success === false) {
                throw new Error(
                    result.message ||
                    `Unable to load order (HTTP ${response.status}).`
                );
            }

            const order = result.data?.order || result.order;

            if (!order || order.id == null) {
                console.error("Unexpected order details response:", result);
                throw new Error("The API response did not contain order details.");
            }

            currentOrder = order;

            const status = String(order.status || "pending").toLowerCase();

            updateHeading(null, null, status);
            renderTimeline(order);
            renderRestaurant(order);
            renderItems(order);
            renderDeliveryInfo(order);
            renderSummary(order);
            renderPayment(order);

            const loadMessage = document.getElementById("orderLoadMessage");
            if (loadMessage) loadMessage.remove();

            document.title =
                `Order #${order.order_number || order.id} | FoodDelivery`;

        } catch (error) {
            console.error("Failed to load order details:", error);
            setPageMessage(
                error.message || "Unable to load order details. Please try again."
            );
        }
    }

    /* =====================================================
       MOBILE NAVIGATION
    ===================================================== */

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

    loadOrder();
});
