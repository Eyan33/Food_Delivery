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

const CUSTOMER_STATUS_FILTERS = ["all", "active", "inactive"];

/*
 * List customers with search, status filter and pagination.
 *
 * options.search : matches first name, last name, full name, email or phone
 * options.status : all | active | inactive   (default: all)
 * options.page   : default 1
 * options.limit  : default 10, maximum 100
 */
async function getCustomers(options = {}) {
    const search = String(options.search ?? "").trim();
    const status = String(options.status ?? "all").trim().toLowerCase();

    if (!CUSTOMER_STATUS_FILTERS.includes(status)) {
        throw apiError("Invalid status. Use all, active or inactive");
    }

    const limit = Math.min(
        100,
        Math.max(1, Number.parseInt(options.limit, 10) || 10)
    );
    const page = Math.max(1, Number.parseInt(options.page, 10) || 1);
    const offset = (page - 1) * limit;

    const values = [];
    const conditions = [];

    if (search) {
        // Escape LIKE wildcards so "50%" or "a_b" are searched literally.
        values.push(`%${search.replace(/[\\%_]/g, "\\$&")}%`);
        const placeholder = `$${values.length}`;

        conditions.push(`(
            first_name ILIKE ${placeholder} ESCAPE '\\'
            OR last_name ILIKE ${placeholder} ESCAPE '\\'
            OR CONCAT(first_name, ' ', last_name) ILIKE ${placeholder} ESCAPE '\\'
            OR email ILIKE ${placeholder} ESCAPE '\\'
            OR COALESCE(phone, '') ILIKE ${placeholder} ESCAPE '\\'
        )`);
    }

    if (status === "active") {
        conditions.push("is_active = TRUE");
    }

    if (status === "inactive") {
        conditions.push("is_active = FALSE");
    }

    const filter = conditions.length > 0
        ? conditions.join(" AND ")
        : "TRUE";

    /*
     * One query gives the overall counts (for stat cards)
     * and the number of rows matching the current filters.
     */
    const statsResult = await pool.query(
        `
        SELECT
            COUNT(*)::int AS total,
            COUNT(*) FILTER (WHERE is_active = TRUE)::int AS active,
            COUNT(*) FILTER (WHERE is_active = FALSE)::int AS inactive,
            COUNT(*) FILTER (WHERE ${filter})::int AS filtered
        FROM users
        WHERE role = 'customer'
        `,
        values
    );

    const dataResult = await pool.query(
        `
        SELECT ${CUSTOMER_COLUMNS}
        FROM users
        WHERE role = 'customer'
          AND ${filter}
        ORDER BY created_at DESC, id DESC
        LIMIT $${values.length + 1}
        OFFSET $${values.length + 2}
        `,
        [...values, limit, offset]
    );

    const stats = statsResult.rows[0];

    return {
        customers: dataResult.rows,
        pagination: {
            page,
            limit,
            totalItems: stats.filtered,
            totalPages: Math.max(1, Math.ceil(stats.filtered / limit))
        },
        statistics: {
            total: stats.total,
            active: stats.active,
            inactive: stats.inactive
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