document.addEventListener("DOMContentLoaded", () => {
    const API = window.FoodDeliveryAuthApi;
    const periodSelect = document.getElementById("reportPeriod");
    const typeSelect = document.getElementById("reportType");
    const startInput = document.getElementById("startDate");
    const endInput = document.getElementById("endDate");
    const applyButton = document.querySelector(".admin-report-filter-button .admin-primary-button");
    const exportButton = document.querySelector(".admin-page-actions .admin-secondary-button");
    const generateButton = document.querySelector(".admin-page-actions .admin-primary-button");
    const messageBox = document.getElementById("adminMessage");
    const money = (value) => `KSh ${Number(value || 0).toLocaleString("en-KE", { maximumFractionDigits: 2 })}`;

    if (!API?.request) return;

    function showMessage(text, type = "success") {
        if (!messageBox) return;
        messageBox.textContent = text;
        messageBox.className = `admin-message ${type} visible`;
    }

    function dateInput(date) {
        const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
        return local.toISOString().slice(0, 10);
    }

    function setPreset(value) {
        const today = new Date();
        const end = new Date(today);
        const start = new Date(today);
        let period = "30d";
        if (value === "Today") period = "7d";
        else if (value === "Yesterday") {
            start.setDate(start.getDate() - 1);
            end.setDate(end.getDate() - 1);
            period = "7d";
        } else if (value === "Last 7 Days") {
            start.setDate(start.getDate() - 6);
            period = "7d";
        } else if (value === "Last 30 Days") {
            start.setDate(start.getDate() - 29);
        } else if (value === "This Month") {
            start.setDate(1);
        } else if (value === "Last Month") {
            start.setDate(1);
            start.setMonth(start.getMonth() - 1);
            end.setDate(0);
        } else if (value === "This Year") {
            start.setMonth(0, 1);
            end.setMonth(11, 31);
        }
        startInput.value = dateInput(start);
        endInput.value = dateInput(end);
        return period;
    }

    function reportQuery() {
        if (!startInput.value || !endInput.value || startInput.value > endInput.value) {
            throw new Error("Choose a valid report date range.");
        }
        const params = new URLSearchParams({
            period: "30d",
            start_date: startInput.value,
            end_date: endInput.value,
        });
        return params;
    }

    function setText(selector, value) {
        const node = document.querySelector(selector);
        if (node) node.textContent = value;
    }

    function renderReport(data) {
        const selectedType = typeSelect.value;
        const typeKey = {
            "Overview": "overview",
            "Sales Report": "sales",
            "Orders Report": "orders",
            "Customer Report": "customers",
            "Restaurant Report": "restaurants",
            "Rider Report": "riders",
            "Payment Report": "payments",
        }[selectedType] || "overview";
        document.querySelectorAll("[data-report-section]").forEach((section) => {
            const visibleFor = section.dataset.reportSection.split(/\s+/);
            section.hidden = !visibleFor.includes(typeKey);
        });

        const statCards = document.querySelectorAll(".admin-stats-grid .admin-stat-card");
        const stats = [data.summary.revenue, data.summary.orders, data.summary.customers];
        stats.forEach((stat, index) => {
            const card = statCards[index];
            if (!card || !stat) return;
            card.querySelector(".admin-stat-content strong").textContent =
                index === 0 ? money(stat.value) : Number(stat.value).toLocaleString("en-KE");
            card.querySelector(".admin-stat-content small").textContent =
                `${stat.change || "0%"} ${stat.description || ""}`;
        });
        const average = data.summary.orders.value
            ? data.summary.revenue.value / data.summary.orders.value
            : 0;
        if (statCards[3]) statCards[3].querySelector(".admin-stat-content strong").textContent = money(average);

        const bars = document.querySelector(".admin-report-bars");
        const maxRevenue = Math.max(1, ...data.series.revenue);
        if (bars) {
            bars.replaceChildren(...data.series.labels.map((label, index) => {
                const column = document.createElement("div");
                column.className = "admin-report-bar-column";
                const bar = document.createElement("div");
                bar.className = "admin-report-bar";
                bar.style.height = `${Math.max(2, (data.series.revenue[index] / maxRevenue) * 100)}%`;
                bar.title = `${label}: ${money(data.series.revenue[index])}`;
                const text = document.createElement("span");
                text.textContent = label;
                column.append(bar, text);
                return column;
            }));
        }

        const statusList = document.querySelector(".admin-report-status-list");
        if (statusList) {
            statusList.replaceChildren(...data.orderStatusBreakdown.map((item) => {
                const row = document.createElement("div");
                row.className = "admin-report-status-item";
                const label = document.createElement("span");
                label.textContent = item.status.replaceAll("_", " ");
                const value = document.createElement("strong");
                value.textContent = Number(item.count).toLocaleString("en-KE");
                row.append(label, value);
                return row;
            }));
        }
        setText(".admin-report-total strong", Number(data.summary.orders.value).toLocaleString("en-KE"));

        const restaurants = document.querySelector(".admin-report-ranking-list");
        if (restaurants) {
            restaurants.replaceChildren(...data.topRestaurants.map((restaurant, index) => {
                const row = document.createElement("div");
                row.className = "admin-report-ranking-item";
                const position = document.createElement("span");
                position.className = "admin-ranking-number";
                position.textContent = String(index + 1);
                const details = document.createElement("div");
                details.className = "admin-ranking-info";
                const name = document.createElement("strong");
                name.textContent = restaurant.name;
                const orders = document.createElement("span");
                orders.textContent = `${restaurant.orderCount} orders`;
                details.append(name, orders);
                const revenue = document.createElement("strong");
                revenue.className = "admin-ranking-value";
                revenue.textContent = money(restaurant.revenue);
                row.append(position, details, revenue);
                return row;
            }));
        }

        const paymentItems = document.querySelectorAll(".admin-report-payment-item");
        const payments = data.paymentStatusBreakdown;
        paymentItems.forEach((item, index) => {
            const payment = payments[index];
            if (!payment) return;
            const spans = item.querySelectorAll("span");
            if (spans[0]) spans[0].textContent = payment.status;
            if (spans[1]) spans[1].textContent = `${payment.count} transactions`;
            const amount = item.querySelector(".admin-report-payment-footer strong");
            if (amount) amount.textContent = money(payment.amount);
        });

        setText("#reportRiderTotal", Number(data.riders?.total || 0).toLocaleString("en-KE"));
        setText("#reportRiderActive", Number(data.riders?.active || 0).toLocaleString("en-KE"));
        setText("#reportRiderDeliveries", Number(data.riders?.deliveries || 0).toLocaleString("en-KE"));
    }

    let currentReport = null;
    async function loadReport(button) {
        const oldText = button?.textContent;
        if (button) {
            button.disabled = true;
            button.textContent = "Loading…";
        }
        try {
            const query = reportQuery();
            currentReport = await API.request(`/admins/reports?${query}`, { authenticated: true });
            renderReport(currentReport);
            showMessage("Report updated from current platform data.");
        } catch (error) {
            showMessage(error.message || "Could not load report data.", "danger");
        } finally {
            if (button) {
                button.disabled = false;
                button.textContent = oldText;
            }
        }
    }

    periodSelect?.addEventListener("change", () => setPreset(periodSelect.value));
    typeSelect?.addEventListener("change", () => {
        if (currentReport) renderReport(currentReport);
    });
    document.querySelector(".admin-reports-revenue-card .admin-period-select")?.addEventListener("change", (event) => {
        const period = event.currentTarget.value;
        periodSelect.value = period;
        setPreset(period);
        loadReport();
    });
    applyButton?.addEventListener("click", () => loadReport(applyButton));
    generateButton?.addEventListener("click", () => loadReport(generateButton));
    exportButton?.addEventListener("click", async () => {
        if (!currentReport) await loadReport(exportButton);
        if (!currentReport) return;
        const rows = [
            ["Metric", "Value"],
            ["Revenue", currentReport.summary.revenue.value],
            ["Orders", currentReport.summary.orders.value],
            ["Customers", currentReport.summary.customers.value],
            ...currentReport.series.labels.map((label, index) => [`Revenue ${label}`, currentReport.series.revenue[index]]),
            ...currentReport.topRestaurants.map((item) => [`Restaurant ${item.name}`, item.revenue]),
        ];
        const csv = rows.map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(",")).join("\r\n");
        const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
        const link = document.createElement("a");
        link.href = url;
        link.download = `food-delivery-report-${startInput.value}-${endInput.value}.csv`;
        link.click();
        URL.revokeObjectURL(url);
    });

    const initialEnd = new Date();
    const initialStart = new Date(initialEnd);
    initialStart.setDate(initialStart.getDate() - 6);
    startInput.value = dateInput(initialStart);
    endInput.value = dateInput(initialEnd);
    loadReport();
});