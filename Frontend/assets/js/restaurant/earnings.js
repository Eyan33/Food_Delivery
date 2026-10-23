/* =========================================================
   RESTAURANT EARNINGS
   FoodDelivery — Backend Connected
   ========================================================= */

document.addEventListener("DOMContentLoaded", () => {
    "use strict";

    const API_BASE = (window.FOOD_DELIVERY_API_BASE || document.querySelector('meta[name="api-base-url"]')?.content?.trim() || "http://localhost:5000/api").replace(/\/+$/, "");

    const $ = (id) => document.getElementById(id);

    const earningsPeriod = $("earningsPeriod");
    const exportEarningsButton = $("exportEarningsButton");
    const restaurantMenuButton = $("restaurantMenuButton");
    const restaurantSidebar = $("restaurantSidebar");

    const earningsTable = document.querySelector(".earnings-table");
    const earningsTableBody = earningsTable?.querySelector("tbody");
    const summaryCards = document.querySelectorAll(".earnings-summary-card");
    const chartBars = document.querySelector(".chart-bars");
    const chartYAxis = document.querySelector(".chart-y-axis");
    const payoutDetails = document.querySelector(".payout-details");
    const payoutStatus = document.querySelector(".payout-status");
    const restaurantSidebarName = $("restaurantSidebarName");
    const restaurantTopbarName = $("restaurantTopbarName");
    const restaurantTopbarAvatar = $("restaurantTopbarAvatar");
    const restaurantStatusText = $("restaurantStatusText");
    const restaurantStatusDisplay = $("restaurantStatusDisplay");
    const profileButton = document.querySelector(".restaurant-topbar-profile");

    let payments = [];
    let filteredPayments = [];
    let loading = false;

    /*
    |--------------------------------------------------------------------------
    | API
    |--------------------------------------------------------------------------
    */

    async function apiRequest(path) {
        const token =
            localStorage.getItem("foodDeliveryAccessToken") ||
            sessionStorage.getItem("foodDeliveryAccessToken");

        if (!token) {
            throw new Error("Your session has expired. Please log in again.");
        }

        const response = await fetch(`${API_BASE}${path}`, {
            method: "GET",
            headers: {
                Authorization: `Bearer ${token}`,
                Accept: "application/json"
            }
        });

        let result;

        try {
            result = await response.json();
        } catch {
            throw new Error("The server returned an invalid response.");
        }

        if (!response.ok || result.success === false) {
            throw new Error(
                result.message || `Request failed (${response.status}).`
            );
        }

        return result;
    }

    /*
    |--------------------------------------------------------------------------
    | INITIAL LOAD
    |--------------------------------------------------------------------------
    */

    async function loadEarnings() {
        if (loading) return;
        loading = true;

        if (earningsTableBody) {
            earningsTableBody.innerHTML = `
                <tr>
                    <td colspan="7">Loading payment transactions...</td>
                </tr>
            `;
        }

        try {
            const [paymentsResult, profileResult] = await Promise.all([
                apiRequest("/payments/restaurant"),
                apiRequest("/restaurants/owner/me")
            ]);

            payments = Array.isArray(paymentsResult.data?.payments)
                ? paymentsResult.data.payments
                : Array.isArray(paymentsResult.payments)
                    ? paymentsResult.payments
                    : [];

            const restaurant = profileResult.restaurant || profileResult.data?.restaurant || profileResult.data || profileResult;
            renderRestaurantProfile(restaurant);
            updateEarningsPeriod();
        } catch (error) {
            console.error("Loading earnings failed:", error);
            payments = [];
            filteredPayments = [];
            renderUnavailable(error.message);
            showEarningsMessage(error.message, "error");
        } finally {
            loading = false;
        }
    }

    /*
    |--------------------------------------------------------------------------
    | PERIOD FILTER
    |--------------------------------------------------------------------------
    */

    if (earningsPeriod) {
        earningsPeriod.addEventListener("change", updateEarningsPeriod);
    }

    function getPeriodStart(period) {
        const now = new Date();
        const start = new Date(now);

        if (period === "today") {
            start.setHours(0, 0, 0, 0);
        } else if (period === "week") {
            start.setHours(0, 0, 0, 0);

            const day = start.getDay();
            const daysSinceMonday = (day + 6) % 7;

            start.setDate(start.getDate() - daysSinceMonday);
        } else if (period === "month") {
            start.setDate(1);
            start.setHours(0, 0, 0, 0);
        } else if (period === "year") {
            start.setMonth(0, 1);
            start.setHours(0, 0, 0, 0);
        }

        return start;
    }

    function getPaymentDate(payment) {
        const value =
            payment.paid_at ||
            payment.created_at;

        if (!value) return null;

        const date = new Date(value);

        return Number.isNaN(date.getTime()) ? null : date;
    }

    function updateEarningsPeriod() {
        const period = earningsPeriod?.value || "month";
        const start = getPeriodStart(period);
        const now = new Date();

        filteredPayments = payments.filter((payment) => {
            const date = getPaymentDate(payment);

            return date && date >= start && date <= now;
        });

        renderSummary();
        renderTransactions();
        renderRevenueChart();
        renderRevenueBreakdown();
        renderPerformance();
        renderPayoutSummary();
    }

    /*
    |--------------------------------------------------------------------------
    | FINANCIAL RULES
    |--------------------------------------------------------------------------
    |
    | Only completed payments on non-cancelled orders count as collected
    | revenue. Pending, processing, failed, and refunded payments are not
    | counted as collected revenue.
    |
    | This project does not yet configure a platform fee percentage or
    | persist verified payout records. We therefore do not invent those
    | figures.
    |--------------------------------------------------------------------------
    */

    function isCancelledOrder(payment) {
        return String(payment.order_status || "").toLowerCase() === "cancelled";
    }

    function isRefundedPayment(payment) {
        return String(payment.payment_status || "").toLowerCase() === "refunded";
    }

    function isCompletedPayment(payment) {
        return (
            String(payment.payment_status || "").toLowerCase() === "completed" &&
            !isCancelledOrder(payment) &&
            !isRefundedPayment(payment)
        );
    }

    function amountOf(payment) {
        const amount = Number(payment.amount);

        return Number.isFinite(amount) && amount > 0 ? amount : 0;
    }

    function getCompletedPayments(list = filteredPayments) {
        return list.filter(isCompletedPayment);
    }

    function sumAmounts(list) {
        return list.reduce((total, payment) => total + amountOf(payment), 0);
    }

    /*
    |--------------------------------------------------------------------------
    | SUMMARY CARDS
    |--------------------------------------------------------------------------
    */

    function renderSummary() {
        const completed = getCompletedPayments();
        const revenue = sumAmounts(completed);
        const completedOrders = new Set(
            completed.map((payment) => String(payment.order_id))
        );

        const averageOrder = completedOrders.size
            ? revenue / completedOrders.size
            : 0;

        setSummaryCard(0, "Total Revenue", formatMoney(revenue),
            "Completed payments, excluding cancelled orders");

        setSummaryCard(1, "Completed Payments", String(completed.length),
            "Payments marked completed");

        setSummaryCard(2, "Completed Orders", String(completedOrders.size),
            "Distinct orders with completed payments");

        setSummaryCard(3, "Average Order", formatMoney(averageOrder),
            "Revenue divided by completed orders");
    }

    function setSummaryCard(index, label, value, description) {
        const card = summaryCards[index];
        if (!card) return;

        const labelElement = card.querySelector(".earnings-summary-content > span");
        const valueElement = card.querySelector(".earnings-summary-content > strong");
        const descriptionElement = card.querySelector(".earnings-summary-content > small");
        const changeElement = card.querySelector(".earnings-change");

        if (labelElement) labelElement.textContent = label;
        if (valueElement) valueElement.textContent = value;
        if (descriptionElement) descriptionElement.textContent = description;

        // Do not show hardcoded percentage changes as if they were real.
        if (changeElement) changeElement.hidden = true;
    }

    /*
    |--------------------------------------------------------------------------
    | TRANSACTIONS TABLE
    |--------------------------------------------------------------------------
    */

    function renderTransactions() {
        if (!earningsTableBody) return;

        const sorted = [...filteredPayments].sort((a, b) => {
            return (getPaymentDate(b)?.getTime() || 0) -
                (getPaymentDate(a)?.getTime() || 0);
        });

        if (sorted.length === 0) {
            earningsTableBody.innerHTML = `
                <tr>
                    <td colspan="7">No payment transactions for this period.</td>
                </tr>
            `;
            return;
        }

        earningsTableBody.innerHTML = "";

        sorted.forEach((payment) => {
            const row = document.createElement("tr");

            const status = String(payment.payment_status || "unknown")
                .toLowerCase();

            const isPayout = false;
            const amount = amountOf(payment);

            /*
             * No platform fee is calculated here because the project does
             * not currently provide a configured, authoritative fee rule.
             */
            const fee = null;
            const net = null;

            row.innerHTML = `
                <td>
                    <div class="transaction-info">
                        <span class="transaction-icon">↗</span>
                        <div>
                            <strong>Order Payment</strong>
                            <small>${escapeHtml(formatPaymentMethod(payment.payment_method))}</small>
                        </div>
                    </div>
                </td>

                <td>${escapeHtml(payment.order_number || `Order #${payment.order_id || "—"}`)}</td>

                <td>${escapeHtml(formatDate(getPaymentDate(payment)))}</td>

                <td><strong>${formatMoney(amount)}</strong></td>

                <td>${fee === null ? "Not configured" : formatMoney(fee)}</td>

                <td><strong>${net === null ? "Not configured" : formatMoney(net)}</strong></td>

                <td>
                    <span class="transaction-status ${escapeHtml(statusClass(status))}">
                        ${escapeHtml(formatStatus(status))}
                    </span>
                </td>
            `;

            row.dataset.paymentId = String(payment.id || "");
            row.title = payment.transaction_reference
                ? `Transaction reference: ${payment.transaction_reference}`
                : "";

            earningsTableBody.appendChild(row);
        });
    }

    /*
    |--------------------------------------------------------------------------
    | REVENUE CHART
    |--------------------------------------------------------------------------
    */

    function renderRevenueChart() {
        if (!chartBars) return;

        const period = earningsPeriod?.value || "month";
        const completed = getCompletedPayments();

        const buckets = createChartBuckets(period);
        completed.forEach((payment) => {
            const date = getPaymentDate(payment);
            if (!date) return;

            const bucket = findChartBucket(buckets, date);
            if (bucket) bucket.amount += amountOf(payment);
        });

        const maxBucket = Math.max(1, ...buckets.map((bucket) => bucket.amount));
        chartBars.innerHTML = "";

        buckets.forEach((bucket) => {
            const column = document.createElement("div");
            column.className = "chart-bar-column";

            const bar = document.createElement("div");
            bar.className = "chart-bar revenue-bar";

            const height = bucket.amount > 0
                ? Math.max(3, (bucket.amount / maxBucket) * 100)
                : 0;

            bar.style.height = `${height}%`;
            bar.title = `${bucket.label}: ${formatMoney(bucket.amount)}`;

            const label = document.createElement("span");
            label.textContent = bucket.label;

            column.appendChild(bar);
            column.appendChild(label);
            chartBars.appendChild(column);
        });

        if (chartYAxis) {
            const maxValue = Math.ceil(maxBucket / 5) * 5 || 5;

            chartYAxis.innerHTML = "";

            for (let step = 5; step >= 0; step--) {
                const label = document.createElement("span");
                label.textContent = formatCompactMoney(maxValue * step / 5);
                chartYAxis.appendChild(label);
            }
        }
    }

    function createChartBuckets(period) {
        const now = new Date();
        const buckets = [];

        if (period === "today") {
            for (let hour = 0; hour < 24; hour += 3) {
                const start = new Date(now);
                start.setHours(hour, 0, 0, 0);

                const end = new Date(start);
                end.setHours(hour + 3, 0, 0, 0);

                buckets.push({
                    start,
                    end,
                    label: `${String(hour).padStart(2, "0")}:00`,
                    amount: 0
                });
            }
        } else if (period === "week") {
            const monday = getPeriodStart("week");

            for (let day = 0; day < 7; day++) {
                const start = new Date(monday);
                start.setDate(monday.getDate() + day);

                const end = new Date(start);
                end.setDate(start.getDate() + 1);

                buckets.push({
                    start,
                    end,
                    label: start.toLocaleDateString("en-KE", { weekday: "short" }),
                    amount: 0
                });
            }
        } else if (period === "year") {
            for (let month = 0; month < 12; month++) {
                const start = new Date(now.getFullYear(), month, 1);
                const end = new Date(now.getFullYear(), month + 1, 1);

                buckets.push({
                    start,
                    end,
                    label: start.toLocaleDateString("en-KE", { month: "short" }),
                    amount: 0
                });
            }
        } else {
            const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

            for (let week = 0; week < 5; week++) {
                const start = new Date(monthStart);
                start.setDate(1 + week * 7);

                const end = new Date(monthStart);
                end.setDate(1 + (week + 1) * 7);

                buckets.push({
                    start,
                    end,
                    label: `Week ${week + 1}`,
                    amount: 0
                });
            }
        }

        return buckets;
    }

    function findChartBucket(buckets, date) {
        return buckets.find(
            (bucket) => date >= bucket.start && date < bucket.end
        );
    }

    /*
    |--------------------------------------------------------------------------
    | REVENUE BREAKDOWN
    |--------------------------------------------------------------------------
    */

    function renderRevenueBreakdown() {
        const breakdownItems = document.querySelectorAll(
            ".earnings-breakdown-card .breakdown-item"
        );

        const completed = getCompletedPayments();
        const total = sumAmounts(completed);

        if (breakdownItems[0]) {
            setBreakdownItem(
                breakdownItems[0],
                "Completed order payments",
                formatMoney(total)
            );
        }

        if (breakdownItems[1]) {
            setBreakdownItem(
                breakdownItems[1],
                "Pending / processing payments",
                formatMoney(sumAmounts(
                    filteredPayments.filter((payment) =>
                        ["pending", "processing"].includes(
                            String(payment.payment_status || "").toLowerCase()
                        ) && !isCancelledOrder(payment)
                    )
                ))
            );
        }

        if (breakdownItems[2]) {
            setBreakdownItem(
                breakdownItems[2],
                "Refunded payments",
                formatMoney(sumAmounts(
                    filteredPayments.filter(isRefundedPayment)
                ))
            );
        }

        const progressBars = document.querySelectorAll(
            ".earnings-breakdown-card .breakdown-progress span"
        );

        const totals = [
            total,
            sumAmounts(filteredPayments.filter((payment) =>
                ["pending", "processing"].includes(
                    String(payment.payment_status || "").toLowerCase()
                ) && !isCancelledOrder(payment)
            )),
            sumAmounts(filteredPayments.filter(isRefundedPayment))
        ];

        progressBars.forEach((bar, index) => {
            const percentage = total > 0
                ? Math.min(100, (totals[index] / Math.max(total, ...totals, 1)) * 100)
                : 0;

            bar.style.width = `${percentage}%`;
        });
    }

    function setBreakdownItem(item, label, value) {
        const labelElement = item.querySelector(".breakdown-label span:last-child");
        const valueElement = item.querySelector("strong");

        if (labelElement) labelElement.textContent = label;
        if (valueElement) valueElement.textContent = value;
    }

    /*
    |--------------------------------------------------------------------------
    | PERFORMANCE
    |--------------------------------------------------------------------------
    */

    function renderPerformance() {
        const rows = document.querySelectorAll(
            ".earnings-performance-card .performance-row"
        );

        const completed = getCompletedPayments();
        const revenue = sumAmounts(completed);
        const completedOrders = new Set(
            completed.map((payment) => String(payment.order_id))
        );

        const orderIdsWithPayment = new Set(
            filteredPayments
                .filter((payment) => payment.order_id !== null && payment.order_id !== undefined)
                .map((payment) => String(payment.order_id))
        );
        const completedOrderIds = new Set(
            completed.filter((payment) => payment.order_id !== null && payment.order_id !== undefined)
                .map((payment) => String(payment.order_id))
        );
        const cancelledOrderIds = new Set(
            filteredPayments.filter(isCancelledOrder)
                .map((payment) => String(payment.order_id))
        );

        const completionRate = orderIdsWithPayment.size
            ? (completedOrderIds.size / orderIdsWithPayment.size) * 100
            : 0;
        const cancellationRate = orderIdsWithPayment.size
            ? (cancelledOrderIds.size / orderIdsWithPayment.size) * 100
            : 0;

        setPerformanceRow(rows[0], "Collected payment amount", formatMoney(revenue));
        setPerformanceRow(rows[1], "Average completed payment order",
            formatMoney(completedOrders.size ? revenue / completedOrders.size : 0));
        setPerformanceRow(rows[2], "Payment completion rate",
            `${completionRate.toFixed(1)}%`);
        setPerformanceRow(rows[3], "Payments linked to cancelled orders",
            `${cancellationRate.toFixed(1)}%`);
    }

    function setPerformanceRow(row, label, value) {
        if (!row) return;

        const labelElement = row.querySelector("span");
        const valueElement = row.querySelector("strong");

        if (labelElement) labelElement.textContent = label;
        if (valueElement) {
            valueElement.textContent = value;
            valueElement.classList.remove("performance-positive");
            valueElement.classList.remove("performance-warning");
        }
    }

    /*
    |--------------------------------------------------------------------------
    | PAYOUT SUMMARY
    |--------------------------------------------------------------------------
    */

    function renderPayoutSummary() {
        /*
         * Payment records are not payout records. Do not display the
         * sample payout balances and dates as if they came from the backend.
         */
        if (payoutStatus) {
            const strong = payoutStatus.querySelector("strong");
            const small = payoutStatus.querySelector("small");
            const label = payoutStatus.querySelector("span");

            if (label) label.textContent = "Payout tracking";
            if (strong) strong.textContent = "Not configured";
            if (small) {
                small.textContent =
                    "Payout records are not currently available from the backend.";
            }
        }

        if (payoutDetails) {
            payoutDetails.innerHTML = `
                <div class="payout-detail-row">
                    <span>Collected payments</span>
                    <strong>${formatMoney(sumAmounts(getCompletedPayments()))}</strong>
                </div>

                <div class="payout-detail-row">
                    <span>Pending / processing</span>
                    <strong>${formatMoney(sumAmounts(
                        filteredPayments.filter((payment) =>
                            ["pending", "processing"].includes(
                                String(payment.payment_status || "").toLowerCase()
                            ) && !isCancelledOrder(payment)
                        )
                    ))}</strong>
                </div>

                <div class="payout-detail-row">
                    <span>Platform fees</span>
                    <strong>Not configured</strong>
                </div>

                <div class="payout-detail-row total">
                    <span>Actual payouts</span>
                    <strong>Not available</strong>
                </div>
            `;
        }
    }

    document.querySelector(".earnings-payout-button")?.addEventListener(
        "click",
        () => {
            showEarningsMessage(
                "Payout history is not available yet because payout records are not implemented in the backend.",
                "info"
            );
        }
    );

    /*
    |--------------------------------------------------------------------------
    | CSV EXPORT
    |--------------------------------------------------------------------------
    */

    exportEarningsButton?.addEventListener("click", exportEarnings);

    function exportEarnings() {
        if (!filteredPayments.length) {
            showEarningsMessage(
                "There are no transactions for the selected period to export.",
                "error"
            );
            return;
        }

        const headers = [
            "Payment ID",
            "Order Number",
            "Date",
            "Payment Method",
            "Amount",
            "Payment Status",
            "Order Status",
            "Transaction Reference"
        ];

        const rows = filteredPayments.map((payment) => [
            payment.id,
            payment.order_number,
            formatDate(getPaymentDate(payment)),
            payment.payment_method,
            amountOf(payment),
            payment.payment_status,
            payment.order_status,
            payment.transaction_reference
        ]);

        const csv = [headers, ...rows]
            .map((row) => row.map(csvEscape).join(","))
            .join("\r\n");

        const blob = new Blob(["\uFEFF" + csv], {
            type: "text/csv;charset=utf-8;"
        });

        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");

        link.href = url;
        link.download = `fooddelivery-earnings-${earningsPeriod?.value || "month"}.csv`;

        document.body.appendChild(link);
        link.click();
        link.remove();

        URL.revokeObjectURL(url);

        showEarningsMessage("Earnings CSV exported successfully.", "success");
    }

    function csvEscape(value) {
        const text = String(value ?? "");
        return `"${text.replace(/"/g, '""')}"`;
    }

    /*
    |--------------------------------------------------------------------------
    | RESTAURANT PROFILE, LOGOUT AND NAVIGATION
    |--------------------------------------------------------------------------
    */

    function renderRestaurantProfile(restaurant) {
        if (!restaurant || typeof restaurant !== "object") {
            throw new Error("The server did not return your restaurant profile.");
        }
        const name = String(restaurant.name || restaurant.restaurant_name || "").trim();
        if (!name) throw new Error("Your restaurant name is missing from the profile response.");
        const initials = name.split(/\s+/).filter(Boolean).slice(0, 2)
            .map((part) => part.charAt(0).toUpperCase()).join("") || "R";
        if (restaurantSidebarName) restaurantSidebarName.textContent = name;
        if (restaurantTopbarName) restaurantTopbarName.textContent = name;
        if (restaurantTopbarAvatar) restaurantTopbarAvatar.textContent = initials;
        const sidebarAvatar = document.querySelector(".restaurant-avatar");
        if (sidebarAvatar) sidebarAvatar.textContent = initials;
        if (restaurantStatusText) {
            const isOpen = typeof restaurant.is_open === "boolean" ? restaurant.is_open : null;
            restaurantStatusText.textContent = isOpen === null ? "Unknown" : (isOpen ? "Open" : "Closed");
            if (restaurantStatusDisplay) {
                restaurantStatusDisplay.classList.toggle("open", isOpen === true);
                restaurantStatusDisplay.classList.toggle("closed", isOpen === false);
            }
        }
    }

    function renderUnavailable(message) {
        summaryCards.forEach((card) => {
            const value = card.querySelector(".earnings-summary-content > strong");
            const description = card.querySelector(".earnings-summary-content > small");
            const change = card.querySelector(".earnings-change");
            if (value) value.textContent = "Unavailable";
            if (description) description.textContent = "Could not load financial data.";
            if (change) change.hidden = true;
        });
        if (earningsTableBody) {
            earningsTableBody.innerHTML = `<tr><td colspan="7">${escapeHtml(message || "Financial data is unavailable.")}</td></tr>`;
        }
        if (chartBars) chartBars.innerHTML = "";
        if (chartYAxis) chartYAxis.innerHTML = "";
        document.querySelectorAll(".earnings-breakdown-card .breakdown-item strong")
            .forEach((node) => { node.textContent = "Unavailable"; });
        document.querySelectorAll(".earnings-breakdown-card .breakdown-progress span")
            .forEach((node) => { node.style.width = "0%"; });
        document.querySelectorAll(".earnings-performance-card .performance-row strong")
            .forEach((node) => { node.textContent = "Unavailable"; });
        renderPayoutSummary();
        if (payoutStatus) {
            const small = payoutStatus.querySelector("small");
            if (small) small.textContent = "Payout data is not available.";
        }
    }

    const logoutLink = document.querySelector(".logout-link");
    logoutLink?.addEventListener("click", (event) => {
        event.preventDefault();
        localStorage.removeItem("foodDeliveryAccessToken");
        sessionStorage.removeItem("foodDeliveryAccessToken");
        localStorage.removeItem("foodDeliveryUser");
        sessionStorage.removeItem("foodDeliveryUser");
        window.location.href = "../../pages/auth/login.html";
    });

    profileButton?.addEventListener("click", () => {
        window.location.href = "restaurant-profile.html";
    });

    /*
    |--------------------------------------------------------------------------
    | SIDEBAR
    |--------------------------------------------------------------------------
    */

    restaurantMenuButton?.addEventListener("click", () => {
        restaurantSidebar?.classList.toggle("open");
    });

    document.addEventListener("click", (event) => {
        if (!restaurantSidebar?.classList.contains("open")) return;

        if (
            !restaurantSidebar.contains(event.target) &&
            !restaurantMenuButton?.contains(event.target)
        ) {
            restaurantSidebar.classList.remove("open");
        }
    });

    /*
    |--------------------------------------------------------------------------
    | UTILITIES
    |--------------------------------------------------------------------------
    */

    function formatMoney(value) {
        return `KSh ${Number(value || 0).toLocaleString("en-KE", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        })}`;
    }

    function formatCompactMoney(value) {
        const amount = Number(value || 0);

        if (amount >= 1000000) {
            return `KSh ${(amount / 1000000).toFixed(1)}M`;
        }

        if (amount >= 1000) {
            return `KSh ${(amount / 1000).toFixed(1)}K`;
        }

        return `KSh ${amount.toFixed(0)}`;
    }

    function formatDate(value) {
        if (!value) return "—";

        const date = value instanceof Date ? value : new Date(value);

        if (Number.isNaN(date.getTime())) return "—";

        return date.toLocaleDateString("en-KE", {
            year: "numeric",
            month: "short",
            day: "2-digit"
        });
    }

    function formatPaymentMethod(value) {
        const methods = {
            mpesa: "M-Pesa",
            cash: "Cash",
            card: "Card"
        };

        const method = String(value || "").toLowerCase();

        return methods[method] || "Payment";
    }

    function formatStatus(status) {
        const labels = {
            pending: "Pending",
            processing: "Processing",
            completed: "Completed",
            failed: "Failed",
            refunded: "Refunded"
        };

        return labels[status] || status.replace(/_/g, " ");
    }

    function statusClass(status) {
        const classes = {
            completed: "completed",
            pending: "pending",
            processing: "pending",
            failed: "failed",
            refunded: "refunded"
        };

        return classes[status] || "pending";
    }

    function escapeHtml(value) {
        return String(value ?? "").replace(/[&<>"']/g, (character) => ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#039;"
        })[character]);
    }

    function showEarningsMessage(message, type = "success") {
        let element = $("earningsMessage");

        if (!element) {
            element = document.createElement("div");
            element.id = "earningsMessage";
            element.className = "earnings-message";

            const content = document.querySelector(
                ".restaurant-dashboard-content"
            );

            (content || document.body).prepend(element);
        }

        element.textContent = message;
        element.className = `earnings-message show ${type}`;

        clearTimeout(showEarningsMessage.timer);

        showEarningsMessage.timer = setTimeout(() => {
            element.classList.remove("show");
        }, 4000);
    }

    /*
    |--------------------------------------------------------------------------
    | START
    |--------------------------------------------------------------------------
    */

    loadEarnings();
});