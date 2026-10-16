/*
|--------------------------------------------------------------------------
| ADMIN DASHBOARD
|--------------------------------------------------------------------------
*/

(() => {
    "use strict";

    const API = window.FoodDeliveryAuthApi;

    if (!API) {
        console.error(
            "FoodDeliveryAuthApi is not available. " +
            "Make sure auth-api.js loads before dashboard.js."
        );

        return;
    }

    const REFRESH_INTERVAL = 30000;

    let currentPeriod = "7d";
    let refreshTimer = null;
    let loading = false;

    /* =========================================================
       FORMATTERS
    ========================================================= */

    const numberFormatter =
        new Intl.NumberFormat("en-KE", {
            maximumFractionDigits: 0
        });

    const decimalFormatter =
        new Intl.NumberFormat("en-KE", {
            maximumFractionDigits: 2
        });

    function formatNumber(value) {
        const number = Number(value);

        if (!Number.isFinite(number)) {
            return "0";
        }

        return numberFormatter.format(number);
    }

    function formatMoney(value) {
        const number = Number(value);

        if (!Number.isFinite(number)) {
            return "KSh 0";
        }

        return `KSh ${decimalFormatter.format(number)}`;
    }

    function escapeHtml(value = "") {
        return String(value)
            .replaceAll("&", "&amp;")
            .replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;")
            .replaceAll('"', "&quot;")
            .replaceAll("'", "&#039;");
    }

    function initials(name = "") {
        const text = String(name).trim();

        if (!text) {
            return "A";
        }

        return text
            .split(/\s+/)
            .slice(0, 2)
            .map(
                (part) =>
                    part.charAt(0)
            )
            .join("")
            .toUpperCase();
    }

    function setText(
        selector,
        value,
        root = document
    ) {
        const element =
            root.querySelector(selector);

        if (element) {
            element.textContent = value;
        }
    }

    function setMessage(
        message,
        type = "error"
    ) {
        const element =
            document.getElementById(
                "adminMessage"
            );

        if (!element) {
            return;
        }

        element.textContent = message;

        element.className =
            `admin-message show ${type}`;
    }

    /* =========================================================
       API
    ========================================================= */

    const dashboardApi = {
        async getDashboard(
            period = "7d"
        ) {
            return API.request(
                `/admins/dashboard?period=${encodeURIComponent(
                    period
                )}`,
                {
                    method: "GET",
                    authenticated: true
                }
            );
        }
    };

    /* =========================================================
       PROFILE
    ========================================================= */

    function renderProfile(admin = {}) {
        const name =
            admin.name ||
            `${admin.first_name || ""} ${
                admin.last_name || ""
            }`.trim() ||
            "Admin User";

        const role =
            admin.role ||
            "Administrator";

        document
            .querySelectorAll(
                ".admin-profile-info strong, " +
                ".admin-topbar-profile-info strong"
            )
            .forEach((element) => {
                element.textContent = name;
            });

        document
            .querySelectorAll(
                ".admin-profile-info span, " +
                ".admin-topbar-profile-info span"
            )
            .forEach((element) => {
                element.textContent = role;
            });

        document
            .querySelectorAll(
                ".admin-profile-avatar, " +
                ".admin-topbar-avatar"
            )
            .forEach((element) => {
                element.textContent =
                    initials(name);
            });
    }

    /* =========================================================
       STAT CARDS
    ========================================================= */

    function renderStats(stats = {}) {
        const cards =
            document.querySelectorAll(
                ".admin-stat-card"
            );

        const items = [
            {
                card: cards[0],
                value:
                    stats.totalOrders?.value ??
                    0,
                change:
                    stats.totalOrders?.change,
                description:
                    stats.totalOrders?.description,
                formatter: formatNumber
            },

            {
                card: cards[1],
                value:
                    stats.totalRevenue?.value ??
                    0,
                change:
                    stats.totalRevenue?.change,
                description:
                    stats.totalRevenue?.description,
                formatter: formatMoney
            },

            {
                card: cards[2],
                value:
                    stats.customers?.value ??
                    0,
                change:
                    stats.customers?.change,
                description:
                    stats.customers?.description,
                formatter: formatNumber
            },

            {
                card: cards[3],
                value:
                    stats.restaurants?.value ??
                    0,
                change:
                    stats.restaurants?.change,
                description:
                    stats.restaurants?.description,
                formatter: formatNumber
            }
        ];

        items.forEach((item) => {
            if (!item.card) {
                return;
            }

            const valueElement =
                item.card.querySelector(
                    ".admin-stat-content > strong"
                );

            if (valueElement) {
                valueElement.textContent =
                    item.formatter(
                        item.value
                    );
            }

            const changeElement =
                item.card.querySelector(
                    ".admin-stat-content small b"
                );

            if (
                changeElement &&
                item.change !== undefined
            ) {
                changeElement.textContent =
                    item.change;
            }

            const descriptionElement =
                item.card.querySelector(
                    ".admin-stat-content small"
                );

            if (
                descriptionElement &&
                item.description
            ) {
                const change =
                    descriptionElement.querySelector(
                        "b"
                    );

                descriptionElement.innerHTML =
                    change
                        ? `${change.outerHTML} ${escapeHtml(
                              item.description
                          )}`
                        : escapeHtml(
                              item.description
                          );
            }
        });
    }

    /* =========================================================
       CHART HELPERS
    ========================================================= */

    function getNiceStep(
        maxValue,
        divisions = 4
    ) {
        const safeMax =
            Math.max(
                Number(maxValue) || 0,
                0
            );

        if (safeMax <= 0) {
            return 1;
        }

        const rawStep =
            safeMax / divisions;

        const magnitude =
            Math.pow(
                10,
                Math.floor(
                    Math.log10(rawStep)
                )
            );

        const normalized =
            rawStep / magnitude;

        let niceNormalized;

        if (normalized <= 1) {
            niceNormalized = 1;
        } else if (normalized <= 2) {
            niceNormalized = 2;
        } else if (normalized <= 5) {
            niceNormalized = 5;
        } else {
            niceNormalized = 10;
        }

        return (
            niceNormalized *
            magnitude
        );
    }

    function formatAxisValue(value) {
        const number = Number(value);

        if (!Number.isFinite(number)) {
            return "0";
        }

        const absolute =
            Math.abs(number);

        if (absolute >= 1000000) {
            return `${decimalFormatter.format(
                number / 1000000
            )}M`;
        }

        if (absolute >= 1000) {
            return `${decimalFormatter.format(
                number / 1000
            )}K`;
        }

        return decimalFormatter.format(
            number
        );
    }

    /* =========================================================
       REVENUE CHART
    ========================================================= */

    function renderRevenue(
        revenue = {}
    ) {
        const barsContainer =
            document.querySelector(
                ".admin-chart-bars"
            );

        const yAxis =
            document.querySelector(
                ".admin-chart-y-axis"
            );

        const grid =
            document.querySelector(
                ".admin-chart-grid"
            );

        if (!barsContainer) {
            return;
        }

        const values =
            Array.isArray(
                revenue.values
            )
                ? revenue.values.map(
                      (value) => {
                          const number =
                              Number(
                                  value
                              );

                          if (
                              !Number.isFinite(
                                  number
                              )
                          ) {
                              return 0;
                          }

                          return Math.max(
                              number,
                              0
                          );
                      }
                  )
                : [];

        const labels =
            Array.isArray(
                revenue.labels
            )
                ? revenue.labels
                : [];

        if (values.length === 0) {
            barsContainer.innerHTML = `
                <div
                    style="
                        width:100%;
                        height:100%;
                        display:flex;
                        align-items:center;
                        justify-content:center;
                        color:#999;
                        font-size:12px;
                    "
                >
                    No revenue data available
                </div>
            `;

            if (yAxis) {
                yAxis.innerHTML = `
                    <span>1</span>
                    <span>0.75</span>
                    <span>0.5</span>
                    <span>0.25</span>
                    <span>0</span>
                `;
            }

            if (grid) {
                grid.innerHTML = `
                    <div class="admin-chart-grid-line"></div>
                    <div class="admin-chart-grid-line"></div>
                    <div class="admin-chart-grid-line"></div>
                    <div class="admin-chart-grid-line"></div>
                    <div class="admin-chart-grid-line"></div>
                `;
            }

            return;
        }

        const maximumValue =
            Math.max(...values, 0);

        const step =
            getNiceStep(
                maximumValue,
                4
            );

        const chartMaximum =
            maximumValue <= 0
                ? 1
                : Math.max(
                      step * 4,
                      Math.ceil(
                          maximumValue /
                              step
                      ) * step
                  );

        barsContainer.innerHTML =
            values
                .map(
                    (
                        value,
                        index
                    ) => {
                        const percentage =
                            chartMaximum >
                            0
                                ? Math.min(
                                      100,
                                      (
                                          value /
                                          chartMaximum
                                      ) * 100
                                  )
                                : 0;

                        const label =
                            labels[index] ||
                            `Period ${
                                index + 1
                            }`;

                        return `
                            <div
                                class="admin-bar-column"
                                title="${escapeHtml(
                                    `${label}: ${formatMoney(
                                        value
                                    )}`
                                )}"
                            >
                                <div
                                    class="admin-bar"
                                    style="
                                        height:${percentage}%;
                                        min-height:${
                                            value >
                                            0
                                                ? "4px"
                                                : "0"
                                        };
                                    "
                                ></div>

                                <span>
                                    ${escapeHtml(
                                        label
                                    )}
                                </span>
                            </div>
                        `;
                    }
                )
                .join("");

        if (yAxis) {
            const ticks = [
                chartMaximum,
                chartMaximum * 0.75,
                chartMaximum * 0.5,
                chartMaximum * 0.25,
                0
            ];

            yAxis.innerHTML =
                ticks
                    .map(
                        (tick) =>
                            `<span>${formatAxisValue(
                                tick
                            )}</span>`
                    )
                    .join("");
        }

        if (grid) {
            grid.innerHTML = `
                <div class="admin-chart-grid-line"></div>
                <div class="admin-chart-grid-line"></div>
                <div class="admin-chart-grid-line"></div>
                <div class="admin-chart-grid-line"></div>
                <div class="admin-chart-grid-line"></div>
            `;
        }
    }

    /* =========================================================
       ORDER STATUS
    ========================================================= */

    function renderOrderStatus(
        statuses = []
    ) {
        const card =
            document.querySelector(
                ".admin-order-status"
            );

        if (!card) {
            return;
        }

        const safeStatuses =
            Array.isArray(statuses)
                ? statuses
                : [];

        const total =
            safeStatuses.reduce(
                (sum, item) => {
                    const count =
                        Number(
                            item.count
                        );

                    return (
                        sum +
                        (
                            Number.isFinite(
                                count
                            )
                                ? count
                                : 0
                        )
                    );
                },
                0
            );

        setText(
            ".admin-status-total strong",
            formatNumber(total),
            card
        );

        const list =
            card.querySelector(
                ".admin-status-list"
            );

        if (!list) {
            return;
        }

        list.innerHTML =
            safeStatuses
                .map(
                    (status) => {
                        const count =
                            Number(
                                status.count
                            );

                        return `
                            <div class="admin-status-item">
                                <div class="admin-status-label">
                                    <span
                                        class="admin-status-dot ${escapeHtml(
                                            status.key ||
                                            ""
                                        )}"
                                    ></span>

                                    <span>
                                        ${escapeHtml(
                                            status.label ||
                                            ""
                                        )}
                                    </span>
                                </div>

                                <strong>
                                    ${formatNumber(
                                        Number.isFinite(
                                            count
                                        )
                                            ? count
                                            : 0
                                    )}
                                </strong>
                            </div>
                        `;
                    }
                )
                .join("");
    }

    /* =========================================================
       RECENT ORDERS
    ========================================================= */

    function renderRecentOrders(
        orders = []
    ) {
        const body =
            document.querySelector(
                ".admin-table tbody"
            );

        if (!body) {
            return;
        }

        if (
            !Array.isArray(orders) ||
            orders.length === 0
        ) {
            body.innerHTML = `
                <tr>
                    <td
                        colspan="5"
                        style="
                            text-align:center;
                            padding:25px;
                            color:#999;
                        "
                    >
                        No orders found.
                    </td>
                </tr>
            `;

            return;
        }

        body.innerHTML =
            orders
                .map(
                    (order) => {
                        const amount =
                            Number(
                                order.amount
                            );

                        return `
                            <tr>
                                <td>
                                    #${escapeHtml(
                                        order.number ||
                                        ""
                                    )}
                                </td>

                                <td>
                                    ${escapeHtml(
                                        order.customer ||
                                        ""
                                    )}
                                </td>

                                <td>
                                    ${escapeHtml(
                                        order.restaurant ||
                                        ""
                                    )}
                                </td>

                                <td>
                                    ${formatMoney(
                                        Number.isFinite(
                                            amount
                                        )
                                            ? amount
                                            : 0
                                    )}
                                </td>

                                <td>
                                    <span
                                        class="admin-status ${escapeHtml(
                                            order.status ||
                                            ""
                                        )}"
                                    >
                                        ${escapeHtml(
                                            order.statusLabel ||
                                            ""
                                        )}
                                    </span>
                                </td>
                            </tr>
                        `;
                    }
                )
                .join("");
    }

    /* =========================================================
       PLATFORM SUMMARY
    ========================================================= */

    function renderSummary(
        summary = {}
    ) {
        const items =
            document.querySelectorAll(
                ".admin-summary-item"
            );

        const values = [
            formatNumber(
                summary.activeRiders
            ),

            formatNumber(
                summary.onlineRiders
            ),

            formatNumber(
                summary.activeRestaurants
            ),

            formatNumber(
                summary.pendingApprovals
            ),

            formatNumber(
                summary.openSupportTickets
            ),

            formatMoney(
                summary.todaysRevenue
            )
        ];

        items.forEach(
            (item, index) => {
                const strong =
                    item.querySelector(
                        "strong"
                    );

                if (
                    strong &&
                    values[index] !==
                        undefined
                ) {
                    strong.textContent =
                        values[index];
                }
            }
        );
    }

    /* =========================================================
       BADGES
    ========================================================= */

    function renderCounts(
        data = {}
    ) {
        setText(
            ".admin-notification-badge",
            formatNumber(
                data.notificationCount
            )
        );

        setText(
            ".admin-nav-badge",
            formatNumber(
                data.pendingOrderCount
            )
        );
    }

    /* =========================================================
       PERIOD
    ========================================================= */

    function periodFromSelect(
        select
    ) {
        const mapping = {
            "Last 7 Days": "7d",
            "Last 30 Days": "30d",
            "Last 3 Months": "3m"
        };

        return (
            mapping[
                select?.value
            ] || "7d"
        );
    }

    /* =========================================================
       LOAD DASHBOARD
    ========================================================= */

    async function loadDashboard(
        period = currentPeriod
    ) {
        if (loading) {
            return;
        }

        loading = true;
        currentPeriod = period;

        try {
            const data =
                await dashboardApi
                    .getDashboard(
                        currentPeriod
                    );

            renderProfile(
                data.admin || {}
            );

            renderStats(
                data.stats || {}
            );

            renderRevenue(
                data.revenue || {}
            );

            renderOrderStatus(
                data.orderStatus || []
            );

            renderRecentOrders(
                data.recentOrders || []
            );

            renderSummary(
                data.summary || {}
            );

            renderCounts(data);

            const message =
                document.getElementById(
                    "adminMessage"
                );

            if (message) {
                message.textContent = "";
                message.className =
                    "admin-message";
            }
        } catch (error) {
            console.error(
                "Dashboard could not be loaded:",
                error
            );

            setMessage(
                error.message ||
                    "Could not load dashboard data.",
                "error"
            );
        } finally {
            loading = false;
        }
    }

    /* =========================================================
       AUTO REFRESH
    ========================================================= */

    function startAutoRefresh() {
        if (refreshTimer) {
            clearInterval(
                refreshTimer
            );
        }

        refreshTimer =
            setInterval(() => {
                if (
                    !document.hidden
                ) {
                    loadDashboard(
                        currentPeriod
                    );
                }
            }, REFRESH_INTERVAL);
    }

    /* =========================================================
       INITIALISATION
    ========================================================= */

    document.addEventListener(
        "DOMContentLoaded",
        () => {
            const periodSelect =
                document.querySelector(
                    ".admin-period-select"
                );

            currentPeriod =
                periodFromSelect(
                    periodSelect
                );

            if (periodSelect) {
                periodSelect.addEventListener(
                    "change",
                    () => {
                        currentPeriod =
                            periodFromSelect(
                                periodSelect
                            );

                        loadDashboard(
                            currentPeriod
                        );
                    }
                );
            }

            loadDashboard(
                currentPeriod
            );

            startAutoRefresh();
        }
    );

    document.addEventListener(
        "visibilitychange",
        () => {
            if (!document.hidden) {
                loadDashboard(
                    currentPeriod
                );
            }
        }
    );

    /* =========================================================
       GLOBAL TESTING / MANUAL REFRESH
    ========================================================= */

    window.dashboardApi =
        dashboardApi;

    window.loadDashboard =
        loadDashboard;
})();