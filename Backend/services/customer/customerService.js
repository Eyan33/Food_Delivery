const bcrypt = require("bcrypt");
const pool = require("../../config/database");

const {
    normalizeEmail,
    isValidEmail,
    isValidPassword,
    isValidName,
    isValidPhone
} = require("../../utils/auth/validators");

const CUSTOMER_COLUMNS = `
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

function validateCustomerId(id) {
    const customerId = String(id ?? "").trim();

    if (!/^[1-9][0-9]*$/.test(customerId)) {
        throw apiError("Customer ID must be a positive integer");
    }

    return customerId;
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

const CUSTOMER_STATUS_FILTERS = ["all", "active", "inactive", "new"];

/*
 * Customer listing includes order metrics used by the admin table.
 * "New" means registered in the current calendar month (database time).
 */
async function getCustomers(options = {}) {
    const search = String(options.search ?? "").trim();
    const status = String(options.status ?? "all").trim().toLowerCase();

    if (!CUSTOMER_STATUS_FILTERS.includes(status)) {
        throw apiError("Invalid status. Use all, active, inactive or new");
    }

    const limit = Math.min(100, Math.max(1, Number.parseInt(options.limit, 10) || 10));
    const requestedPage = Math.max(1, Number.parseInt(options.page, 10) || 1);
    const values = [];
    const conditions = [];

    if (search) {
        // Escape SQL LIKE wildcards so searches containing % or _ are literal.
        values.push(`%${search.replace(/[\\%_]/g, "\\$&")}%`);
        const p = `$${values.length}`;
        conditions.push(`(
            u.first_name ILIKE ${p} ESCAPE '\\'
            OR u.last_name ILIKE ${p} ESCAPE '\\'
            OR CONCAT(u.first_name, ' ', u.last_name) ILIKE ${p} ESCAPE '\\'
            OR u.email ILIKE ${p} ESCAPE '\\'
            OR COALESCE(u.phone, '') ILIKE ${p} ESCAPE '\\'
        )`);
    }
    if (status === "active") conditions.push("u.is_active = TRUE");
    if (status === "inactive") conditions.push("u.is_active = FALSE");
    if (status === "new") {
        conditions.push("u.created_at >= date_trunc('month', CURRENT_TIMESTAMP)");
        conditions.push("u.created_at < date_trunc('month', CURRENT_TIMESTAMP) + INTERVAL '1 month'");
    }
    const filter = conditions.length ? conditions.join(" AND ") : "TRUE";

    const statsResult = await pool.query(
        `SELECT
            COUNT(*)::int AS total,
            COUNT(*) FILTER (WHERE u.is_active = TRUE)::int AS active,
            COUNT(*) FILTER (WHERE u.is_active = FALSE)::int AS inactive,
            COUNT(*) FILTER (WHERE u.created_at >= date_trunc('month', CURRENT_TIMESTAMP)
                AND u.created_at < date_trunc('month', CURRENT_TIMESTAMP) + INTERVAL '1 month')::int AS new,
            COUNT(*) FILTER (WHERE ${filter})::int AS filtered
         FROM users u
         WHERE u.role = 'customer'`,
        values
    );

    const stats = statsResult.rows[0] || {};
    const totalItems = Number(stats.filtered || 0);
    const totalPages = Math.max(1, Math.ceil(totalItems / limit));
    const page = Math.min(requestedPage, totalPages);
    const offset = (page - 1) * limit;

    const dataResult = await pool.query(
        `SELECT
            u.id, u.first_name, u.last_name, u.email, u.phone, u.role,
            u.is_active, u.created_at, u.updated_at,
            COALESCE(order_stats.order_count, 0)::int AS order_count,
            COALESCE(order_stats.total_spent, 0)::numeric(12,2) AS total_spent,
            order_stats.last_order_at
         FROM users u
         LEFT JOIN LATERAL (
            SELECT
                COUNT(*) FILTER (WHERE o.status <> 'cancelled')::int AS order_count,
                COALESCE(SUM(o.total_amount) FILTER (WHERE o.status <> 'cancelled'), 0)::numeric(12,2) AS total_spent,
                MAX(COALESCE(o.delivered_at, o.placed_at)) FILTER (WHERE o.status <> 'cancelled') AS last_order_at
            FROM orders o
            WHERE o.customer_id = u.id
         ) order_stats ON TRUE
         WHERE u.role = 'customer' AND ${filter}
         ORDER BY u.created_at DESC, u.id DESC
         LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
        [...values, limit, offset]
    );

    const [activityResult, spendingResult] = await Promise.all([
        pool.query(`SELECT
            COUNT(DISTINCT o.customer_id) FILTER (
                WHERE o.placed_at >= CURRENT_DATE
                  AND o.placed_at < CURRENT_DATE + INTERVAL '1 day'
                  AND o.status <> 'cancelled'
            )::int AS active_today,
            COUNT(DISTINCT o.customer_id) FILTER (WHERE o.status <> 'cancelled')::int AS customers_with_orders
          FROM orders o
          JOIN users u ON u.id = o.customer_id AND u.role = 'customer'`),
        pool.query(`WITH revenue AS (
            SELECT
                COALESCE(SUM(total_amount) FILTER (WHERE status = 'delivered'
                    AND placed_at >= date_trunc('month', CURRENT_TIMESTAMP)
                    AND placed_at < date_trunc('month', CURRENT_TIMESTAMP) + INTERVAL '1 month'), 0)::numeric(12,2) AS monthly_revenue,
                COALESCE(SUM(total_amount) FILTER (WHERE status = 'delivered'), 0)::numeric(12,2) AS delivered_revenue,
                COUNT(*) FILTER (WHERE status = 'delivered')::int AS delivered_orders,
                COALESCE(SUM(total_amount) FILTER (WHERE status = 'delivered'
                    AND placed_at >= date_trunc('month', CURRENT_TIMESTAMP) - INTERVAL '1 month'
                    AND placed_at < date_trunc('month', CURRENT_TIMESTAMP)), 0)::numeric(12,2) AS previous_month_revenue
            FROM orders
         ) SELECT monthly_revenue,
            CASE WHEN delivered_orders > 0 THEN delivered_revenue / delivered_orders ELSE 0 END::numeric(12,2) AS average_order_value,
            CASE WHEN previous_month_revenue > 0 THEN LEAST(100, monthly_revenue / previous_month_revenue * 100)
                 WHEN monthly_revenue > 0 THEN 100 ELSE 0 END::numeric(5,2) AS progress
         FROM revenue`)
    ]);

    const activity = activityResult.rows[0] || {};
    const spending = spendingResult.rows[0] || {};

    return {
        customers: dataResult.rows,
        pagination: { page, limit, totalItems, totalPages },
        statistics: {
            total: Number(stats.total || 0),
            active: Number(stats.active || 0),
            inactive: Number(stats.inactive || 0),
            new: Number(stats.new || 0)
        },
        activity: {
            activeToday: Number(activity.active_today || 0),
            customersWithOrders: Number(activity.customers_with_orders || 0),
            newRegistrations: Number(stats.new || 0),
            inactiveCustomers: Number(stats.inactive || 0)
        },
        spending: {
            averageOrderValue: Number(spending.average_order_value || 0),
            monthlyRevenue: Number(spending.monthly_revenue || 0),
            progress: Number(spending.progress || 0)
        }
    };
}

async function getCustomerById(id) {
    const customerId = validateCustomerId(id);

    const result = await pool.query(
        `
        SELECT ${CUSTOMER_COLUMNS}
        FROM users
        WHERE id = $1
          AND role = 'customer'
        LIMIT 1
        `,
        [customerId]
    );

    return result.rows[0] || null;
}

async function createCustomer(input) {
    const data = requireObject(input);

    checkAllowedFields(data, [
        "first_name",
        "last_name",
        "email",
        "phone",
        "password",
        "role"
    ]);

    if (data.role !== undefined && data.role !== "customer") {
        throw apiError("This endpoint can only create customer accounts");
    }

    const firstName = validateName(data.first_name, "First name");
    const lastName = validateName(data.last_name, "Last name");
    const email = validateEmail(data.email);
    const phone = validatePhone(data.phone);
    const password = validatePassword(data.password);
    const passwordHash = await bcrypt.hash(password, 12);

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
        VALUES ($1, $2, $3, $4, $5, 'customer', true)
        RETURNING ${CUSTOMER_COLUMNS}
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

async function updateCustomer(id, input) {
    const customerId = validateCustomerId(id);
    const data = requireObject(input);

    checkAllowedFields(data, [
        "first_name",
        "last_name",
        "email",
        "phone",
        "password",
        "is_active"
    ]);

    const assignments = [];
    const values = [];

    function addAssignment(column, value) {
        values.push(value);
        assignments.push(`${column} = $${values.length}`);
    }

    if (hasField(data, "first_name")) {
        addAssignment(
            "first_name",
            validateName(data.first_name, "First name")
        );
    }

    if (hasField(data, "last_name")) {
        addAssignment(
            "last_name",
            validateName(data.last_name, "Last name")
        );
    }

    if (hasField(data, "email")) {
        addAssignment("email", validateEmail(data.email));
    }

    if (hasField(data, "phone")) {
        addAssignment("phone", validatePhone(data.phone));
    }

    if (hasField(data, "password")) {
        const password = validatePassword(data.password);
        const passwordHash = await bcrypt.hash(password, 12);
        addAssignment("password_hash", passwordHash);
    }

    if (hasField(data, "is_active")) {
        if (typeof data.is_active !== "boolean") {
            throw apiError("is_active must be true or false");
        }

        addAssignment("is_active", data.is_active);
    }

    if (assignments.length === 0) {
        throw apiError("Provide at least one customer field to update");
    }

    values.push(customerId);

    const result = await pool.query(
        `
        UPDATE users
        SET ${assignments.join(", ")}
        WHERE id = $${values.length}
          AND role = 'customer'
        RETURNING ${CUSTOMER_COLUMNS}
        `,
        values
    );

    return result.rows[0] || null;
}

async function deactivateCustomer(id) {
    const customerId = validateCustomerId(id);

    const result = await pool.query(
        `
        UPDATE users
        SET is_active = false
        WHERE id = $1
          AND role = 'customer'
        RETURNING ${CUSTOMER_COLUMNS}
        `,
        [customerId]
    );

    return result.rows[0] || null;
}

async function activateCustomer(id) {
    const customerId = validateCustomerId(id);

    const result = await pool.query(
        `
        UPDATE users
        SET is_active = true
        WHERE id = $1
          AND role = 'customer'
        RETURNING ${CUSTOMER_COLUMNS}
        `,
        [customerId]
    );

    return result.rows[0] || null;
}

module.exports = {
    getCustomers,
    getCustomerById,
    createCustomer,
    updateCustomer,
    deactivateCustomer,
    activateCustomer
};
