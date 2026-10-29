const crypto = require("crypto");
const bcrypt = require("bcrypt");
const pool = require("../../config/database");

const {
    normalizeEmail,
    isValidEmail,
    isValidPassword,
    isValidName,
    isValidPhone
} = require("../../utils/auth/validators");

/*
|--------------------------------------------------------------------------
| Constants
|--------------------------------------------------------------------------
*/

const RESTAURANT_STATUS_FILTERS = ["all", "active", "inactive"];
const RESTAURANT_OPEN_FILTERS = ["all", "open", "closed"];
const RESTAURANT_APPROVAL_FILTERS = [
    "all",
    "pending",
    "approved",
    "rejected"
];

/*
 * Orders in these statuses are still being handled.
 * A restaurant with such orders can't be deactivated or rejected
 * unless the admin passes force=true.
 */
const ACTIVE_ORDER_STATUSES = [
    "pending",
    "confirmed",
    "preparing",
    "ready",
    "out_for_delivery"
];

const ACTIVE_ORDER_SQL = ACTIVE_ORDER_STATUSES
    .map((status) => `'${status}'`)
    .join(", ");

/*
 * Fields an owner (or an admin) may send for a restaurant.
 */
const RESTAURANT_FIELDS = [
    "name",
    "description",
    "phone",
    "email",
    "latitude",
    "longitude",
    "logo_url",
    "cover_image_url",
    "delivery_fee",
    "minimum_order",
    "opening_time",
    "closing_time"
];

const RESTAURANT_SORTS = {
    newest: "r.created_at DESC, r.id DESC",
    oldest: "r.created_at ASC, r.id ASC",
    name: "r.name ASC, r.id ASC",
    orders: "total_orders DESC, r.id DESC",
    revenue: "revenue DESC, r.id DESC",
    rating: "average_rating DESC NULLS LAST, r.id DESC"
};

/*
 * Per-restaurant order, revenue and rating statistics.
 *
 * Restaurant revenue = completed payment value excluding the delivery fee.
 * Delivery charges are not restaurant food revenue.
 */
const RESTAURANT_STATS_JOIN = `
    LEFT JOIN (
        SELECT
            o.restaurant_id,
            COUNT(*)::int AS total_orders,
            COUNT(*) FILTER (
                WHERE o.status = 'delivered'
            )::int AS delivered_orders,
            COUNT(*) FILTER (
                WHERE o.status IN (${ACTIVE_ORDER_SQL})
            )::int AS active_orders
        FROM orders o
        GROUP BY o.restaurant_id
    ) os
        ON os.restaurant_id = r.id

    LEFT JOIN (
        SELECT
            o.restaurant_id,
            COALESCE(
                SUM(
                    GREATEST(
                        COALESCE(o.total_amount, p.amount) - COALESCE(o.delivery_fee, 0),
                        0
                    )
                ),
                0
            ) AS revenue
        FROM payments p
        JOIN orders o
            ON o.id = p.order_id
        WHERE p.payment_status = 'completed'
        GROUP BY o.restaurant_id
    ) rev
        ON rev.restaurant_id = r.id

    LEFT JOIN (
        SELECT
            rv.restaurant_id,
            ROUND(AVG(rv.rating)::numeric, 1) AS average_rating,
            COUNT(rv.rating)::int AS rating_count
        FROM reviews rv
        WHERE rv.rating IS NOT NULL
          AND rv.is_visible = TRUE
        GROUP BY rv.restaurant_id
    ) rs
        ON rs.restaurant_id = r.id
`;

const RESTAURANT_OWNER_COLUMNS = `
    u.first_name AS owner_first_name,
    u.last_name AS owner_last_name,
    u.email AS owner_email,
    u.phone AS owner_phone
`;

const RESTAURANT_STATS_COLUMNS = `
    COALESCE(os.total_orders, 0) AS total_orders,
    COALESCE(os.delivered_orders, 0) AS delivered_orders,
    COALESCE(os.active_orders, 0) AS active_orders,
    COALESCE(rev.revenue, 0)::float AS revenue,
    rs.average_rating::float AS average_rating,
    COALESCE(rs.rating_count, 0) AS rating_count
`;

const RESTAURANT_FROM = `
    FROM restaurants r
    JOIN users u
        ON u.id = r.owner_id
    ${RESTAURANT_STATS_JOIN}
`;

const RESTAURANT_LIST_SELECT = `
    SELECT
        r.id,
        r.owner_id,
        r.name,
        r.description,
        r.phone,
        r.email,
        r.address,
        r.city,
        r.latitude,
        r.longitude,
        r.logo_url,
        r.cover_image_url,
        r.is_open,
        r.is_active,
        r.approval_status,
        r.rejection_reason,
        r.reviewed_at,
        r.reviewed_by,
        r.delivery_fee,
        r.minimum_order,
        r.opening_time,
        r.closing_time,
        r.created_at,
        r.updated_at,

        ${RESTAURANT_OWNER_COLUMNS},
        ${RESTAURANT_STATS_COLUMNS}

    ${RESTAURANT_FROM}
`;

const RESTAURANT_DETAIL_SELECT = `
    SELECT
        r.*,

        ${RESTAURANT_OWNER_COLUMNS},
        ${RESTAURANT_STATS_COLUMNS}

    ${RESTAURANT_FROM}
`;

/*
|--------------------------------------------------------------------------
| Helpers
|--------------------------------------------------------------------------
*/

function apiError(message, statusCode = 400) {
    const error = new Error(message);
    error.statusCode = statusCode;
    return error;
}

function hasField(object, field) {
    return Object.prototype.hasOwnProperty.call(object, field);
}

function isEmpty(value) {
    return value === undefined || value === null || value === "";
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

function validateId(value, label = "ID") {
    const id = String(value ?? "").trim();

    if (!/^[1-9][0-9]*$/.test(id)) {
        throw apiError(`${label} must be a positive integer`);
    }

    return id;
}

function validateText(value, label, min, max) {
    if (isEmpty(value)) {
        throw apiError(`${label} is required`);
    }

    if (typeof value !== "string") {
        throw apiError(`${label} must be text`);
    }

    const text = value.trim();

    if (text.length < min || text.length > max) {
        throw apiError(
            `${label} must be between ${min} and ${max} characters`
        );
    }

    return text;
}

function validateOptionalText(value, label, max) {
    if (isEmpty(value)) {
        return null;
    }

    if (typeof value !== "string") {
        throw apiError(`${label} must be text`);
    }

    const text = value.trim();

    if (text.length > max) {
        throw apiError(
            `${label} must be at most ${max} characters`
        );
    }

    return text || null;
}

function validateName(value, label) {
    if (
        typeof value !== "string" ||
        !isValidName(value.trim())
    ) {
        throw apiError(
            `${label} must contain at least 2 characters`
        );
    }

    return value.trim();
}

function validateEmail(value) {
    if (typeof value !== "string") {
        throw apiError(
            "Please provide a valid email address"
        );
    }

    const email = normalizeEmail(value);

    if (!isValidEmail(email)) {
        throw apiError(
            "Please provide a valid email address"
        );
    }

    return email;
}

function validatePhone(
    value,
    { required = false } = {}
) {
    if (isEmpty(value)) {
        if (required) {
            throw apiError(
                "Phone number is required"
            );
        }

        return null;
    }

    if (typeof value !== "string") {
        throw apiError(
            "Please provide a valid phone number"
        );
    }

    const phone = value.trim();

    if (!phone) {
        if (required) {
            throw apiError(
                "Phone number is required"
            );
        }

        return null;
    }

    if (!isValidPhone(phone)) {
        throw apiError(
            "Please provide a valid phone number"
        );
    }

    return phone;
}

function validatePassword(value) {
    if (!isValidPassword(value)) {
        throw apiError(
            "Password must contain at least 8 characters"
        );
    }

    return value;
}

function validateCoordinate(
    value,
    label,
    min,
    max
) {
    if (isEmpty(value)) {
        return null;
    }

    if (
        typeof value !== "number" &&
        typeof value !== "string"
    ) {
        throw apiError(
            `${label} must be a number`
        );
    }

    const number = Number(value);

    if (
        !Number.isFinite(number) ||
        number < min ||
        number > max
    ) {
        throw apiError(
            `${label} must be a number between ${min} and ${max}`
        );
    }

    return number;
}

function validateMoney(value, label) {
    if (
        isEmpty(value) ||
        (
            typeof value !== "number" &&
            typeof value !== "string"
        )
    ) {
        throw apiError(
            `${label} must be a number`
        );
    }

    const number = Number(value);

    if (
        !Number.isFinite(number) ||
        number < 0 ||
        number > 1000000
    ) {
        throw apiError(
            `${label} must be a number between 0 and 1000000`
        );
    }

    return number;
}

function validateTime(value, label) {
    if (isEmpty(value)) {
        return null;
    }

    const text = String(value).trim();

    if (
        !/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/.test(
            text
        )
    ) {
        throw apiError(
            `${label} must be a time in HH:MM format`
        );
    }

    return text;
}

function validateDate(value, label) {
    if (isEmpty(value)) {
        return null;
    }

    const text = String(value).trim();

    const parsed = new Date(
        `${text}T00:00:00Z`
    );

    if (
        !/^\d{4}-\d{2}-\d{2}$/.test(text) ||
        Number.isNaN(parsed.getTime()) ||
        parsed.toISOString().slice(0, 10) !== text
    ) {
        throw apiError(
            `${label} must be a date in YYYY-MM-DD format`
        );
    }

    return text;
}

/*
 * Validates the restaurant fields in `data`.
 *
 * create = true  : name and live GPS coordinates are required
 * create = false : only the fields present are validated
 *
 * Returns { column: cleanValue } for fields that were provided.
 */
function cleanRestaurantFields(
    data,
    { create = false } = {}
) {
    const fields = {};

    const provided = (field) =>
        hasField(data, field);

    if (create || provided("name")) {
        fields.name = validateText(
            data.name,
            "Restaurant name",
            2,
            120
        );
        const firstName = fields.name.trim().split(/\s+/)[0];
        fields.location_name = `${firstName} Location`;
    }

    if (provided("description")) {
        fields.description =
            validateOptionalText(
                data.description,
                "Description",
                1000
            );
    }

    if (provided("phone")) {
        fields.phone = validatePhone(
            data.phone
        );
    }

    if (provided("email")) {
        fields.email = isEmpty(data.email)
            ? null
            : validateEmail(data.email);
    }

    if (create && (!provided("latitude") || !provided("longitude"))) {
        throw apiError("Restaurant live GPS location is required");
    }

    if (provided("latitude")) {
        fields.latitude =
            validateCoordinate(
                data.latitude,
                "Latitude",
                -90,
                90
            );
    }

    if (provided("longitude")) {
        fields.longitude =
            validateCoordinate(
                data.longitude,
                "Longitude",
                -180,
                180
            );
    }

    // Legacy database columns remain for backward compatibility only.
    // They are generated from GPS coordinates; no user-entered address/city is accepted.
    if (create) {
        fields.address = `GPS (${Number(fields.latitude).toFixed(6)}, ${Number(fields.longitude).toFixed(6)})`;
        fields.city = "GPS Location";
    }

    if (provided("logo_url")) {
        const logoValue = isEmpty(data.logo_url) ? null : data.logo_url;
        if (logoValue !== null && typeof logoValue !== "string") {
            throw apiError("Restaurant image must be a valid image string");
        }
        if (logoValue && logoValue.startsWith("data:")) {
            const match = logoValue.match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/);
            if (!match) {
                throw apiError("Restaurant image must be a base64 JPEG, PNG or WebP image");
            }
            if (logoValue.length > 7_000_000) {
                throw apiError("Restaurant image must be 5 MB or smaller");
            }
        } else if (logoValue && logoValue.length > 500) {
            throw apiError("Logo URL is too long");
        }
        fields.logo_url = logoValue;
    }

    if (provided("cover_image_url")) {
        fields.cover_image_url =
            validateOptionalText(
                data.cover_image_url,
                "Cover image URL",
                500
            );
    }

    if (provided("delivery_fee")) {
        fields.delivery_fee =
            validateMoney(
                data.delivery_fee,
                "Delivery fee"
            );
    }

    if (provided("minimum_order")) {
        fields.minimum_order =
            validateMoney(
                data.minimum_order,
                "Minimum order"
            );
    }

    if (provided("opening_time")) {
        fields.opening_time =
            validateTime(
                data.opening_time,
                "Opening time"
            );
    }

    if (provided("closing_time")) {
        fields.closing_time =
            validateTime(
                data.closing_time,
                "Closing time"
            );
    }

    return fields;
}

function escapeLike(value) {
    return value.replace(
        /[\\%_]/g,
        "\\$&"
    );
}

/*
 * Readable temporary password.
 *
 * Example:
 * Owner-7f3a9c21
 *
 * Returned once to the admin so it can be shared
 * with the restaurant owner.
 */
function generateTemporaryPassword() {
    return `Owner-${crypto.randomBytes(4).toString("hex")}`;
}

async function inTransaction(action) {
    const client = await pool.connect();

    try {
        await client.query("BEGIN");

        const result = await action(client);

        await client.query("COMMIT");

        return result;
    } catch (error) {
        try {
            await client.query("ROLLBACK");
        } catch (_) {
            /*
             * Preserve original error.
             */
        }

        throw error;
    } finally {
        client.release();
    }
}

async function assertNoActiveOrders(
    client,
    restaurantId,
    force
) {
    if (force) {
        return;
    }

    const result = await client.query(
        `
        SELECT COUNT(*)::int AS count
        FROM orders
        WHERE restaurant_id = $1
          AND status IN (${ACTIVE_ORDER_SQL})
        `,
        [restaurantId]
    );

    const count = result.rows[0].count;

    if (count > 0) {
        throw apiError(
            `This restaurant has ${count} order(s) in progress. ` +
            "Complete or cancel them first, or repeat the request with force=true",
            409
        );
    }
}

/*
|--------------------------------------------------------------------------
| Restaurant queries
|--------------------------------------------------------------------------
*/

async function getRestaurantByOwnerId(ownerId) {
    const id = validateId(
        ownerId,
        "Owner ID"
    );

    const result = await pool.query(
        `
        ${RESTAURANT_DETAIL_SELECT}
        WHERE r.owner_id = $1
        LIMIT 1
        `,
        [id]
    );

    return result.rows[0] || null;
}

async function getRestaurantById(
    restaurantId
) {
    const id = validateId(
        restaurantId,
        "Restaurant ID"
    );

    const result = await pool.query(
        `
        ${RESTAURANT_DETAIL_SELECT}
        WHERE r.id = $1
        LIMIT 1
        `,
        [id]
    );

    return result.rows[0] || null;
}

async function getRestaurantByIdForAdmin(
    restaurantId
) {
    const id = validateId(
        restaurantId,
        "Restaurant ID"
    );

    const result = await pool.query(
        `
        ${RESTAURANT_DETAIL_SELECT}
        WHERE r.id = $1
        LIMIT 1
        `,
        [id]
    );

    return result.rows[0] || null;
}

/*
|--------------------------------------------------------------------------
| Restaurant creation
|--------------------------------------------------------------------------
*/

async function insertRestaurant(
    client,
    ownerId,
    fields,
    reviewerId = null
) {
    const columns = [
        "owner_id",
        ...Object.keys(fields)
    ];

    const values = [ownerId, ...Object.values(fields)];

    if (reviewerId !== null) {
        columns.push(
            "approval_status",
            "is_active",
            "reviewed_at",
            "reviewed_by"
        );

        values.push(
            "approved",
            true,
            new Date(),
            reviewerId
        );
    }

    const placeholders = values.map(
        (_, index) => `$${index + 1}`
    );

    const result = await client.query(
        `
        INSERT INTO restaurants (
            ${columns.join(", ")}
        )
        VALUES (
            ${placeholders.join(", ")}
        )
        RETURNING id
        `,
        values
    );

    return result.rows[0];
}

async function createRestaurant(
    ownerId,
    input
) {
    const id = validateId(
        ownerId,
        "Owner ID"
    );

    const data = requireObject(input);

    checkAllowedFields(
        data,
        RESTAURANT_FIELDS
    );

    const fields = cleanRestaurantFields(
        data,
        { create: true }
    );

    return inTransaction(
        async (client) => {
            const ownerResult =
                await client.query(
                    `
                    SELECT
                        id,
                        role,
                        is_active
                    FROM users
                    WHERE id = $1
                    FOR UPDATE
                    `,
                    [id]
                );

            const owner =
                ownerResult.rows[0];

            if (!owner) {
                throw apiError(
                    "Owner account not found",
                    404
                );
            }

            if (owner.role !== "restaurant") {
                throw apiError(
                    'Owner account must have the "restaurant" role',
                    409
                );
            }

            if (!owner.is_active) {
                throw apiError(
                    "Owner account is inactive",
                    409
                );
            }

            const existing =
                await client.query(
                    `
                    SELECT id
                    FROM restaurants
                    WHERE owner_id = $1
                    LIMIT 1
                    `,
                    [id]
                );

            if (existing.rows.length > 0) {
                throw apiError(
                    "This owner already has a restaurant",
                    409
                );
            }

            const restaurant =
                await insertRestaurant(
                    client,
                    id,
                    fields
                );

            return getRestaurantByIdForAdmin(
                restaurant.id
            );
        }
    );
}

async function updateRestaurant(
    ownerId,
    input
) {
    const owner = validateId(
        ownerId,
        "Owner ID"
    );

    const data = requireObject(input);

    checkAllowedFields(
        data,
        [
            ...RESTAURANT_FIELDS,
            "is_open"
        ]
    );

    const fields =
        cleanRestaurantFields(data);

    if (hasField(data, "is_open")) {
        if (
            typeof data.is_open !==
            "boolean"
        ) {
            throw apiError(
                "is_open must be true or false"
            );
        }

        fields.is_open =
            data.is_open;
    }

    if (
        Object.keys(fields).length === 0
    ) {
        throw apiError(
            "Provide at least one restaurant field to update"
        );
    }

    return inTransaction(
        async (client) => {
            const restaurantResult =
                await client.query(
                    `
                    SELECT
                        id,
                        owner_id,
                        is_active,
                        approval_status
                    FROM restaurants
                    WHERE owner_id = $1
                    FOR UPDATE
                    `,
                    [owner]
                );

            const restaurant =
                restaurantResult.rows[0];

            if (!restaurant) {
                throw apiError(
                    "Restaurant not found",
                    404
                );
            }

            if (
                fields.is_open === true &&
                (
                    !restaurant.is_active ||
                    restaurant.approval_status !==
                        "approved"
                )
            ) {
                throw apiError(
                    "Only approved, active restaurants can be opened",
                    409
                );
            }

            const assignments = [];
            const values = [];

            for (
                const [column, value]
                of Object.entries(fields)
            ) {
                values.push(value);

                assignments.push(
                    `${column} = $${values.length}`
                );
            }

            values.push(
                restaurant.id
            );

            await client.query(
                `
                UPDATE restaurants
                SET
                    ${assignments.join(", ")},
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = $${values.length}
                `,
                values
            );

            return getRestaurantByIdForAdmin(
                restaurant.id
            );
        }
    );
}

/*
|--------------------------------------------------------------------------
| Restaurant status
|--------------------------------------------------------------------------
*/

async function updateRestaurantStatus(
    ownerId,
    newStatus
) {
    const owner = validateId(
        ownerId,
        "Owner ID"
    );

    if (typeof newStatus !== "boolean") {
        throw apiError(
            "is_open must be a boolean (true or false)"
        );
    }

    return inTransaction(async (client) => {
        const existingResult = await client.query(
            `
            SELECT id, is_active, approval_status
            FROM restaurants
            WHERE owner_id = $1
            FOR UPDATE
            `,
            [owner]
        );

        const existing = existingResult.rows[0];

        if (!existing) {
            throw apiError("Restaurant profile not found", 404);
        }

        if (
            newStatus === true &&
            (!existing.is_active || existing.approval_status !== "approved")
        ) {
            throw apiError(
                "Only approved, active restaurants can be opened. Contact the platform administrator if you need approval or activation.",
                409
            );
        }

        const result = await client.query(
            `
            UPDATE restaurants
            SET
                is_open = $1,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = $2
            RETURNING
                id,
                owner_id,
                name,
                is_open,
                is_active,
                approval_status,
                updated_at
            `,
            [newStatus, existing.id]
        );

        return result.rows[0];
    });
}

async function resubmitRestaurant(
    restaurantId
) {
    const id = validateId(
        restaurantId,
        "Restaurant ID"
    );

    const result = await pool.query(
        `
        UPDATE restaurants
        SET
            approval_status = 'pending',
            rejection_reason = NULL,
            reviewed_at = NULL,
            reviewed_by = NULL,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $1
        RETURNING *
        `,
        [id]
    );

    if (
        result.rows.length === 0
    ) {
        throw apiError(
            "Restaurant not found",
            404
        );
    }

    return result.rows[0];
}

/*
|--------------------------------------------------------------------------
| Restaurant listing
|--------------------------------------------------------------------------
*/

async function getAllRestaurants(
    options = {}
) {
    const search = String(
        options.search ?? ""
    ).trim();

    const status = String(
        options.status ?? "all"
    )
        .trim()
        .toLowerCase();

    const open = String(
        options.open ?? "all"
    )
        .trim()
        .toLowerCase();

    const approval = String(
        options.approval ?? "all"
    )
        .trim()
        .toLowerCase();

    const sort = String(
        options.sort ?? "newest"
    )
        .trim()
        .toLowerCase();

    if (
        !RESTAURANT_STATUS_FILTERS.includes(
            status
        )
    ) {
        throw apiError(
            "Invalid restaurant status filter"
        );
    }

    if (
        !RESTAURANT_OPEN_FILTERS.includes(
            open
        )
    ) {
        throw apiError(
            "Invalid restaurant open filter"
        );
    }

    if (
        !RESTAURANT_APPROVAL_FILTERS.includes(
            approval
        )
    ) {
        throw apiError(
            "Invalid restaurant approval filter"
        );
    }

    const limit = Math.min(
        100,
        Math.max(
            1,
            Number.parseInt(
                options.limit,
                10
            ) || 10
        )
    );

    const page = Math.max(
        1,
        Number.parseInt(
            options.page,
            10
        ) || 1
    );

    const offset =
        (page - 1) * limit;

    const values = [];
    const conditions = [];

    if (search) {
        values.push(
            `%${escapeLike(search)}%`
        );

        const placeholder =
            `$${values.length}`;

        conditions.push(
            `
            (
                r.name ILIKE ${placeholder}
                    ESCAPE '\\'
                OR r.location_name ILIKE ${placeholder}
                    ESCAPE '\\'
                OR r.email ILIKE ${placeholder}
                    ESCAPE '\\'
                OR r.phone ILIKE ${placeholder}
                    ESCAPE '\\'
                OR CONCAT(
                    u.first_name,
                    ' ',
                    u.last_name
                ) ILIKE ${placeholder}
                    ESCAPE '\\'
                OR u.email ILIKE ${placeholder}
                    ESCAPE '\\'
                OR u.phone ILIKE ${placeholder}
                    ESCAPE '\\'
            )
            `
        );
    }

    if (status === "active") {
        conditions.push(
            "r.is_active = TRUE"
        );
    }

    if (status === "inactive") {
        conditions.push(
            "r.is_active = FALSE"
        );
    }

    if (open === "open") {
        conditions.push(
            "r.is_open = TRUE"
        );
    }

    if (open === "closed") {
        conditions.push(
            "r.is_open = FALSE"
        );
    }

    if (approval !== "all") {
        values.push(approval);

        conditions.push(
            `r.approval_status = $${values.length}`
        );
    }

    const filter =
        conditions.length > 0
            ? conditions.join(" AND ")
            : "TRUE";

    const statsResult =
        await pool.query(
            `
            SELECT
                COUNT(*)::int AS total,
                COUNT(*) FILTER (
                    WHERE r.is_active = TRUE
                )::int AS active,
                COUNT(*) FILTER (
                    WHERE r.is_active = FALSE
                )::int AS inactive,
                COUNT(*) FILTER (
                    WHERE r.is_open = TRUE
                )::int AS open,
                COUNT(*) FILTER (
                    WHERE r.approval_status = 'pending'
                )::int AS pending,
                COUNT(*) FILTER (
                    WHERE r.approval_status = 'approved'
                )::int AS approved,
                COUNT(*) FILTER (
                    WHERE r.approval_status = 'rejected'
                )::int AS rejected,
                COUNT(*) FILTER (
                    WHERE r.approval_status = 'rejected'
                       OR r.is_active = FALSE
                )::int AS suspended,
                COUNT(*) FILTER (
                    WHERE ${filter}
                )::int AS filtered,
                COALESCE(
                    ROUND(
                        AVG(rs.average_rating)::numeric,
                        1
                    ),
                    0
                )::float AS average_rating
            FROM restaurants r
            JOIN users u
                ON u.id = r.owner_id
            LEFT JOIN (
                SELECT
                    restaurant_id,
                    AVG(rating) AS average_rating
                FROM reviews
                WHERE rating IS NOT NULL
                GROUP BY restaurant_id
            ) rs
                ON rs.restaurant_id = r.id
            WHERE TRUE
            `,
            values
        );

    const dataResult =
        await pool.query(
            `
            ${RESTAURANT_LIST_SELECT}
            WHERE ${filter}
            ORDER BY ${
                RESTAURANT_SORTS[
                    sort
                ] ||
                RESTAURANT_SORTS.newest
            }
            LIMIT $${values.length + 1}
            OFFSET $${values.length + 2}
            `,
            [
                ...values,
                limit,
                offset
            ]
        );

    const stats =
        statsResult.rows[0];

    return {
        restaurants:
            dataResult.rows,

        pagination: {
            page,
            limit,
            totalItems:
                stats.filtered,

            totalPages:
                Math.max(
                    1,
                    Math.ceil(
                        stats.filtered /
                            limit
                    )
                )
        },

        statistics: {
            total: Number(
                stats.total || 0
            ),

            active: Number(
                stats.active || 0
            ),

            inactive: Number(
                stats.inactive || 0
            ),

            open: Number(
                stats.open || 0
            ),

            pending: Number(
                stats.pending || 0
            ),

            approved: Number(
                stats.approved || 0
            ),

            rejected: Number(
                stats.rejected || 0
            ),

            suspended: Number(
                stats.suspended || 0
            ),

            averageRating:
                Number(
                    stats.average_rating ||
                        0
                )
        }
    };
}

/*
|--------------------------------------------------------------------------
| Admin restaurant listing
|--------------------------------------------------------------------------
*/

async function getAllRestaurantsForAdmin(
    options = {}
) {
    return getAllRestaurants(
        options
    );
}

/*
|--------------------------------------------------------------------------
| Admin restaurant summary
|--------------------------------------------------------------------------
*/

async function getRestaurantSummary() {
    const result =
        await pool.query(
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
                    WHERE is_open = TRUE
                )::int AS open,

                COUNT(*) FILTER (
                    WHERE approval_status = 'pending'
                )::int AS pending,

                COUNT(*) FILTER (
                    WHERE approval_status = 'approved'
                )::int AS approved,

                COUNT(*) FILTER (
                    WHERE approval_status = 'rejected'
                )::int AS rejected,

                COUNT(*) FILTER (
                    WHERE created_at >= date_trunc(
                        'month',
                        CURRENT_TIMESTAMP
                    )
                )::int AS added_this_month

            FROM restaurants
            `
        );

    const row =
        result.rows[0];

    return {
        total: Number(
            row.total || 0
        ),

        active: Number(
            row.active || 0
        ),

        inactive: Number(
            row.inactive || 0
        ),

        open: Number(
            row.open || 0
        ),

        pending: Number(
            row.pending || 0
        ),

        approved: Number(
            row.approved || 0
        ),

        rejected: Number(
            row.rejected || 0
        ),

        addedThisMonth:
            Number(
                row.added_this_month ||
                    0
            )
    };
}

/*
|--------------------------------------------------------------------------
| Admin export
|--------------------------------------------------------------------------
*/

async function exportRestaurants(
    options = {}
) {
    const result =
        await getAllRestaurants({
            ...options,
            page: 1,
            limit: 100
        });

    const headers = [
        "ID",
        "Restaurant",
        "Owner",
        "Owner Email",
        "Owner Phone",
        "Restaurant Location",
        "Status",
        "Approval",
        "Open",
        "Orders",
        "Revenue",
        "Rating",
        "Created"
    ];

    const escapeCsv =
        (value) => {
            const text =
                String(
                    value ??
                        ""
                );

            if (
                /[",\n\r]/.test(
                    text
                )
            ) {
                return `"${text.replace(
                    /"/g,
                    '""'
                )}"`;
            }

            return text;
        };

    const lines =
        result.restaurants.map(
            (restaurant) =>
                [
                    restaurant.id,
                    restaurant.name,
                    [
                        restaurant.owner_first_name,
                        restaurant.owner_last_name
                    ]
                        .filter(Boolean)
                        .join(" "),
                    restaurant.owner_email,
                    restaurant.owner_phone,
                    restaurant.location_name,
                    restaurant.is_active
                        ? "Active"
                        : "Inactive",
                    restaurant.approval_status,
                    restaurant.is_open
                        ? "Open"
                        : "Closed",
                    restaurant.total_orders,
                    restaurant.revenue,
                    restaurant.average_rating,
                    restaurant.created_at
                ]
                    .map(escapeCsv)
                    .join(",")
        );

    return [
        headers.join(","),
        ...lines
    ].join("\r\n");
}

/*
|--------------------------------------------------------------------------
| Admin - create and update
|--------------------------------------------------------------------------
*/

/*
 * POST /api/restaurants/admin
 *
 * Body:
 * - restaurant fields
 * - owner_id
 * OR
 * - owner_first_name
 * - owner_last_name
 * - owner_email
 * - owner_phone
 * - owner_password
 * - password
 *
 * If no owner password is supplied,
 * a temporary password is generated.
 */
async function adminCreateRestaurant(
    input,
    adminId
) {
    const data =
        requireObject(input);

    const reviewerId =
        validateId(
            adminId,
            "Admin ID"
        );

    checkAllowedFields(
        data,
        [
            ...RESTAURANT_FIELDS,
            "is_open",
            "owner_id",
            "owner_first_name",
            "owner_last_name",
            "owner_email",
            "owner_phone",
            "owner_password",
            "password"
        ]
    );

    const fields =
        cleanRestaurantFields(
            data,
            { create: true }
        );

    const usingExistingOwner =
        !isEmpty(
            data.owner_id
        );

    const newOwnerFields = [
        "owner_first_name",
        "owner_last_name",
        "owner_email",
        "owner_phone",
        "owner_password",
        "password"
    ];

    if (
        usingExistingOwner &&
        newOwnerFields.some(
            (field) =>
                hasField(
                    data,
                    field
                )
        )
    ) {
        throw apiError(
            "Send either owner_id or the new owner's details, not both"
        );
    }

    if (usingExistingOwner) {
        const ownerId =
            validateId(
                data.owner_id,
                "Owner ID"
            );

        const restaurantId =
            await inTransaction(
                async (client) => {
                    const ownerResult =
                        await client.query(
                            `
                            SELECT
                                id,
                                role,
                                is_active
                            FROM users
                            WHERE id = $1
                            FOR UPDATE
                            `,
                            [ownerId]
                        );

                    const owner =
                        ownerResult.rows[0];

                    if (!owner) {
                        throw apiError(
                            "Owner account not found",
                            404
                        );
                    }

                    if (
                        owner.role !==
                        "restaurant"
                    ) {
                        throw apiError(
                            'Owner account must have the "restaurant" role',
                            409
                        );
                    }

                    if (!owner.is_active) {
                        throw apiError(
                            "Owner account is inactive",
                            409
                        );
                    }

                    const existing =
                        await client.query(
                            `
                            SELECT id
                            FROM restaurants
                            WHERE owner_id = $1
                            LIMIT 1
                            `,
                            [ownerId]
                        );

                    if (
                        existing.rows
                            .length > 0
                    ) {
                        throw apiError(
                            "This owner already has a restaurant",
                            409
                        );
                    }

                    const restaurant =
                        await insertRestaurant(
                            client,
                            ownerId,
                            fields,
                            reviewerId
                        );

                    return restaurant.id;
                }
            );

        return {
            restaurant:
                await getRestaurantByIdForAdmin(
                    restaurantId
                ),

            temporaryPassword:
                null
        };
    }

    const ownerFirstName =
        validateName(
            data.owner_first_name,
            "Owner first name"
        );

    const ownerLastName =
        validateName(
            data.owner_last_name,
            "Owner last name"
        );

    const ownerEmail =
        validateEmail(
            data.owner_email
        );

    const ownerPhone =
        validatePhone(
            data.owner_phone,
            { required: true }
        );

    const suppliedPassword =
        hasField(
            data,
            "owner_password"
        )
            ? data.owner_password
            : data.password;

    const passwordWasGenerated =
        isEmpty(
            suppliedPassword
        );

    const password =
        passwordWasGenerated
            ? generateTemporaryPassword()
            : validatePassword(
                suppliedPassword
            );

    const passwordHash =
        await bcrypt.hash(
            password,
            12
        );

    const restaurantId =
        await inTransaction(
            async (client) => {
                const userResult =
                    await client.query(
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
                            'restaurant',
                            TRUE
                        )
                        RETURNING id
                        `,
                        [
                            ownerFirstName,
                            ownerLastName,
                            ownerEmail,
                            ownerPhone,
                            passwordHash
                        ]
                    );

                const restaurant =
                    await insertRestaurant(
                        client,
                        userResult.rows[0].id,
                        fields,
                        reviewerId
                    );

                return restaurant.id;
            }
        );

    return {
        restaurant:
            await getRestaurantByIdForAdmin(
                restaurantId
            ),

        temporaryPassword:
            passwordWasGenerated
                ? password
                : null
    };
}

/*
 * PUT /api/restaurants/admin/:id
 *
 * Admin can update:
 *
 * Restaurant:
 * - name
 * - description
 * - phone
 * - email
 * - latitude
 * - longitude
 * - logo_url
 * - cover_image_url
 * - delivery_fee
 * - minimum_order
 * - opening_time
 * - closing_time
 * - is_open
 *
 * Owner:
 * - owner_first_name
 * - owner_last_name
 * - owner_email
 * - owner_phone
 *
 * Password:
 * - current_password
 * - password
 *
 * Password changes require the owner's current password.
 */
async function adminUpdateRestaurant(
    restaurantId,
    input
) {
    const id =
        validateId(
            restaurantId,
            "Restaurant ID"
        );

    const data =
        requireObject(input);

    /*
     * IMPORTANT:
     *
     * The previous implementation only allowed
     * RESTAURANT_FIELDS + is_open.
     *
     * The admin frontend also sends owner fields,
     * so those fields must be accepted here.
     */
    checkAllowedFields(
        data,
        [
            ...RESTAURANT_FIELDS,
            "is_open",

            "owner_first_name",
            "owner_last_name",
            "owner_email",
            "owner_phone",

            "current_password",
            "password"
        ]
    );

    /*
     * ---------------------------------------------------------
     * RESTAURANT FIELDS
     * ---------------------------------------------------------
     */

    const fields =
        cleanRestaurantFields(data);

    if (
        hasField(
            data,
            "is_open"
        )
    ) {
        if (
            typeof data.is_open !==
            "boolean"
        ) {
            throw apiError(
                "is_open must be true or false"
            );
        }

        fields.is_open =
            data.is_open;
    }

    /*
     * ---------------------------------------------------------
     * OWNER FIELDS
     * ---------------------------------------------------------
     */

    const ownerFields = {};

    if (
        hasField(
            data,
            "owner_first_name"
        )
    ) {
        ownerFields.first_name =
            validateName(
                data.owner_first_name,
                "Owner first name"
            );
    }

    if (
        hasField(
            data,
            "owner_last_name"
        )
    ) {
        ownerFields.last_name =
            validateName(
                data.owner_last_name,
                "Owner last name"
            );
    }

    if (
        hasField(
            data,
            "owner_email"
        )
    ) {
        ownerFields.email =
            validateEmail(
                data.owner_email
            );
    }

    if (
        hasField(
            data,
            "owner_phone"
        )
    ) {
        ownerFields.phone =
            validatePhone(
                data.owner_phone
            );
    }

    /*
     * ---------------------------------------------------------
     * PASSWORD
     * ---------------------------------------------------------
     */

    const hasNewPassword =
        hasField(
            data,
            "password"
        ) &&
        !isEmpty(
            data.password
        );

    const hasCurrentPassword =
        hasField(
            data,
            "current_password"
        ) &&
        !isEmpty(
            data.current_password
        );

    if (
        hasCurrentPassword &&
        !hasNewPassword
    ) {
        throw apiError(
            "A new password is required when current_password is provided"
        );
    }

    if (
        hasNewPassword &&
        !hasCurrentPassword
    ) {
        throw apiError(
            "Current password is required to change the owner's password"
        );
    }

    let newPasswordHash = null;

    if (hasNewPassword) {
        const currentPassword =
            String(
                data.current_password
            );

        const newPassword =
            validatePassword(
                data.password
            );

        if (
            !currentPassword.trim()
        ) {
            throw apiError(
                "Current password is required"
            );
        }

        if (
            currentPassword ===
            newPassword
        ) {
            throw apiError(
                "New password must be different from the current password"
            );
        }

        newPasswordHash =
            await bcrypt.hash(
                newPassword,
                12
            );
    }

    /*
     * ---------------------------------------------------------
     * NOTHING TO UPDATE
     * ---------------------------------------------------------
     */

    if (
        Object.keys(fields)
            .length === 0 &&
        Object.keys(ownerFields)
            .length === 0 &&
        !hasNewPassword
    ) {
        throw apiError(
            "Provide at least one restaurant or owner field to update"
        );
    }

    /*
     * ---------------------------------------------------------
     * TRANSACTION
     * ---------------------------------------------------------
     */

    return inTransaction(
        async (client) => {
            /*
             * Lock both restaurant and owner.
             *
             * This prevents two simultaneous admin updates
             * from overwriting each other unexpectedly.
             */
            const existingResult =
                await client.query(
                    `
                    SELECT
                        r.id,
                        r.owner_id,
                        r.is_active,
                        r.approval_status,
                        u.password_hash AS owner_password_hash
                    FROM restaurants r
                    JOIN users u
                        ON u.id = r.owner_id
                    WHERE r.id = $1
                    FOR UPDATE OF r, u
                    `,
                    [id]
                );

            const existing =
                existingResult.rows[0];

            if (!existing) {
                throw apiError(
                    "Restaurant not found",
                    404
                );
            }

            /*
             * -------------------------------------------------
             * OPEN STATUS VALIDATION
             * -------------------------------------------------
             */

            if (
                fields.is_open ===
                    true &&
                (
                    !existing.is_active ||
                    existing.approval_status !==
                        "approved"
                )
            ) {
                throw apiError(
                    "Only approved, active restaurants can be opened",
                    409
                );
            }

            /*
             * -------------------------------------------------
             * VERIFY CURRENT PASSWORD
             * -------------------------------------------------
             */

            if (hasNewPassword) {
                if (
                    !existing.owner_password_hash
                ) {
                    throw apiError(
                        "The restaurant owner does not have a valid password",
                        409
                    );
                }

                const passwordMatches =
                    await bcrypt.compare(
                        String(
                            data.current_password
                        ),
                        existing.owner_password_hash
                    );

                if (!passwordMatches) {
                    throw apiError(
                        "Current owner password is incorrect",
                        401
                    );
                }
            }

            /*
             * -------------------------------------------------
             * UPDATE RESTAURANT
             * -------------------------------------------------
             */

            if (
                Object.keys(fields)
                    .length > 0
            ) {
                const assignments = [];
                const values = [];

                for (
                    const [
                        column,
                        value
                    ]
                    of Object.entries(
                        fields
                    )
                ) {
                    values.push(
                        value
                    );

                    assignments.push(
                        `${column} = $${values.length}`
                    );
                }

                values.push(id);

                await client.query(
                    `
                    UPDATE restaurants
                    SET
                        ${assignments.join(
                            ", "
                        )},
                        updated_at = CURRENT_TIMESTAMP
                    WHERE id = $${values.length}
                    `,
                    values
                );
            }

            /*
             * -------------------------------------------------
             * UPDATE OWNER ACCOUNT
             * -------------------------------------------------
             */

            const ownerAssignments = [];
            const ownerValues = [];

            const addOwnerAssignment =
                (
                    column,
                    value
                ) => {
                    ownerValues.push(
                        value
                    );

                    ownerAssignments.push(
                        `${column} = $${ownerValues.length}`
                    );
                };

            if (
                hasField(
                    ownerFields,
                    "first_name"
                )
            ) {
                addOwnerAssignment(
                    "first_name",
                    ownerFields.first_name
                );
            }

            if (
                hasField(
                    ownerFields,
                    "last_name"
                )
            ) {
                addOwnerAssignment(
                    "last_name",
                    ownerFields.last_name
                );
            }

            if (
                hasField(
                    ownerFields,
                    "email"
                )
            ) {
                addOwnerAssignment(
                    "email",
                    ownerFields.email
                );
            }

            if (
                hasField(
                    ownerFields,
                    "phone"
                )
            ) {
                addOwnerAssignment(
                    "phone",
                    ownerFields.phone
                );
            }

            if (hasNewPassword) {
                addOwnerAssignment(
                    "password_hash",
                    newPasswordHash
                );
            }

            if (
                ownerAssignments.length >
                0
            ) {
                ownerValues.push(
                    existing.owner_id
                );

                try {
                    await client.query(
                        `
                        UPDATE users
                        SET
                            ${ownerAssignments.join(
                                ", "
                            )},
                            updated_at = CURRENT_TIMESTAMP
                        WHERE id = $${ownerValues.length}
                          AND role = 'restaurant'
                        `,
                        ownerValues
                    );
                } catch (error) {
                    /*
                     * PostgreSQL unique constraint
                     * handling for email/phone.
                     */
                    if (
                        error.code ===
                        "23505"
                    ) {
                        if (
                            error.constraint &&
                            error.constraint
                                .toLowerCase()
                                .includes(
                                    "email"
                                )
                        ) {
                            throw apiError(
                                "An account with this email already exists",
                                409
                            );
                        }

                        if (
                            error.constraint &&
                            error.constraint
                                .toLowerCase()
                                .includes(
                                    "phone"
                                )
                        ) {
                            throw apiError(
                                "An account with this phone number already exists",
                                409
                            );
                        }

                        throw apiError(
                            "The owner email or phone number is already in use",
                            409
                        );
                    }

                    throw error;
                }
            }

            /*
             * -------------------------------------------------
             * RETURN COMPLETE UPDATED RESTAURANT
             * -------------------------------------------------
             *
             * This is important for the frontend.
             *
             * The frontend expects:
             *
             * owner_first_name
             * owner_last_name
             * owner_email
             * owner_phone
             * approval_status
             * is_active
             * is_open
             * etc.
             */

            const updatedResult =
                await client.query(
                    `
                    ${RESTAURANT_DETAIL_SELECT}
                    WHERE r.id = $1
                    LIMIT 1
                    `,
                    [id]
                );

            return (
                updatedResult.rows[0] ||
                null
            );
        }
    );
}

/*
|--------------------------------------------------------------------------
| Admin - approval and activation
|--------------------------------------------------------------------------
*/

/*
 * PATCH /api/restaurants/admin/:id/approve
 */
async function approveRestaurant(
    restaurantId,
    adminId
) {
    const id =
        validateId(
            restaurantId,
            "Restaurant ID"
        );

    const reviewerId =
        validateId(
            adminId,
            "Admin ID"
        );

    const result =
        await pool.query(
            `
            UPDATE restaurants
            SET
                approval_status = 'approved',
                is_active = TRUE,
                rejection_reason = NULL,
                reviewed_at = CURRENT_TIMESTAMP,
                reviewed_by = $2,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = $1
            RETURNING
                id,
                name,
                is_active,
                is_open,
                approval_status,
                rejection_reason,
                reviewed_at,
                reviewed_by,
                updated_at
            `,
            [
                id,
                reviewerId
            ]
        );

    if (
        result.rows.length === 0
    ) {
        throw apiError(
            "Restaurant not found",
            404
        );
    }

    return result.rows[0];
}

/*
 * PATCH /api/restaurants/admin/:id/reject
 *
 * Body:
 * {
 *     reason: string
 * }
 *
 * Query:
 * ?force=true
 */
async function rejectRestaurant(
    restaurantId,
    adminId,
    reason,
    { force = false } = {}
) {
    const id =
        validateId(
            restaurantId,
            "Restaurant ID"
        );

    const reviewerId =
        validateId(
            adminId,
            "Admin ID"
        );

    const cleanReason =
        typeof reason ===
        "string"
            ? reason.trim()
            : "";

    if (
        cleanReason.length < 3 ||
        cleanReason.length > 500
    ) {
        throw apiError(
            "A rejection reason of 3 to 500 characters is required"
        );
    }

    return inTransaction(
        async (client) => {
            const existing =
                await client.query(
                    `
                    SELECT id
                    FROM restaurants
                    WHERE id = $1
                    FOR UPDATE
                    `,
                    [id]
                );

            if (
                existing.rows.length ===
                0
            ) {
                throw apiError(
                    "Restaurant not found",
                    404
                );
            }

            await assertNoActiveOrders(
                client,
                id,
                force
            );

            const result =
                await client.query(
                    `
                    UPDATE restaurants
                    SET
                        approval_status = 'rejected',
                        is_active = FALSE,
                        is_open = FALSE,
                        rejection_reason = $3,
                        reviewed_at = CURRENT_TIMESTAMP,
                        reviewed_by = $2,
                        updated_at = CURRENT_TIMESTAMP
                    WHERE id = $1
                    RETURNING
                        id,
                        name,
                        is_active,
                        is_open,
                        approval_status,
                        rejection_reason,
                        reviewed_at,
                        reviewed_by,
                        updated_at
                    `,
                    [
                        id,
                        reviewerId,
                        cleanReason
                    ]
                );

            return result.rows[0];
        }
    );
}

/*
 * PATCH /api/restaurants/admin/:id/activate
 *
 * Only approved restaurants can be activated.
 */
async function activateRestaurant(
    restaurantId
) {
    const id =
        validateId(
            restaurantId,
            "Restaurant ID"
        );

    const result =
        await pool.query(
            `
            UPDATE restaurants
            SET
                is_active = TRUE,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = $1
              AND approval_status = 'approved'
            RETURNING
                id,
                name,
                is_active,
                is_open,
                approval_status,
                updated_at
            `,
            [id]
        );

    if (
        result.rows.length ===
        0
    ) {
        const exists =
            await pool.query(
                `
                SELECT approval_status
                FROM restaurants
                WHERE id = $1
                `,
                [id]
            );

        if (
            exists.rows.length ===
            0
        ) {
            throw apiError(
                "Restaurant not found",
                404
            );
        }

        throw apiError(
            "Only approved restaurants can be activated. Approve it first",
            409
        );
    }

    return result.rows[0];
}

/*
 * PATCH /api/restaurants/admin/:id/deactivate
 *
 * Query:
 * ?force=true
 */
async function deactivateRestaurant(
    restaurantId,
    { force = false } = {}
) {
    const id =
        validateId(
            restaurantId,
            "Restaurant ID"
        );

    return inTransaction(
        async (client) => {
            const existing =
                await client.query(
                    `
                    SELECT id
                    FROM restaurants
                    WHERE id = $1
                    FOR UPDATE
                    `,
                    [id]
                );

            if (
                existing.rows.length ===
                0
            ) {
                throw apiError(
                    "Restaurant not found",
                    404
                );
            }

            await assertNoActiveOrders(
                client,
                id,
                force
            );

            const result =
                await client.query(
                    `
                    UPDATE restaurants
                    SET
                        is_active = FALSE,
                        is_open = FALSE,
                        updated_at = CURRENT_TIMESTAMP
                    WHERE id = $1
                    RETURNING
                        id,
                        name,
                        is_active,
                        is_open,
                        approval_status,
                        updated_at
                    `,
                    [id]
                );

            return result.rows[0];
        }
    );
}

/*
|--------------------------------------------------------------------------
| Exports
|--------------------------------------------------------------------------
*/

module.exports = {
    getRestaurantByOwnerId,
    getRestaurantById,
    createRestaurant,
    updateRestaurant,
    updateRestaurantStatus,
    resubmitRestaurant,
    getAllRestaurants,

    getAllRestaurantsForAdmin,
    getRestaurantSummary,
    getRestaurantByIdForAdmin,
    exportRestaurants,
    adminCreateRestaurant,
    adminUpdateRestaurant,
    approveRestaurant,
    rejectRestaurant,
    activateRestaurant,
    deactivateRestaurant
};
