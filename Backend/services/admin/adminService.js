const bcrypt = require("bcrypt");
const pool = require("../../config/database");

const {
    normalizeEmail,
    isValidEmail,
    isValidPassword,
    isValidName,
    isValidPhone
} = require("../../utils/auth/validators");

const ADMIN_COLUMNS = `
    id,
    first_name,
    last_name,
    email,
    phone,
    role,
    is_active,
    created_at,
    updated_at
`;

function apiError(message, statusCode = 400) {
    const error = new Error(message);
    error.statusCode = statusCode;
    return error;
}

function hasField(object, field) {
    return Object.prototype.hasOwnProperty.call(object, field);
}

function requireObject(data) {
    if (!data || typeof data !== "object" || Array.isArray(data)) {
        throw apiError("Request body must be a JSON object");
    }

    return data;
}

function checkAllowedFields(data, allowedFields) {
    for (const field of Object.keys(data)) {
        if (!allowedFields.includes(field)) {
            throw apiError(`Field "${field}" is not allowed`);
        }
    }
}

function validateAdminId(id) {
    const adminId = String(id ?? "").trim();

    if (!/^[1-9][0-9]*$/.test(adminId)) {
        throw apiError("Admin ID must be a positive integer");
    }

    return adminId;
}

function validateName(value, fieldName) {
    if (typeof value !== "string" || !isValidName(value.trim())) {
        throw apiError(
            `${fieldName} must contain at least 2 characters`
        );
    }

    return value.trim();
}

function validateEmail(value) {
    if (typeof value !== "string") {
        throw apiError("Please provide a valid email address");
    }

    const email = normalizeEmail(value);

    if (!isValidEmail(email)) {
        throw apiError("Please provide a valid email address");
    }

    return email;
}

function validatePhone(value) {
    if (value === undefined || value === null || value === "") {
        return null;
    }

    if (typeof value !== "string") {
        throw apiError("Please provide a valid phone number");
    }

    const phone = value.trim();

    if (!phone) {
        return null;
    }

    if (!isValidPhone(phone)) {
        throw apiError("Please provide a valid phone number");
    }

    return phone;
}

function validatePassword(value) {
    if (!isValidPassword(value)) {
        throw apiError("Password must contain at least 8 characters");
    }

    return value;
}

const ADMIN_STATUS_FILTERS = [
    "all",
    "active",
    "inactive"
];

/* =========================================================
   ADMIN LIST
========================================================= */

async function getAdmins(options = {}) {
    const search = String(options.search ?? "").trim();
    const status = String(options.status ?? "all")
        .trim()
        .toLowerCase();

    if (!ADMIN_STATUS_FILTERS.includes(status)) {
        throw apiError(
            "Invalid status. Use all, active or inactive"
        );
    }

    const limit = Math.min(
        100,
        Math.max(
            1,
            Number.parseInt(options.limit, 10) || 10
        )
    );

    const page = Math.max(
        1,
        Number.parseInt(options.page, 10) || 1
    );

    const offset = (page - 1) * limit;

    const values = [];
    const conditions = [];

    if (search) {
        values.push(
            `%${search.replace(/[\\%_]/g, "\\$&")}%`
        );

        const placeholder = `$${values.length}`;

        conditions.push(`
            (
                first_name ILIKE ${placeholder} ESCAPE '\\'
                OR last_name ILIKE ${placeholder} ESCAPE '\\'
                OR CONCAT(first_name, ' ', last_name)
                    ILIKE ${placeholder} ESCAPE '\\'
                OR email ILIKE ${placeholder} ESCAPE '\\'
                OR COALESCE(phone, '')
                    ILIKE ${placeholder} ESCAPE '\\'
            )
        `);
    }

    if (status === "active") {
        conditions.push("is_active = TRUE");
    }

    if (status === "inactive") {
        conditions.push("is_active = FALSE");
    }

    const filter =
        conditions.length > 0
            ? conditions.join(" AND ")
            : "TRUE";

    const statsResult = await pool.query(
        `
        SELECT
            COUNT(*)::int AS total,
            COUNT(*) FILTER (
                WHERE is_active = TRUE
            )::int AS active,
            COUNT(*) FILTER (
                WHERE is_active = FALSE
            )::int AS inactive,
            COUNT(*) FILTER (
                WHERE ${filter}
            )::int AS filtered
        FROM users
        WHERE role = 'admin'
        `,
        values
    );

    const dataResult = await pool.query(
        `
        SELECT ${ADMIN_COLUMNS}
        FROM users
        WHERE role = 'admin'
          AND ${filter}
        ORDER BY created_at DESC, id DESC
        LIMIT $${values.length + 1}
        OFFSET $${values.length + 2}
        `,
        [
            ...values,
            limit,
            offset
        ]
    );

    const stats = statsResult.rows[0];

    return {
        admins: dataResult.rows,

        pagination: {
            page,
            limit,
            totalItems: stats.filtered,
            totalPages: Math.max(
                1,
                Math.ceil(stats.filtered / limit)
            )
        },

        statistics: {
            total: stats.total,
            active: stats.active,
            inactive: stats.inactive
        }
    };
}

/* =========================================================
   ADMIN DETAIL
========================================================= */

async function getAdminById(id) {
    const adminId = validateAdminId(id);

    const result = await pool.query(
        `
        SELECT ${ADMIN_COLUMNS}
        FROM users
        WHERE id = $1
          AND role = 'admin'
        LIMIT 1
        `,
        [adminId]
    );

    return result.rows[0] || null;
}

/* =========================================================
   CREATE ADMIN
========================================================= */

async function createAdmin(input) {
    const data = requireObject(input);

    checkAllowedFields(data, [
        "first_name",
        "last_name",
        "email",
        "phone",
        "password",
        "role"
    ]);

    if (
        data.role !== undefined &&
        data.role !== "admin"
    ) {
        throw apiError(
            "This endpoint can only create admin accounts"
        );
    }

    const firstName = validateName(
        data.first_name,
        "First name"
    );

    const lastName = validateName(
        data.last_name,
        "Last name"
    );

    const email = validateEmail(data.email);
    const phone = validatePhone(data.phone);
    const password = validatePassword(data.password);

    const passwordHash = await bcrypt.hash(
        password,
        12
    );

    const result = await pool.query(
        `
        INSERT INTO users (
            first_name,
            last_name,
            email,
            phone,
            password_hash,
            role,
            is_active
        )
        VALUES (
            $1,
            $2,
            $3,
            $4,
            $5,
            'admin',
            true
        )
        RETURNING ${ADMIN_COLUMNS}
        `,
        [
            firstName,
            lastName,
            email,
            phone,
            passwordHash
        ]
    );

    return result.rows[0];
}

/* =========================================================
   UPDATE ADMIN
========================================================= */

async function updateAdmin(id, input) {
    const adminId = validateAdminId(id);
    const data = requireObject(input);

    checkAllowedFields(data, [
        "first_name",
        "last_name",
        "email",
        "phone",
        "password"
    ]);

    const assignments = [];
    const values = [];

    function addAssignment(column, value) {
        values.push(value);
        assignments.push(
            `${column} = $${values.length}`
        );
    }

    if (hasField(data, "first_name")) {
        addAssignment(
            "first_name",
            validateName(
                data.first_name,
                "First name"
            )
        );
    }

    if (hasField(data, "last_name")) {
        addAssignment(
            "last_name",
            validateName(
                data.last_name,
                "Last name"
            )
        );
    }

    if (hasField(data, "email")) {
        addAssignment(
            "email",
            validateEmail(data.email)
        );
    }

    if (hasField(data, "phone")) {
        addAssignment(
            "phone",
            validatePhone(data.phone)
        );
    }

    if (hasField(data, "password")) {
        const password = validatePassword(
            data.password
        );

        const passwordHash = await bcrypt.hash(
            password,
            12
        );

        addAssignment(
            "password_hash",
            passwordHash
        );
    }

    if (assignments.length === 0) {
        throw apiError(
            "Provide at least one admin field to update"
        );
    }

    values.push(adminId);

    const result = await pool.query(
        `
        UPDATE users
        SET ${assignments.join(", ")}
        WHERE id = $${values.length}
          AND role = 'admin'
        RETURNING ${ADMIN_COLUMNS}
        `,
        values
    );

    return result.rows[0] || null;
}

/* =========================================================
   DEACTIVATE ADMIN
========================================================= */

async function deactivateAdmin(
    id,
    requesterId
) {
    const adminId = validateAdminId(id);
    const actorId = validateAdminId(requesterId);

    const client = await pool.connect();

    try {
        await client.query("BEGIN");

        const activeAdmins =
            await client.query(
                `
                SELECT id
                FROM users
                WHERE role = 'admin'
                  AND is_active = true
                FOR UPDATE
                `
            );

        const targetResult =
            await client.query(
                `
                SELECT ${ADMIN_COLUMNS}
                FROM users
                WHERE id = $1
                  AND role = 'admin'
                FOR UPDATE
                `,
                [adminId]
            );

        const target =
            targetResult.rows[0];

        if (!target) {
            await client.query("COMMIT");
            return null;
        }

        if (!target.is_active) {
            await client.query("COMMIT");
            return target;
        }

        if (
            String(adminId) ===
            String(actorId)
        ) {
            throw apiError(
                "You cannot deactivate your own admin account"
            );
        }

        if (activeAdmins.rows.length <= 1) {
            throw apiError(
                "Cannot deactivate the last active admin account",
                409
            );
        }

        const result =
            await client.query(
                `
                UPDATE users
                SET is_active = false
                WHERE id = $1
                  AND role = 'admin'
                RETURNING ${ADMIN_COLUMNS}
                `,
                [adminId]
            );

        await client.query("COMMIT");

        return result.rows[0] || null;
    } catch (error) {
        await client.query("ROLLBACK");
        throw error;
    } finally {
        client.release();
    }
}

/* =========================================================
   ACTIVATE ADMIN
========================================================= */

async function activateAdmin(id) {
    const adminId = validateAdminId(id);

    const result = await pool.query(
        `
        UPDATE users
        SET is_active = true
        WHERE id = $1
          AND role = 'admin'
        RETURNING ${ADMIN_COLUMNS}
        `,
        [adminId]
    );

    return result.rows[0] || null;
}

/* =========================================================
   DASHBOARD CONFIG
========================================================= */

const DASHBOARD_TIME_ZONE =
    process.env.DASHBOARD_TIME_ZONE ||
    "Africa/Nairobi";

const DASHBOARD_PERIODS = {
    "7d": {
        days: 7,
        bucketDays: 1,
        labelFormat: "Dy"
    },

    "30d": {
        days: 30,
        bucketDays: 5,
        labelFormat: "DD Mon"
    },

    "3m": {
        days: 90,
        bucketDays: 15,
        labelFormat: "DD Mon"
    }
};

const DASHBOARD_STATUS_GROUPS = [
    {
        key: "pending",
        label: "Pending",
        statuses: ["pending"]
    },
    {
        key: "preparing",
        label: "Preparing",
        statuses: [
            "confirmed",
            "preparing",
            "ready"
        ]
    },
    {
        key: "delivery",
        label: "Out for Delivery",
        statuses: [
            "out_for_delivery"
        ]
    },
    {
        key: "completed",
        label: "Completed",
        statuses: [
            "delivered"
        ]
    },
    {
        key: "cancelled",
        label: "Cancelled",
        statuses: [
            "cancelled"
        ]
    }
];

function dashboardGroupForStatus(status) {
    return (
        DASHBOARD_STATUS_GROUPS.find(
            (group) =>
                group.statuses.includes(status)
        ) || {
            key: "pending",
            label: status
        }
    );
}

function isValidDashboardPeriod(period) {
    return Object.prototype.hasOwnProperty.call(
        DASHBOARD_PERIODS,
        period
    );
}

function dashboardPercentChange(
    current,
    previous
) {
    if (previous === 0) {
        return current === 0
            ? "0%"
            : "New";
    }

    const change =
        ((current - previous) /
            previous) *
        100;

    const sign =
        change > 0 ? "+" : "";

    return `${sign}${change.toFixed(1)}%`;
}

/* =========================================================
   DASHBOARD
========================================================= */

async function getDashboard(
    period,
    admin
) {
    if (!isValidDashboardPeriod(period)) {
        throw apiError(
            "Invalid period. Use 7d, 30d or 3m"
        );
    }

    const config =
        DASHBOARD_PERIODS[period];

    const client =
        await pool.connect();

    try {
        await client.query(
            "BEGIN READ ONLY"
        );

        await client.query(
            "SELECT set_config('TimeZone', $1, true)",
            [DASHBOARD_TIME_ZONE]
        );

        /*
         * Revenue definition:
         *
         * Dashboard revenue is based on order value,
         * not payment rows.
         *
         * Cancelled orders are excluded.
         *
         * This keeps:
         * - Total Revenue
         * - Revenue chart
         * - Today's Revenue
         *
         * mathematically consistent.
         */
        const totalsResult =
            await client.query(
                `
                WITH bounds AS (
                    SELECT
                        CURRENT_DATE -
                            ($1::int - 1)
                            AS cur_start,

                        CURRENT_DATE + 1
                            AS cur_end,

                        CURRENT_DATE -
                            (2 * $1::int - 1)
                            AS prev_start,

                        CURRENT_DATE -
                            ($1::int - 1)
                            AS prev_end
                )
                SELECT

                    (
                        SELECT COUNT(*)
                        FROM orders o, bounds b
                        WHERE o.placed_at >= b.cur_start
                          AND o.placed_at < b.cur_end
                    )::int AS orders_current,

                    (
                        SELECT COUNT(*)
                        FROM orders o, bounds b
                        WHERE o.placed_at >= b.prev_start
                          AND o.placed_at < b.prev_end
                    )::int AS orders_previous,

                    (
                        SELECT COALESCE(
                            SUM(o.total_amount),
                            0
                        )
                        FROM orders o, bounds b
                        WHERE o.status <> 'cancelled'
                          AND o.placed_at >= b.cur_start
                          AND o.placed_at < b.cur_end
                    ) AS revenue_current,

                    (
                        SELECT COALESCE(
                            SUM(o.total_amount),
                            0
                        )
                        FROM orders o, bounds b
                        WHERE o.status <> 'cancelled'
                          AND o.placed_at >= b.prev_start
                          AND o.placed_at < b.prev_end
                    ) AS revenue_previous,

                    (
                        SELECT COUNT(*)
                        FROM users
                        WHERE role = 'customer'
                    )::int AS customers_total,

                    (
                        SELECT COUNT(*)
                        FROM users u, bounds b
                        WHERE u.role = 'customer'
                          AND u.created_at >= b.cur_start
                          AND u.created_at < b.cur_end
                    )::int AS customers_new,

                    (
                        SELECT COUNT(*)
                        FROM restaurants
                    )::int AS restaurants_total,

                    (
                        SELECT COUNT(*)
                        FROM restaurants r, bounds b
                        WHERE r.created_at >= b.cur_start
                          AND r.created_at < b.cur_end
                    )::int AS restaurants_new
                `,
                [config.days]
            );

        /*
         * Revenue chart.
         *
         * It uses exactly the same revenue definition
         * as the KPI:
         *
         * SUM(orders.total_amount)
         * WHERE status <> 'cancelled'
         *
         * The sum of every returned bucket therefore
         * equals Total Revenue for the selected period.
         */
        const revenueResult =
            await client.query(
                `
                WITH cfg AS (
                    SELECT
                        CURRENT_DATE -
                            ($1::int - 1)
                            AS start_date,

                        CURRENT_DATE + 1
                            AS end_date
                ),

                buckets AS (
                    SELECT
                        g AS idx,

                        (
                            c.start_date +
                            g * $2::int
                        ) AS bucket_start
                    FROM cfg c,
                    generate_series(
                        0,
                        ($1::int / $2::int) - 1
                    ) AS g
                ),

                sums AS (
                    SELECT
                        (
                            (
                                o.placed_at::date -
                                c.start_date
                            ) / $2::int
                        ) AS idx,

                        SUM(o.total_amount)
                            AS total

                    FROM orders o, cfg c

                    WHERE o.status <> 'cancelled'
                      AND o.placed_at >= c.start_date
                      AND o.placed_at < c.end_date

                    GROUP BY 1
                )

                SELECT
                    to_char(
                        b.bucket_start::timestamp,
                        $3::text
                    ) AS label,

                    COALESCE(
                        s.total,
                        0
                    ) AS value

                FROM buckets b

                LEFT JOIN sums s
                    ON s.idx = b.idx

                ORDER BY b.idx
                `,
                [
                    config.days,
                    config.bucketDays,
                    config.labelFormat
                ]
            );

        /*
         * Order status breakdown.
         *
         * Cancelled orders remain visible here because
         * Total Orders counts all orders.
         */
        const statusResult =
            await client.query(
                `
                SELECT
                    status,
                    COUNT(*)::int AS count
                FROM orders
                WHERE placed_at >=
                    CURRENT_DATE -
                    ($1::int - 1)

                  AND placed_at <
                    CURRENT_DATE + 1

                GROUP BY status
                `,
                [config.days]
            );

        /*
         * Five most recent orders.
         */
        const recentResult =
            await client.query(
                `
                SELECT
                    o.order_number,
                    o.status,
                    o.total_amount,

                    TRIM(
                        CONCAT(
                            u.first_name,
                            ' ',
                            u.last_name
                        )
                    ) AS customer,

                    r.name AS restaurant

                FROM orders o

                LEFT JOIN users u
                    ON u.id = o.customer_id

                LEFT JOIN restaurants r
                    ON r.id = o.restaurant_id

                ORDER BY
                    o.placed_at DESC,
                    o.id DESC

                LIMIT 5
                `
            );

        /*
         * Platform summary.
         */
        const summaryResult =
            await client.query(
                `
                SELECT

                    (
                        SELECT COUNT(*)
                        FROM users
                        WHERE role = 'rider'
                          AND is_active = TRUE
                    )::int AS active_riders,

                    (
                        SELECT COUNT(
                            DISTINCT o.rider_id
                        )
                        FROM orders o
                        WHERE o.rider_id IS NOT NULL
                          AND o.status IN (
                              'out_for_delivery',
                              'ready',
                              'preparing',
                              'confirmed'
                          )
                    )::int AS online_riders,

                    (
                        SELECT COUNT(*)
                        FROM restaurants
                        WHERE is_active = TRUE
                    )::int AS active_restaurants,

                    (
                        SELECT COUNT(*)
                        FROM restaurants
                        WHERE approval_status = 'pending'
                    )::int AS pending_approvals,

                    /*
                     * Same revenue definition as the
                     * dashboard KPI, limited to today.
                     */
                    (
                        SELECT COALESCE(
                            SUM(o.total_amount),
                            0
                        )
                        FROM orders o
                        WHERE o.status <> 'cancelled'
                          AND o.placed_at >= CURRENT_DATE
                          AND o.placed_at <
                              CURRENT_DATE + 1
                    ) AS todays_revenue,

                    (
                        SELECT COUNT(*)
                        FROM orders
                        WHERE status = 'pending'
                    )::int AS pending_orders
                `
            );

        await client.query("COMMIT");

        const totals =
            totalsResult.rows[0];

        const summary =
            summaryResult.rows[0];

        const ordersCurrent =
            Number(totals.orders_current);

        const ordersPrevious =
            Number(totals.orders_previous);

        const revenueCurrent =
            Number(totals.revenue_current);

        const revenuePrevious =
            Number(totals.revenue_previous);

        const countsByStatus =
            Object.fromEntries(
                statusResult.rows.map(
                    (row) => [
                        row.status,
                        Number(row.count)
                    ]
                )
            );

        return {
            admin: {
                name:
                    `${admin.first_name} ${admin.last_name}`
                        .trim(),

                role: "Administrator"
            },

            stats: {
                totalOrders: {
                    value: ordersCurrent,

                    change:
                        dashboardPercentChange(
                            ordersCurrent,
                            ordersPrevious
                        ),

                    description:
                        "vs previous period"
                },

                totalRevenue: {
                    value: revenueCurrent,

                    change:
                        dashboardPercentChange(
                            revenueCurrent,
                            revenuePrevious
                        ),

                    description:
                        "vs previous period"
                },

                customers: {
                    value:
                        Number(
                            totals.customers_total
                        ),

                    change:
                        `+${Number(
                            totals.customers_new
                        )}`,

                    description:
                        "new this period"
                },

                restaurants: {
                    value:
                        Number(
                            totals.restaurants_total
                        ),

                    change:
                        `+${Number(
                            totals.restaurants_new
                        )}`,

                    description:
                        "new this period"
                }
            },

            revenue: {
                labels:
                    revenueResult.rows.map(
                        (row) => row.label
                    ),

                values:
                    revenueResult.rows.map(
                        (row) =>
                            Number(row.value)
                    )
            },

            orderStatus:
                DASHBOARD_STATUS_GROUPS.map(
                    (group) => ({
                        key: group.key,
                        label: group.label,

                        count:
                            group.statuses.reduce(
                                (
                                    sum,
                                    status
                                ) =>
                                    sum +
                                    (
                                        countsByStatus[
                                            status
                                        ] || 0
                                    ),
                                0
                            )
                    })
                ),

            recentOrders:
                recentResult.rows.map(
                    (row) => {
                        const group =
                            dashboardGroupForStatus(
                                row.status
                            );

                        return {
                            number:
                                row.order_number,

                            customer:
                                row.customer ||
                                "Unknown customer",

                            restaurant:
                                row.restaurant ||
                                "Unknown restaurant",

                            amount:
                                Number(
                                    row.total_amount
                                ),

                            status:
                                group.key,

                            statusLabel:
                                group.label
                        };
                    }
                ),

            summary: {
                activeRiders:
                    Number(
                        summary.active_riders
                    ),

                onlineRiders:
                    Number(
                        summary.online_riders
                    ),

                activeRestaurants:
                    Number(
                        summary.active_restaurants
                    ),

                pendingApprovals:
                    Number(
                        summary.pending_approvals
                    ),

                /*
                 * There is no support-ticket table
                 * in the current schema.
                 */
                openSupportTickets: 0,

                todaysRevenue:
                    Number(
                        summary.todays_revenue
                    )
            },

            notificationCount:
                Number(
                    summary.pending_orders
                ),

            pendingOrderCount:
                Number(
                    summary.pending_orders
                )
        };
    } catch (error) {
        await client
            .query("ROLLBACK")
            .catch(() => {});

        throw error;
    } finally {
        client.release();
    }
}

/* =========================================================
   REPORTS
========================================================= */

async function getReports(
    period = "30d"
) {
    const periodConfig = {
        "7d": {
            days: 7,
            bucket: "day"
        },

        "30d": {
            days: 30,
            bucket: "day"
        },

        "3m": {
            days: 90,
            bucket: "week"
        },

        "12m": {
            days: 365,
            bucket: "month"
        }
    };

    const cfg =
        periodConfig[period] ||
        periodConfig["30d"];

    const client =
        await pool.connect();

    try {
        await client.query("BEGIN");

        const boundsResult =
            await client.query(
                `
                SELECT
                    CURRENT_DATE -
                        ($1::int - 1)
                        AS cur_start,

                    CURRENT_DATE + 1
                        AS cur_end,

                    CURRENT_DATE -
                        (2 * $1::int - 1)
                        AS prev_start,

                    CURRENT_DATE -
                        ($1::int - 1)
                        AS prev_end
                `,
                [cfg.days]
            );

        const b =
            boundsResult.rows[0];

        const totalsResult =
            await client.query(
                `
                SELECT

                    (
                        SELECT COUNT(*)
                        FROM orders
                        WHERE placed_at >= $1
                          AND placed_at < $2
                    )::int AS orders_current,

                    (
                        SELECT COUNT(*)
                        FROM orders
                        WHERE placed_at >= $3
                          AND placed_at < $4
                    )::int AS orders_previous,

                    (
                        SELECT COALESCE(
                            SUM(amount),
                            0
                        )
                        FROM payments
                        WHERE payment_status =
                            'completed'
                          AND paid_at >= $1
                          AND paid_at < $2
                    )::numeric AS revenue_current,

                    (
                        SELECT COALESCE(
                            SUM(amount),
                            0
                        )
                        FROM payments
                        WHERE payment_status =
                            'completed'
                          AND paid_at >= $3
                          AND paid_at < $4
                    )::numeric AS revenue_previous,

                    (
                        SELECT COUNT(*)
                        FROM users
                        WHERE role = 'customer'
                          AND created_at >= $1
                          AND created_at < $2
                    )::int AS customers_new,

                    (
                        SELECT COUNT(*)
                        FROM users
                        WHERE role = 'customer'
                    )::int AS customers_total,

                    (
                        SELECT COUNT(*)
                        FROM restaurants
                        WHERE created_at >= $1
                          AND created_at < $2
                    )::int AS restaurants_new,

                    (
                        SELECT COUNT(*)
                        FROM restaurants
                    )::int AS restaurants_total,

                    (
                        SELECT COUNT(*)
                        FROM orders
                        WHERE status = 'delivered'
                          AND placed_at >= $1
                          AND placed_at < $2
                    )::int AS delivered_current,

                    (
                        SELECT COUNT(*)
                        FROM orders
                        WHERE status = 'cancelled'
                          AND placed_at >= $1
                          AND placed_at < $2
                    )::int AS cancelled_current
                `,
                [
                    b.cur_start,
                    b.cur_end,
                    b.prev_start,
                    b.prev_end
                ]
            );

        const t =
            totalsResult.rows[0];

        let seriesQuery;

        if (cfg.bucket === "day") {
            seriesQuery = `
                WITH days AS (
                    SELECT generate_series(
                        $1::date,
                        ($2::date - 1),
                        '1 day'::interval
                    )::date AS day
                )

                SELECT
                    to_char(
                        d.day,
                        'Mon DD'
                    ) AS label,

                    COALESCE(
                        (
                            SELECT SUM(p.amount)
                            FROM payments p
                            WHERE p.payment_status =
                                'completed'
                              AND p.paid_at::date =
                                  d.day
                        ),
                        0
                    )::numeric AS revenue,

                    COALESCE(
                        (
                            SELECT COUNT(*)
                            FROM orders o
                            WHERE o.placed_at::date =
                                d.day
                        ),
                        0
                    )::int AS orders

                FROM days d
                ORDER BY d.day
            `;
        } else if (cfg.bucket === "week") {
            seriesQuery = `
                WITH weeks AS (
                    SELECT generate_series(
                        date_trunc(
                            'week',
                            $1::timestamp
                        ),
                        date_trunc(
                            'week',
                            (
                                $2::timestamp -
                                interval '1 day'
                            )
                        ),
                        '1 week'::interval
                    )::date AS week_start
                )

                SELECT
                    to_char(
                        w.week_start,
                        'Mon DD'
                    ) AS label,

                    COALESCE(
                        (
                            SELECT SUM(p.amount)
                            FROM payments p
                            WHERE p.payment_status =
                                'completed'
                              AND p.paid_at >=
                                  w.week_start
                              AND p.paid_at <
                                  w.week_start +
                                  interval '7 days'
                        ),
                        0
                    )::numeric AS revenue,

                    COALESCE(
                        (
                            SELECT COUNT(*)
                            FROM orders o
                            WHERE o.placed_at >=
                                  w.week_start
                              AND o.placed_at <
                                  w.week_start +
                                  interval '7 days'
                        ),
                        0
                    )::int AS orders

                FROM weeks w
                ORDER BY w.week_start
            `;
        } else {
            seriesQuery = `
                WITH months AS (
                    SELECT generate_series(
                        date_trunc(
                            'month',
                            $1::timestamp
                        ),
                        date_trunc(
                            'month',
                            (
                                $2::timestamp -
                                interval '1 day'
                            )
                        ),
                        '1 month'::interval
                    )::date AS month_start
                )

                SELECT
                    to_char(
                        m.month_start,
                        'Mon YYYY'
                    ) AS label,

                    COALESCE(
                        (
                            SELECT SUM(p.amount)
                            FROM payments p
                            WHERE p.payment_status =
                                'completed'
                              AND p.paid_at >=
                                  m.month_start
                              AND p.paid_at <
                                  m.month_start +
                                  interval '1 month'
                        ),
                        0
                    )::numeric AS revenue,

                    COALESCE(
                        (
                            SELECT COUNT(*)
                            FROM orders o
                            WHERE o.placed_at >=
                                  m.month_start
                              AND o.placed_at <
                                  m.month_start +
                                  interval '1 month'
                        ),
                        0
                    )::int AS orders

                FROM months m
                ORDER BY m.month_start
            `;
        }

        const seriesResult =
            await client.query(
                seriesQuery,
                [
                    b.cur_start,
                    b.cur_end
                ]
            );

        const topRestaurantsResult =
            await client.query(
                `
                SELECT
                    r.id,
                    r.name,
                    COUNT(o.id)::int
                        AS order_count,

                    COALESCE(
                        SUM(o.total_amount)
                        FILTER (
                            WHERE o.status =
                                'delivered'
                        ),
                        0
                    )::numeric AS revenue

                FROM restaurants r

                LEFT JOIN orders o
                    ON o.restaurant_id =
                        r.id

                   AND o.placed_at >= $1
                   AND o.placed_at < $2

                GROUP BY
                    r.id,
                    r.name

                ORDER BY
                    revenue DESC,
                    order_count DESC

                LIMIT 10
                `,
                [
                    b.cur_start,
                    b.cur_end
                ]
            );

        const statusBreakdownResult =
            await client.query(
                `
                SELECT
                    status,
                    COUNT(*)::int AS count
                FROM orders
                WHERE placed_at >= $1
                  AND placed_at < $2
                GROUP BY status
                ORDER BY count DESC
                `,
                [
                    b.cur_start,
                    b.cur_end
                ]
            );

        const paymentBreakdownResult =
            await client.query(
                `
                SELECT
                    payment_status AS status,
                    COUNT(*)::int AS count,

                    COALESCE(
                        SUM(amount),
                        0
                    )::numeric AS amount

                FROM payments
                WHERE created_at >= $1
                  AND created_at < $2

                GROUP BY payment_status
                ORDER BY amount DESC
                `,
                [
                    b.cur_start,
                    b.cur_end
                ]
            );

        await client.query("COMMIT");

        function percentChange(
            current,
            previous
        ) {
            const cur =
                Number(current) || 0;

            const prev =
                Number(previous) || 0;

            if (prev === 0) {
                return cur > 0
                    ? "+100%"
                    : "0%";
            }

            const change =
                ((cur - prev) /
                    prev) *
                100;

            const sign =
                change >= 0
                    ? "+"
                    : "";

            return `${sign}${change.toFixed(1)}%`;
        }

        const ordersCurrent =
            Number(t.orders_current);

        const revenueCurrent =
            Number(t.revenue_current);

        return {
            period,

            range: {
                start: b.cur_start,
                end: b.cur_end
            },

            summary: {
                orders: {
                    value: ordersCurrent,

                    change:
                        percentChange(
                            ordersCurrent,
                            t.orders_previous
                        ),

                    description:
                        "vs previous period"
                },

                revenue: {
                    value: revenueCurrent,

                    change:
                        percentChange(
                            revenueCurrent,
                            t.revenue_previous
                        ),

                    description:
                        "vs previous period"
                },

                customers: {
                    value:
                        Number(
                            t.customers_total
                        ),

                    change:
                        `+${Number(
                            t.customers_new
                        )}`,

                    description:
                        "new this period"
                },

                restaurants: {
                    value:
                        Number(
                            t.restaurants_total
                        ),

                    change:
                        `+${Number(
                            t.restaurants_new
                        )}`,

                    description:
                        "new this period"
                },

                delivered: {
                    value:
                        Number(
                            t.delivered_current
                        ),

                    description:
                        "completed deliveries"
                },

                cancelled: {
                    value:
                        Number(
                            t.cancelled_current
                        ),

                    description:
                        "cancelled orders"
                }
            },

            series: {
                labels:
                    seriesResult.rows.map(
                        (row) =>
                            row.label
                    ),

                revenue:
                    seriesResult.rows.map(
                        (row) =>
                            Number(
                                row.revenue
                            )
                    ),

                orders:
                    seriesResult.rows.map(
                        (row) =>
                            Number(
                                row.orders
                            )
                    )
            },

            topRestaurants:
                topRestaurantsResult.rows.map(
                    (row) => ({
                        id: row.id,
                        name: row.name,

                        orderCount:
                            Number(
                                row.order_count
                            ),

                        revenue:
                            Number(
                                row.revenue
                            )
                    })
                ),

            orderStatusBreakdown:
                statusBreakdownResult.rows.map(
                    (row) => ({
                        status:
                            row.status,

                        count:
                            Number(
                                row.count
                            )
                    })
                ),

            paymentStatusBreakdown:
                paymentBreakdownResult.rows.map(
                    (row) => ({
                        status:
                            row.status,

                        count:
                            Number(
                                row.count
                            ),

                        amount:
                            Number(
                                row.amount
                            )
                    })
                )
        };
    } catch (error) {
        await client
            .query("ROLLBACK")
            .catch(() => {});

        throw error;
    } finally {
        client.release();
    }
}

module.exports = {
    getAdmins,
    getAdminById,
    createAdmin,
    updateAdmin,
    deactivateAdmin,
    activateAdmin,
    getDashboard,
    getReports
};