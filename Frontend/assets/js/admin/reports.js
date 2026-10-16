/* =========================================================
   ADMIN REPORTS PAGE — reports.js
   Handles: report filters (period/type/date range), the
   revenue chart's period selector, and the Apply Filters /
   Generate Report / Export Report actions on reports.html
   (Sidebar open/close is assumed to already be handled by
   the shared ../../assets/js/main.js file.)
========================================================= */

document.addEventListener("DOMContentLoaded", () => {
    /* ---------------------------------------------------
       ELEMENT REFERENCES
    --------------------------------------------------- */
    const reportPeriodSelect = document.getElementById("reportPeriod");
    const reportTypeSelect = document.getElementById("reportType");
    const startDateInput = document.getElementById("startDate");
    const endDateInput = document.getElementById("endDate");
    const applyFiltersButton = document.querySelector(".admin-report-filter-button .admin-primary-button");

    const exportButton = document.querySelector(".admin-page-actions .admin-secondary-button");
    const generateButton = document.querySelector(".admin-page-actions .admin-primary-button");

    const chartPeriodSelect = document.querySelector(".admin-reports-revenue-card .admin-period-select");
    const chartBars = document.querySelectorAll(".admin-report-bars .admin-report-bar");
    const chartDayLabels = document.querySelectorAll(".admin-report-bars .admin-report-bar-column span");
    const yAxisLabels = document.querySelectorAll(".admin-report-y-axis span");

    const messageBox = document.getElementById("adminMessage");

    /* ---------------------------------------------------
       MESSAGE HELPER
    --------------------------------------------------- */
    let messageTimeout;

    function showMessage(text, type = "success") {
        if (!messageBox) return;

        messageBox.textContent = text;
        messageBox.className = `admin-message ${type} visible`;

        clearTimeout(messageTimeout);
        messageTimeout = setTimeout(() => {
            messageBox.classList.remove("visible");
        }, 3000);
    }

    /* ---------------------------------------------------
       DATE HELPERS
    --------------------------------------------------- */
    function toInputDate(date) {
        return date.toISOString().split("T")[0];
    }

    function startOfMonth(date) {
        return new Date(date.getFullYear(), date.getMonth(), 1);
    }

    function endOfMonth(date) {
        return new Date(date.getFullYear(), date.getMonth() + 1, 0);
    }

    /* Recalculate start/end date inputs from the chosen period preset */
    function applyPeriodPreset(periodLabel) {
        if (!startDateInput || !endDateInput) return;

        const today = new Date();
        let start = new Date(today);
        let end = new Date(today);

        switch (periodLabel) {
            case "Today":
                break;
            case "Yesterday":
                start.setDate(today.getDate() - 1);
                end.setDate(today.getDate() - 1);
                break;
            case "Last 7 Days":
                start.setDate(today.getDate() - 6);
                break;
            case "Last 30 Days":
                start.setDate(today.getDate() - 29);
                break;
            case "This Month":
                start = startOfMonth(today);
                end = endOfMonth(today);
                break;
            case "Last Month": {
                const lastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
                start = startOfMonth(lastMonth);
                end = endOfMonth(lastMonth);
                break;
            }
            case "This Year":
                start = new Date(today.getFullYear(), 0, 1);
                end = new Date(today.getFullYear(), 11, 31);
                break;
            default:
                return;
        }

        startDateInput.value = toInputDate(start);
        endDateInput.value = toInputDate(end);
    }

    /* ---------------------------------------------------
       REPORT PERIOD SELECT
    --------------------------------------------------- */
    if (reportPeriodSelect) {
        reportPeriodSelect.addEventListener("change", () => {
            applyPeriodPreset(reportPeriodSelect.value);
        });
    }

    /* ---------------------------------------------------
       MANUAL DATE EDITS
       If someone edits the dates by hand, treat the period
       select as a free custom range rather than fighting them.
    --------------------------------------------------- */
    [startDateInput, endDateInput].forEach((input) => {
        if (!input) return;
        input.addEventListener("change", () => {
            if (startDateInput.value && endDateInput.value && startDateInput.value > endDateInput.value) {
                showMessage("Start date can't be after the end date.", "danger");
            }
        });
    });

    /* ---------------------------------------------------
       APPLY FILTERS
    --------------------------------------------------- */
    if (applyFiltersButton) {
        applyFiltersButton.addEventListener("click", () => {
            if (startDateInput && endDateInput && startDateInput.value > endDateInput.value) {
                showMessage("Please fix the date range before applying filters.", "danger");
                return;
            }

            const type = reportTypeSelect ? reportTypeSelect.value : "Overview";
            const period = reportPeriodSelect ? reportPeriodSelect.value : "";

            showMessage(`Filters applied: ${type} · ${period}.`, "success");
            randomizeChart();
        });
    }

    /* ---------------------------------------------------
       PAGE ACTIONS: EXPORT / GENERATE
    --------------------------------------------------- */
    if (exportButton) {
        exportButton.addEventListener("click", () => {
            showMessage("Exporting report…", "success");
        });
    }

    if (generateButton) {
        generateButton.addEventListener("click", () => {
            const originalText = generateButton.textContent;
            generateButton.disabled = true;
            generateButton.textContent = "Generating…";

            setTimeout(() => {
                generateButton.disabled = false;
                generateButton.textContent = originalText;
                showMessage("Report generated successfully.", "success");
            }, 900);
        });
    }

    /* ---------------------------------------------------
       REVENUE CHART — PERIOD SELECT
       Swaps the day labels and y-axis scale, and redraws
       bars with representative mock data for that range.
    --------------------------------------------------- */
    const CHART_PRESETS = {
        "Last 7 Days": {
            labels: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
            maxLabel: "KSh 500K"
        },
        "Last 30 Days": {
            labels: ["W1", "W2", "W3", "W4"],
            maxLabel: "KSh 1.8M"
        },
        "This Month": {
            labels: ["Wk 1", "Wk 2", "Wk 3", "Wk 4"],
            maxLabel: "KSh 2.4M"
        }
    };

    function randomizeChart() {
        chartBars.forEach((bar) => {
            const height = 35 + Math.round(Math.random() * 60); // 35%–95%
            bar.style.height = `${height}%`;
        });
    }

    function renderChartForPeriod(periodLabel) {
        const preset = CHART_PRESETS[periodLabel] || CHART_PRESETS["Last 7 Days"];
        const barColumns = document.querySelectorAll(".admin-report-bars .admin-report-bar-column");

        // Rebuild bar columns to match the number of labels for this period
        const barsContainer = document.querySelector(".admin-report-bars");
        if (barsContainer) {
            barsContainer.innerHTML = "";
            preset.labels.forEach((label) => {
                const column = document.createElement("div");
                column.className = "admin-report-bar-column";

                const bar = document.createElement("div");
                bar.className = "admin-report-bar";
                bar.style.height = `${35 + Math.round(Math.random() * 60)}%`;

                const span = document.createElement("span");
                span.textContent = label;

                column.appendChild(bar);
                column.appendChild(span);
                barsContainer.appendChild(column);
            });
        }

        // Update y-axis top label to roughly match the period's scale
        if (yAxisLabels.length) {
            yAxisLabels[0].textContent = preset.maxLabel;
        }
    }

    if (chartPeriodSelect) {
        chartPeriodSelect.addEventListener("change", () => {
            renderChartForPeriod(chartPeriodSelect.value);
            showMessage(`Revenue chart updated to ${chartPeriodSelect.value}.`, "info");
        });
    }
});