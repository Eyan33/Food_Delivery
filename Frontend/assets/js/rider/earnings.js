
document.addEventListener("DOMContentLoaded", () => {
    "use strict";

    const API_BASE = (window.FOOD_DELIVERY_API_BASE || document.querySelector('meta[name="api-base-url"]')?.content?.trim() || "http://localhost:5000/api").replace(/\/+$/, "");
    const TOKEN_KEY = "foodDeliveryAccessToken";

    const elements = {
        sidebar: document.getElementById("riderSidebar"),
        menuButton: document.getElementById("riderMenuButton"),
        periodSelect: document.querySelector(".period-select"),
        downloadButton: document.querySelector(".download-btn"),
        withdrawButton: document.querySelector(".withdraw-btn"),
        notificationButton: document.querySelector(
            ".rider-notification-button"
        ),
        message: document.querySelector(".rider-message"),
        summaryCards: document.querySelectorAll(".earning-card"),
        chartBars: document.querySelector(".chart-bars"),
        chartDescription: document.querySelector(
            ".chart-panel .panel-header p"
        ),
        transactionTable: document.querySelector(".transaction-table"),
        paymentTotal: document.querySelector(".payment-total strong"),
        paymentRows: document.querySelectorAll(".payment-row"),
        profileNames: document.querySelectorAll(
            ".rider-profile-info strong, .rider-profile strong"
        ),
        weeklyBreakdown: findWeeklyBreakdown()
    };

    const state = {
        rider: null,
        earnings: null,
        period: "This Week",
        loading: false
    };

    function findWeeklyBreakdown() {
        const headings = Array.from(document.querySelectorAll("h1, h2, h3, h4"));

        const heading = headings.find(element =>
            element.textContent.trim().toLowerCase() === "weekly breakdown"
        );

        if (!heading) return null;

        return heading.closest(
            ".content-card, .dashboard-card, .panel, .earnings-panel, section, .card"
        ) || heading.parentElement?.parentElement || null;
    }

    // =====================================================
    // AUTHENTICATION AND API
    // =====================================================

    function getToken() {
        return (
            localStorage.getItem(TOKEN_KEY) ||
            sessionStorage.getItem(TOKEN_KEY) ||
            localStorage.getItem("token") ||
            sessionStorage.getItem("token") ||
            ""
        );
    }

    async function apiRequest(path, options = {}) {
        const token = getToken();

        if (!token) {
            throw new Error(
                "Your session is unavailable. Please sign in again."
            );
        }

        const headers = {
            Accept: "application/json",
            ...(options.headers || {}),
            Authorization: `Bearer ${token}`
        };

        if (options.body) {
            headers["Content-Type"] = "application/json";
        }

        const response = await fetch(`${API_BASE}${path}`, {
            ...options,
            headers
        });

        let result = {};

        try {
            result = await response.json();
        } catch (_) {
            // The API may return an empty response.
        }

        if (!response.ok || result.success === false) {
            throw new Error(
                result.message ||
                `Request failed with status ${response.status}.`
            );
        }

        return result;
    }

    // =====================================================
    // MESSAGES
    // =====================================================

    function showMessage(message, type = "info") {
        if (!elements.message) {
            console.log(`[Earnings ${type}] ${message}`);
            return;
        }

        elements.message.textContent = message;
        elements.message.classList.remove("success", "error", "info");
        elements.message.classList.add(type, "show");

        clearTimeout(showMessage.timeout);

        showMessage.timeout = setTimeout(() => {
            elements.message.classList.remove("show");
        }, 3500);
    }

    // =====================================================
    // FORMATTING
    // =====================================================

    function money(value) {
        const amount = Number(value) || 0;

        return `KSh ${amount.toLocaleString("en-KE", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        })}`;
    }

    function escapeHTML(value) {
        return String(value ?? "").replace(/[&<>"']/g, character => ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#39;"
        })[character]);
    }

    function formatDate(value) {
        if (!value) return "Date unavailable";

        const date = new Date(value);

        if (Number.isNaN(date.getTime())) {
            return "Date unavailable";
        }

        return date.toLocaleString("en-KE", {
            day: "numeric",
            month: "short",
            year: "numeric",
            hour: "numeric",
            minute: "2-digit"
        });
    }

    function dateKey(value) {
        const date = new Date(value);

        if (Number.isNaN(date.getTime())) return "";

        return [
            date.getFullYear(),
            String(date.getMonth() + 1).padStart(2, "0"),
            String(date.getDate()).padStart(2, "0")
        ].join("-");
    }

    function localDateFromKey(key) {
        const [year, month, day] = key.split("-").map(Number);
        return new Date(year, month - 1, day);
    }

    function formatDayLabel(key, period) {
        const date = localDateFromKey(key);

        if (period === "This Week") {
            return date.toLocaleDateString("en-KE", {
                weekday: "short"
            });
        }

        return date.toLocaleDateString("en-KE", {
            day: "numeric",
            month: "short"
        });
    }

    function getLocalDayDifference(first, second) {
        const a = localDateFromKey(first);
        const b = localDateFromKey(second);

        return Math.round((b - a) / 86400000);
    }

    // =====================================================
    // PROFILE
    // =====================================================

    async function loadRiderProfile() {
        try {
            const result = await apiRequest("/riders/me");
            const rider = result?.data?.rider || result?.rider;

            if (!rider) return;

            state.rider = rider;

            const fullName = [
                rider.first_name,
                rider.last_name
            ].filter(Boolean).join(" ").trim();

            if (fullName) {
                elements.profileNames.forEach(element => {
                    element.textContent = fullName;
                });
            }
        } catch (error) {
            console.warn("Could not load rider profile:", error.message);
        }
    }

    // =====================================================
    // LOAD EARNINGS
    // =====================================================

    async function loadEarnings() {
        if (state.loading) return;

        state.loading = true;

        if (elements.downloadButton) {
            elements.downloadButton.disabled = true;
        }

        try {
            const query = new URLSearchParams({
                period: state.period
            });

            const result = await apiRequest(
                `/riders/my-earnings?${query.toString()}`
            );

            const earnings =
                result?.data?.earnings ||
                result?.earnings;

            if (!earnings || !earnings.summary) {
                throw new Error(
                    "The server returned an invalid earnings response."
                );
            }

            state.earnings = earnings;

            renderSummary();
            renderPaymentSummary();
            renderChart();
            renderHistory();
            renderWeeklyBreakdown();
        } catch (error) {
            console.error("Failed to load rider earnings:", error);
            showMessage(error.message, "error");

            renderEmptyHistory(
                "Earnings could not be loaded. Refresh the page to try again."
            );

            renderEmptyWeeklyBreakdown(
                "Weekly earnings could not be loaded."
            );
        } finally {
            state.loading = false;

            if (elements.downloadButton) {
                elements.downloadButton.disabled = false;
            }
        }
    }

    // =====================================================
    // SUMMARY CARDS
    // =====================================================

    function renderSummary() {
        const summary = state.earnings?.summary;
        if (!summary) return;

        const cards = elements.summaryCards;

        if (cards[0]) {
            const amount = cards[0].querySelector("h2");
            if (amount) amount.textContent = money(summary.thisWeek);

            const detail = cards[0].querySelector(".earning-change");
            if (detail) {
                detail.textContent = "Completed deliveries this week";
            }
        }

        if (cards[1]) {
            const amount = cards[1].querySelector("h2");
            if (amount) amount.textContent = money(summary.thisMonth);

            const detail = cards[1].querySelector(".earning-change");
            if (detail) {
                detail.textContent = "Completed deliveries this month";
            }
        }

        if (cards[2]) {
            const amount = cards[2].querySelector("h2");

            if (amount) {
                amount.textContent = String(
                    Number(summary.monthDeliveries) || 0
                );
            }

            const detail = cards[2].querySelector(".earning-subtext");
            if (detail) detail.textContent = "This month";
        }

        if (cards[3]) {
            const amount = cards[3].querySelector("h2");

            if (amount) {
                amount.textContent = money(summary.averagePerDelivery);
            }

            const detail = cards[3].querySelector(".earning-subtext");
            if (detail) {
                detail.textContent = "Average per completed delivery";
            }
        }
    }

    // =====================================================
    // PAYMENT SUMMARY
    // =====================================================

    function renderPaymentSummary() {
        const summary = state.earnings?.summary;
        if (!summary) return;

        if (elements.paymentTotal) {
            elements.paymentTotal.textContent = money(summary.allTime);
        }

        const rows = Array.from(elements.paymentRows);

        if (rows[0]) {
            const value = rows[0].querySelector("strong");
            if (value) value.textContent = money(summary.allTime);
        }

        // Tips, bonuses and adjustments are not provided by this API.
        // Do not invent values for them.
        [1, 2, 3].forEach(index => {
            if (!rows[index]) return;

            const value = rows[index].querySelector("strong");
            if (value) value.textContent = "—";
        });

        const balanceLabel = document.querySelector(".payment-total span");

        if (balanceLabel) {
            balanceLabel.textContent = "Total Delivery Earnings";
        }

        if (elements.withdrawButton) {
            elements.withdrawButton.disabled = true;
            elements.withdrawButton.textContent = "Withdrawals Not Available";
            elements.withdrawButton.title =
                "A payout endpoint must be implemented before withdrawals can be requested.";
        }
    }

    // =====================================================
    // CHART
    // =====================================================

    function getChartDays() {
        const now = new Date();
        const days = [];

        if (state.period === "This Week") {
            const monday = new Date(
                now.getFullYear(),
                now.getMonth(),
                now.getDate()
            );

            const weekday = monday.getDay();
            monday.setDate(
                monday.getDate() + (weekday === 0 ? -6 : 1 - weekday)
            );

            for (let index = 0; index < 7; index += 1) {
                const date = new Date(monday);
                date.setDate(monday.getDate() + index);
                days.push(dateKey(date));
            }

            return days;
        }

        let start;
        let end;

        if (state.period === "This Month") {
            start = new Date(now.getFullYear(), now.getMonth(), 1);
            end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        } else if (state.period === "Last Month") {
            start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
            end = new Date(now.getFullYear(), now.getMonth(), 0);
        } else {
            start = new Date(now.getFullYear(), now.getMonth() - 2, 1);
            end = now;
        }

        const totalDays = Math.floor(
            (
                new Date(end.getFullYear(), end.getMonth(), end.getDate()) -
                new Date(start.getFullYear(), start.getMonth(), start.getDate())
            ) / 86400000
        ) + 1;

        const step = totalDays > 31 ? 7 : 1;

        for (let offset = 0; offset < totalDays; offset += step) {
            const date = new Date(start);
            date.setDate(start.getDate() + offset);
            days.push(dateKey(date));
        }

        const finalKey = dateKey(end);

        if (days[days.length - 1] !== finalKey) {
            days.push(finalKey);
        }

        return days;
    }

    function getChartValues() {
        const chart = state.earnings?.chart || [];

        const byDate = new Map(
            chart.map(entry => [
                String(entry.date).slice(0, 10),
                Number(entry.earnings) || 0
            ])
        );

        const days = getChartDays();

        const values = days.map(key => {
            if (byDate.has(key)) return byDate.get(key);

            if (
                state.period === "Last 3 Months" &&
                days.length <= 15
            ) {
                const start = localDateFromKey(key);
                const next = new Date(start);
                next.setDate(next.getDate() + 7);

                let total = 0;

                byDate.forEach((amount, entryKey) => {
                    const date = localDateFromKey(entryKey);

                    if (date >= start && date < next) {
                        total += amount;
                    }
                });

                return total;
            }

            return 0;
        });

        return { days, values };
    }

    function renderChart() {
        if (!elements.chartBars || !state.earnings) return;

        const { days, values } = getChartValues();
        const max = Math.max(...values, 1);

        elements.chartBars.innerHTML = days.map((key, index) => {
            const amount = values[index];
            const height = amount > 0
                ? Math.max(3, (amount / max) * 100)
                : 0;

            return `
                <div class="bar-column"
                     title="${escapeHTML(formatDayLabel(key, state.period))}: ${escapeHTML(money(amount))}">
                    <div class="bar" style="height: ${height}%;"></div>
                    <span>${escapeHTML(formatDayLabel(key, state.period))}</span>
                </div>
            `;
        }).join("");

        if (elements.chartDescription) {
            elements.chartDescription.textContent =
                `Completed delivery earnings for ${state.period.toLowerCase()}.`;
        }

        const yAxis = document.querySelectorAll(".chart-y-axis span");

        if (yAxis.length) {
            const top = Math.ceil(max / 500) * 500 || 500;

            yAxis.forEach((label, index) => {
                const value = top * (
                    1 - index / Math.max(yAxis.length - 1, 1)
                );

                label.textContent =
                    Math.round(value).toLocaleString("en-KE");
            });
        }
    }

    // =====================================================
    // WEEKLY BREAKDOWN — REAL DATA ONLY
    // =====================================================

    function renderWeeklyBreakdown() {
        const panel = elements.weeklyBreakdown;
        const chart = state.earnings?.chart;

        if (!panel || !Array.isArray(chart)) return;

        const heading = Array.from(panel.querySelectorAll("h1, h2, h3, h4"))
            .find(element =>
                element.textContent.trim().toLowerCase() === "weekly breakdown"
            );

        if (!heading) return;

        let list = panel.querySelector(".weekly-breakdown-data");

        if (!list) {
            list = document.createElement("div");
            list.className = "weekly-breakdown-data";

            // Remove the existing hardcoded rows, retaining the section heading.
            const existingRows = Array.from(panel.children).filter(child =>
                child !== heading.parentElement &&
                !child.contains(heading)
            );

            existingRows.forEach(child => {
                if (!child.querySelector("h1, h2, h3, h4")) {
                    child.remove();
                }
            });

            heading.insertAdjacentElement("afterend", list);
        }

        const daily = new Map();

        chart.forEach(entry => {
            const key = String(entry.date || "").slice(0, 10);
            if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return;

            daily.set(key, {
                earnings: Number(entry.earnings) || 0,
                deliveries: Number(entry.deliveries) || 0
            });
        });

        const today = new Date();
        const monday = new Date(
            today.getFullYear(),
            today.getMonth(),
            today.getDate()
        );

        const weekday = monday.getDay();
        monday.setDate(
            monday.getDate() + (weekday === 0 ? -6 : 1 - weekday)
        );

        const week = [];

        for (let index = 0; index < 7; index += 1) {
            const date = new Date(monday);
            date.setDate(monday.getDate() + index);

            const key = dateKey(date);
            const record = daily.get(key) || {
                earnings: 0,
                deliveries: 0
            };

            week.push({
                key,
                label: date.toLocaleDateString("en-KE", {
                    weekday: "long"
                }),
                earnings: record.earnings,
                deliveries: record.deliveries
            });
        }

        const maximum = Math.max(
            ...week.map(day => day.earnings),
            1
        );

        list.innerHTML = week.map(day => {
            const width = day.earnings > 0
                ? Math.max(1, (day.earnings / maximum) * 100)
                : 0;

            return `
                <div class="weekly-breakdown-row"
                     style="display:grid;grid-template-columns:minmax(100px,150px) minmax(80px,1fr) auto;align-items:center;gap:16px;padding:14px 0;border-bottom:1px solid #eee;">
                    <div>
                        <div>${escapeHTML(day.label)}</div>
                        <small style="color:#999;">
                            ${day.deliveries} ${day.deliveries === 1 ? "delivery" : "deliveries"}
                        </small>
                    </div>
                    <div style="height:7px;background:#eee;border-radius:10px;overflow:hidden;">
                        <div style="height:100%;width:${width}%;background:#ff6935;border-radius:10px;"></div>
                    </div>
                    <strong style="white-space:nowrap;">${escapeHTML(money(day.earnings))}</strong>
                </div>
            `;
        }).join("");
    }

    function renderEmptyWeeklyBreakdown(message) {
        const panel = elements.weeklyBreakdown;
        if (!panel) return;

        let list = panel.querySelector(".weekly-breakdown-data");

        if (!list) {
            list = document.createElement("div");
            list.className = "weekly-breakdown-data";
            panel.appendChild(list);
        }

        list.textContent = message;
    }

    // =====================================================
    // EARNINGS HISTORY
    // =====================================================

    function renderHistory() {
        if (!elements.transactionTable || !state.earnings) return;

        const history = state.earnings.history || [];

        const header = elements.transactionTable.querySelector(".table-header");

        elements.transactionTable.innerHTML = "";

        if (header) {
            elements.transactionTable.appendChild(header);
        }

        if (!history.length) {
            renderEmptyHistory(
                `No completed deliveries found for ${state.period.toLowerCase()}.`
            );
            return;
        }

        history.forEach(order => {
            const row = document.createElement("div");
            row.className = "table-row";

            row.innerHTML = `
                <span class="order-number">
                    ${escapeHTML(order.order_number || `#${order.id}`)}
                </span>
                <span>${escapeHTML(order.restaurant_name || "Restaurant")}</span>
                <span>${escapeHTML(formatDate(order.delivered_at))}</span>
                <span>—</span>
                <strong>${escapeHTML(money(order.delivery_fee))}</strong>
                <span class="status completed">Completed</span>
            `;

            elements.transactionTable.appendChild(row);
        });
    }

    function renderEmptyHistory(message) {
        if (!elements.transactionTable) return;

        const header = elements.transactionTable.querySelector(".table-header");

        elements.transactionTable.innerHTML = "";

        if (header) {
            elements.transactionTable.appendChild(header);
        }

        const empty = document.createElement("div");
        empty.className = "table-row";

        empty.innerHTML = `
            <span style="grid-column:1/-1;padding:20px;">
                ${escapeHTML(message)}
            </span>
        `;

        elements.transactionTable.appendChild(empty);
    }

    // =====================================================
    // CSV EXPORT
    // =====================================================

    function downloadReport() {
        const history = state.earnings?.history || [];

        if (!history.length) {
            showMessage("There are no earnings records to download.", "error");
            return;
        }

        const csvEscape = value =>
            `"${String(value ?? "").replace(/"/g, '""')}"`;

        const rows = [
            [
                "Order",
                "Restaurant",
                "Delivered At",
                "Delivery Fee (KSh)",
                "Status"
            ],
            ...history.map(order => [
                order.order_number || order.id,
                order.restaurant_name || "Restaurant",
                formatDate(order.delivered_at),
                Number(order.delivery_fee) || 0,
                "Completed"
            ])
        ];

        const csv = rows
            .map(row => row.map(csvEscape).join(","))
            .join("\r\n");

        const blob = new Blob(["\uFEFF", csv], {
            type: "text/csv;charset=utf-8;"
        });

        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");

        link.href = url;
        link.download = "fooddelivery-rider-earnings.csv";

        document.body.appendChild(link);
        link.click();
        link.remove();

        URL.revokeObjectURL(url);

        showMessage("Earnings report downloaded.", "success");
    }

    // =====================================================
    // EVENTS
    // =====================================================

    if (elements.menuButton && elements.sidebar) {
        elements.menuButton.addEventListener("click", () => {
            elements.sidebar.classList.toggle("open");
        });
    }

    if (elements.sidebar) {
        elements.sidebar.querySelectorAll(".rider-nav-link")
            .forEach(link => {
                link.addEventListener("click", () => {
                    elements.sidebar.classList.remove("open");
                });
            });
    }

    if (elements.periodSelect) {
        elements.periodSelect.addEventListener("change", async () => {
            state.period = elements.periodSelect.value || "This Week";
            await loadEarnings();
        });
    }

    if (elements.downloadButton) {
        elements.downloadButton.addEventListener("click", downloadReport);
    }

    if (elements.withdrawButton) {
        elements.withdrawButton.addEventListener("click", () => {
            showMessage(
                "Withdrawals are not connected yet. No payout request was submitted.",
                "info"
            );
        });
    }

    if (elements.notificationButton) {
        elements.notificationButton.addEventListener("click", () => {
            showMessage("You have no new earnings notifications.", "info");
        });
    }

    // =====================================================
    // INITIALIZE
    // =====================================================

    async function initialize() {
        if (elements.periodSelect) {
            state.period = elements.periodSelect.value || "This Week";
        }

        await loadRiderProfile();
        await loadEarnings();
    }

    initialize();
});
