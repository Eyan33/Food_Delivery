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

const VEHICLE_TYPES = ["motorcycle", "bicycle", "car"];
const AVAILABILITY_VALUES = ["offline", "available", "on_delivery"];

/*
 * status filter values accepted by GET /api/riders
 *
 *   all          every rider
 *   active       account enabled
 *   inactive     account disabled
 *   online       available or on_delivery (approved + active)
 *   available    waiting for a job
 *   on_delivery  currently delivering
 *   offline      approved + active but not working
 *   pending      waiting for admin approval
 *   approved     approved by admin
 *   rejected     rejected by admin
 */
const RIDER_STATUS_FILTERS = [
    "all",
    "active",
    "inactive",
    "online",
    "available",
    "on_delivery",
    "offline",
    "pending",
    "approved",
    "rejected"
];

const RIDER_SORTS = {
    newest: "u.created_at DESC, u.id DESC",
    oldest: "u.created_at ASC, u.id ASC",
    name: "u.first_name ASC, u.last_name ASC, u.id ASC",
    deliveries: "deliveries DESC, u.id DESC",
    rating: "rating DESC NULLS LAST, u.id DESC"
};

/*
 * Per-rider delivery and rating statistics.
 * Joined to every rider query so the table can show
 * the Deliveries and Rating columns.
 */
const RIDER_STATS_JOIN = `
    LEFT JOIN rider_profiles rp
        ON rp.user_id = u.id

    LEFT JOIN (
        SELECT
            o.rider_id,
            COUNT(*) FILTER (WHERE o.status = 'delivered')::int AS deliveries,
            COUNT(*) FILTER (
                WHERE o.status IN ('ready', 'out_for_delivery')
            )::int AS active_orders
        FROM orders o
        WHERE o.rider_id IS NOT NULL
        GROUP BY o.rider_id
    ) os
        ON os.rider_id = u.id

    LEFT JOIN (
        SELECT
            o.rider_id,
            ROUND(AVG(rv.rider_rating)::numeric, 1) AS rating,
            COUNT(rv.rider_rating)::int AS rating_count
        FROM reviews rv
        JOIN orders o
            ON o.id = rv.order_id
        WHERE rv.rider_rating IS NOT NULL
          AND o.rider_id IS NOT NULL
        GROUP BY o.rider_id
    ) rs
        ON rs.rider_id = u.id
`;

const RIDER_SELECT = `
    SELECT
        u.id,
        u.first_name,
        u.last_name,
        u.email,
        u.phone,
        u.role,
        u.is_active,
        u.created_at,
        u.updated_at,

        rp.vehicle_type,
        rp.vehicle_plate,
        rp.address,
        rp.city,
        rp.postal_code,
        rp.emergency_contact_name,
        rp.emergency_contact_phone,
        rp.emergency_contact_relationship,
        u.avatar_url,
        u.password_changed_at,
        COALESCE(rp.availability, 'offline') AS availability,
        COALESCE(rp.approval_status, 'pending') AS approval_status,
        rp.rejection_reason,
        rp.approved_at,

        COALESCE(os.deliveries, 0) AS deliveries,
        COALESCE(os.active_orders, 0) AS active_orders,
        rs.rating::float AS rating,
        COALESCE(rs.rating_count, 0) AS rating_count

    FROM users u
    ${RIDER_STATS_JOIN}
`;

const RIDER_ORDER_SELECT = `
    SELECT
        o.id,
        o.order_number,
        o.restaurant_id,
        r.name AS restaurant_name,
        r.location_name AS restaurant_location_name,
        r.address AS restaurant_address,
        r.city AS restaurant_city,
        r.latitude AS restaurant_latitude,
        r.longitude AS restaurant_longitude,
        o.status,
        o.delivery_address,
        o.delivery_city,
        o.delivery_latitude,
        o.delivery_longitude,
        o.recipient_name,
        o.recipient_phone,
        o.delivery_instructions,
        o.total_amount,
        o.delivery_fee,
        p.payment_method,
        p.payment_status,
        p.paid_at,
        o.ready_at,
        o.out_for_delivery_at,
        o.delivered_at,
        o.placed_at
    FROM orders o
    LEFT JOIN restaurants r ON r.id = o.restaurant_id
    LEFT JOIN payments p ON p.order_id = o.id
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

function validateName(value, label) {
    if (typeof value !== "string" || !isValidName(value.trim())) {
        throw apiError(`${label} must contain at least 2 characters`);
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

function validatePhone(value, { required = false } = {}) {
    if (value === undefined || value === null || value === "") {
        if (required) {
            throw apiError("Phone number is required");
        }

        return null;
    }

    if (typeof value !== "string") {
        throw apiError("Please provide a valid phone number");
    }

    const phone = value.trim();

    if (!phone) {
        if (required) {
            throw apiError("Phone number is required");
        }

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

function validateVehicleType(value) {
    if (value === undefined || value === null || value === "") {
        return null;
    }

    const type = String(value).trim().toLowerCase();

    if (!VEHICLE_TYPES.includes(type)) {
        throw apiError("Vehicle type must be motorcycle, bicycle or car");
    }

    return type;
}

function validateVehiclePlate(value) {
    if (value === undefined || value === null || value === "") {
        return null;
    }

    const plate = String(value).trim().toUpperCase();

    if (plate.length < 2 || plate.length > 30) {
        throw apiError("Vehicle plate must be between 2 and 30 characters");
    }

    return plate;
}

function validateDate(value, label) {
    if (value === undefined || value === null || value === "") {
        return null;
    }

    const text = String(value).trim();

    if (!/^\d{4}-\d{2}-\d{2}$/.test(text) || Number.isNaN(Date.parse(text))) {
        throw apiError(`${label} must be a date in YYYY-MM-DD format`);
    }

    return text;
}

/*
 * Accepts either first_name + last_name or a single full_name
 * (the current Add Rider form only has "Full Name").
 */
function resolveNames(data, { required }) {
    if (hasField(data, "full_name")) {
        const parts = String(data.full_name ?? "").trim().split(/\s+/).filter(Boolean);

        if (parts.length < 2) {
            throw apiError("Full name must include a first and last name");
        }

        return {
            firstName: validateName(parts[0], "First name"),
            lastName: validateName(parts.slice(1).join(" "), "Last name")
        };
    }

    if (!required && !hasField(data, "first_name") && !hasField(data, "last_name")) {
        return {};
    }

    const names = {};

    if (required || hasField(data, "first_name")) {
        names.firstName = validateName(data.first_name, "First name");
    }

    if (required || hasField(data, "last_name")) {
        names.lastName = validateName(data.last_name, "Last name");
    }

    return names;
}

/*
 * Readable temporary password, e.g. "Rider-7f3a9c21".
 * Returned once to the admin so it can be shared with the rider.
 */
function generateTemporaryPassword() {
    return `Rider-${crypto.randomBytes(4).toString("hex")}`;
}

function escapeLike(value) {
    return value.replace(/[\\%_]/g, "\\$&");
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
            // Preserve the original error.
        }

        throw error;
    } finally {
        client.release();
    }
}

/*
 * Builds the WHERE clause shared by the list and the export.
 */
function buildRiderFilters(options = {}) {
    const search = String(options.search ?? "").trim();
    const status = String(options.status ?? "all").trim().toLowerCase();

    if (!RIDER_STATUS_FILTERS.includes(status)) {
        throw apiError(`Invalid status. Use ${RIDER_STATUS_FILTERS.join(", ")}`);
    }

    const vehicleType = validateVehicleType(options.vehicle_type);
    const joinedFrom = validateDate(options.joined_from, "joined_from");
    const joinedTo = validateDate(options.joined_to, "joined_to");

    if (joinedFrom && joinedTo && joinedFrom > joinedTo) {
        throw apiError("joined_from cannot be after joined_to");
    }

    const values = [];
    const conditions = ["u.role = 'rider'"];

    if (search) {
        values.push(`%${escapeLike(search)}%`);
        const p = `$${values.length}`;

        // Lets admins search "12", "#12" or "RD012" to find rider 12.
        const idDigits = search.replace(/^(#|rd)/i, "");
        values.push(/^\d+$/.test(idDigits) ? idDigits.replace(/^0+(?=\d)/, "") : null);
        const idParam = `$${values.length}`;

        conditions.push(`(
            u.first_name ILIKE ${p} ESCAPE '\\'
            OR u.last_name ILIKE ${p} ESCAPE '\\'
            OR CONCAT(u.first_name, ' ', u.last_name) ILIKE ${p} ESCAPE '\\'
            OR u.email ILIKE ${p} ESCAPE '\\'
            OR COALESCE(u.phone, '') ILIKE ${p} ESCAPE '\\'
            OR COALESCE(rp.vehicle_plate, '') ILIKE ${p} ESCAPE '\\'
            OR u.id::text = ${idParam}::text
        )`);
    }

    const statusConditions = {
        all: null,
        active: "u.is_active = TRUE",
        inactive: "u.is_active = FALSE",
        online: `u.is_active = TRUE
                 AND COALESCE(rp.approval_status, 'pending') = 'approved'
                 AND COALESCE(rp.availability, 'offline') IN ('available', 'on_delivery')`,
        available: `u.is_active = TRUE
                    AND COALESCE(rp.approval_status, 'pending') = 'approved'
                    AND COALESCE(rp.availability, 'offline') = 'available'`,
        on_delivery: `u.is_active = TRUE
                      AND COALESCE(rp.approval_status, 'pending') = 'approved'
                      AND COALESCE(rp.availability, 'offline') = 'on_delivery'`,
        offline: `u.is_active = TRUE
                  AND COALESCE(rp.approval_status, 'pending') = 'approved'
                  AND COALESCE(rp.availability, 'offline') = 'offline'`,
        pending: "COALESCE(rp.approval_status, 'pending') = 'pending'",
        approved: "COALESCE(rp.approval_status, 'pending') = 'approved'",
        rejected: "COALESCE(rp.approval_status, 'pending') = 'rejected'"
    };

    if (statusConditions[status]) {
        conditions.push(`(${statusConditions[status]})`);
    }

    if (vehicleType) {
        values.push(vehicleType);
        conditions.push(`rp.vehicle_type = $${values.length}`);
    }

    if (joinedFrom) {
        values.push(joinedFrom);
        conditions.push(`u.created_at >= $${values.length}::date`);
    }

    if (joinedTo) {
        values.push(joinedTo);
        conditions.push(`u.created_at < ($${values.length}::date + INTERVAL '1 day')`);
    }

    const sortKey = String(options.sort ?? "newest").trim().toLowerCase();

    if (!RIDER_SORTS[sortKey]) {
        throw apiError(`Invalid sort. Use ${Object.keys(RIDER_SORTS).join(", ")}`);
    }

    return {
        where: conditions.join(" AND "),
        values,
        orderBy: RIDER_SORTS[sortKey]
    };
}

/*
|--------------------------------------------------------------------------
| Admin - list, view, summary, export
|--------------------------------------------------------------------------
*/

/*
 * GET /api/riders
 *
 * Query: search, status, vehicle_type, joined_from, joined_to,
 *        sort (newest | oldest | name | deliveries | rating),
 *        page (default 1), limit (default 10, max 100)
 */
async function getRiders(options = {}) {
    const { where, values, orderBy } = buildRiderFilters(options);

    const limit = Math.min(100, Math.max(1, Number.parseInt(options.limit, 10) || 10));
    const page = Math.max(1, Number.parseInt(options.page, 10) || 1);
    const offset = (page - 1) * limit;

    const countResult = await pool.query(
        `
        SELECT COUNT(*)::int AS total
        FROM users u
        LEFT JOIN rider_profiles rp ON rp.user_id = u.id
        WHERE ${where}
        `,
        values
    );

    const totalItems = countResult.rows[0].total;

    const dataResult = await pool.query(
        `
        ${RIDER_SELECT}
        WHERE ${where}
        ORDER BY ${orderBy}
        LIMIT $${values.length + 1}
        OFFSET $${values.length + 2}
        `,
        [...values, limit, offset]
    );

    const summary = await getRiderSummary();

    return {
        riders: dataResult.rows,
        pagination: {
            page,
            limit,
            totalItems,
            totalPages: Math.max(1, Math.ceil(totalItems / limit))
        },
        statistics: {
            total: summary.total,
            active: summary.active,
            inactive: summary.inactive,
            online: summary.online,
            available: summary.available,
            onDelivery: summary.onDelivery,
            offline: summary.offline,
            pendingApproval: summary.pendingApproval
        }
    };
}

/*
 * GET /api/riders/summary
 *
 * Stat cards, "Rider Status" panel and performance panel.
 * Rates are percentages (0-100) or null when there is no data yet.
 */
async function getRiderSummary() {
    const countsResult = await pool.query(
        `
        SELECT
            COUNT(*)::int AS total,
            COUNT(*) FILTER (WHERE u.is_active)::int AS active,
            COUNT(*) FILTER (WHERE NOT u.is_active)::int AS inactive,

            COUNT(*) FILTER (
                WHERE u.is_active
                  AND COALESCE(rp.approval_status, 'pending') = 'approved'
                  AND COALESCE(rp.availability, 'offline') IN ('available', 'on_delivery')
            )::int AS online,

            COUNT(*) FILTER (
                WHERE u.is_active
                  AND COALESCE(rp.approval_status, 'pending') = 'approved'
                  AND COALESCE(rp.availability, 'offline') = 'available'
            )::int AS available,

            COUNT(*) FILTER (
                WHERE u.is_active
                  AND COALESCE(rp.approval_status, 'pending') = 'approved'
                  AND COALESCE(rp.availability, 'offline') = 'on_delivery'
            )::int AS on_delivery,

            COUNT(*) FILTER (
                WHERE u.is_active
                  AND COALESCE(rp.approval_status, 'pending') = 'approved'
                  AND COALESCE(rp.availability, 'offline') = 'offline'
            )::int AS offline,

            COUNT(*) FILTER (
                WHERE COALESCE(rp.approval_status, 'pending') = 'pending'
            )::int AS pending_approval

        FROM users u
        LEFT JOIN rider_profiles rp ON rp.user_id = u.id
        WHERE u.role = 'rider'
        `
    );

    /*
     * Completion: delivered / (delivered + cancelled after a rider was assigned).
     * On-time:    delivered on or before estimated_delivery_at
     *             (only orders that have an estimate are counted).
     */
    const performanceResult = await pool.query(
        `
        SELECT
            COUNT(*) FILTER (WHERE status = 'delivered')::int AS delivered,
            COUNT(*) FILTER (WHERE status = 'cancelled')::int AS cancelled,

            COUNT(*) FILTER (
                WHERE status = 'delivered'
                  AND estimated_delivery_at IS NOT NULL
            )::int AS with_estimate,

            COUNT(*) FILTER (
                WHERE status = 'delivered'
                  AND estimated_delivery_at IS NOT NULL
                  AND delivered_at <= estimated_delivery_at
            )::int AS on_time
        FROM orders
        WHERE rider_id IS NOT NULL
        `
    );

    const ratingResult = await pool.query(
        `
        SELECT
            ROUND(AVG(rv.rider_rating)::numeric, 1)::float AS average_rating,
            COUNT(rv.rider_rating)::int AS rating_count
        FROM reviews rv
        JOIN orders o ON o.id = rv.order_id
        WHERE rv.rider_rating IS NOT NULL
          AND o.rider_id IS NOT NULL
        `
    );

    const counts = countsResult.rows[0];
    const performance = performanceResult.rows[0];
    const rating = ratingResult.rows[0];

    const finished = performance.delivered + performance.cancelled;

    const percent = (part, whole) =>
        whole > 0 ? Number(((part / whole) * 100).toFixed(1)) : null;

    return {
        total: counts.total,
        active: counts.active,
        inactive: counts.inactive,
        online: counts.online,
        available: counts.available,
        onDelivery: counts.on_delivery,
        offline: counts.offline,
        pendingApproval: counts.pending_approval,

        deliveryCompletionRate: percent(performance.delivered, finished),
        onTimeRate: percent(performance.on_time, performance.with_estimate),
        averageRating: rating.average_rating,
        ratingCount: rating.rating_count
    };
}

/*
 * GET /api/riders/:id
 */
async function getRiderById(id) {
    const riderId = validateId(id, "Rider ID");

    const result = await pool.query(
        `
        ${RIDER_SELECT}
        WHERE u.id = $1
          AND u.role = 'rider'
        LIMIT 1
        `,
        [riderId]
    );

    const rider = result.rows[0];

    if (!rider) {
        return null;
    }

    const recentResult = await pool.query(
        `
        ${RIDER_ORDER_SELECT}
        WHERE o.rider_id = $1
        ORDER BY o.placed_at DESC, o.id DESC
        LIMIT 10
        `,
        [riderId]
    );

    rider.recent_deliveries = recentResult.rows;

    return rider;
}

/*
 * GET /api/riders/export
 *
 * Same filters as the list, no pagination (max 5000 rows).
 * Returns CSV text.
 */
async function exportRiders(options = {}) {
    const { where, values, orderBy } = buildRiderFilters(options);

    const result = await pool.query(
        `
        ${RIDER_SELECT}
        WHERE ${where}
        ORDER BY ${orderBy}
        LIMIT 5000
        `,
        values
    );

    const headers = [
        "ID",
        "First name",
        "Last name",
        "Email",
        "Phone",
        "Vehicle type",
        "Vehicle plate",
        "Deliveries",
        "Rating",
        "Availability",
        "Approval",
        "Account",
        "Joined"
    ];

    const csvCell = (value) => {
        if (value === null || value === undefined) return "";

        let text = value instanceof Date ? value.toISOString() : String(value);

        // Stop spreadsheet formula injection.
        if (/^[=+\-@]/.test(text)) text = `'${text}`;

        return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
    };

    const lines = result.rows.map((rider) =>
        [
            rider.id,
            rider.first_name,
            rider.last_name,
            rider.email,
            rider.phone,
            rider.vehicle_type,
            rider.vehicle_plate,
            rider.deliveries,
            rider.rating,
            rider.availability,
            rider.approval_status,
            rider.is_active ? "active" : "inactive",
            rider.created_at
        ]
            .map(csvCell)
            .join(",")
    );

    return [headers.join(","), ...lines].join("\r\n");
}

/*
|--------------------------------------------------------------------------
| Admin - create, update, activate, deactivate
|--------------------------------------------------------------------------
*/

/*
 * POST /api/riders
 *
 * Body:
 *   full_name  OR  first_name + last_name     (required)
 *   email                                      (required)
 *   phone                                      (required)
 *   vehicle_type   motorcycle | bicycle | car  (optional)
 *   vehicle_plate                              (optional)
 *   password                                   (optional; generated if missing)
 *
 * New riders start with approval_status = 'pending'.
 * If no password was sent, the generated one is returned once
 * as temporary_password.
 */
async function createRider(input) {
    const data = requireObject(input);

    checkAllowedFields(data, [
        "full_name",
        "first_name",
        "last_name",
        "email",
        "phone",
        "password",
        "vehicle_type",
        "vehicle_plate",
        "role"
    ]);

    if (data.role !== undefined && data.role !== "rider") {
        throw apiError("This endpoint can only create rider accounts");
    }

    const { firstName, lastName } = resolveNames(data, { required: true });
    const email = validateEmail(data.email);
    const phone = validatePhone(data.phone, { required: true });
    const vehicleType = validateVehicleType(data.vehicle_type);
    const vehiclePlate = validateVehiclePlate(data.vehicle_plate);

    const passwordWasGenerated =
        data.password === undefined || data.password === null || data.password === "";

    const password = passwordWasGenerated
        ? generateTemporaryPassword()
        : validatePassword(data.password);

    const passwordHash = await bcrypt.hash(password, 12);

    const riderId = await inTransaction(async (client) => {
        const userResult = await client.query(
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
            VALUES ($1, $2, $3, $4, $5, 'rider', TRUE)
            RETURNING id
            `,
            [firstName, lastName, email, phone, passwordHash]
        );

        const id = userResult.rows[0].id;

        await client.query(
            `
            INSERT INTO rider_profiles (
                user_id,
                vehicle_type,
                vehicle_plate,
                availability,
                approval_status
            )
            VALUES ($1, $2, $3, 'offline', 'pending')
            `,
            [id, vehicleType, vehiclePlate]
        );

        return id;
    });

    const rider = await getRiderById(riderId);

    return {
        rider,
        temporaryPassword: passwordWasGenerated ? password : null
    };
}

/*
 * PUT /api/riders/:id
 *
 * Any of: full_name | first_name | last_name, email, phone,
 *         password, vehicle_type, vehicle_plate
 */
async function updateRider(id, input) {
    const riderId = validateId(id, "Rider ID");
    const data = requireObject(input);

    checkAllowedFields(data, [
        "full_name",
        "first_name",
        "last_name",
        "email",
        "phone",
        "password",
        "vehicle_type",
        "vehicle_plate"
    ]);

    const userAssignments = [];
    const userValues = [];

    function addUserAssignment(column, value) {
        userValues.push(value);
        userAssignments.push(`${column} = $${userValues.length}`);
    }

    const { firstName, lastName } = resolveNames(data, { required: false });

    if (firstName !== undefined) addUserAssignment("first_name", firstName);
    if (lastName !== undefined) addUserAssignment("last_name", lastName);

    if (hasField(data, "email")) {
        addUserAssignment("email", validateEmail(data.email));
    }

    if (hasField(data, "phone")) {
        addUserAssignment("phone", validatePhone(data.phone, { required: true }));
    }

    if (hasField(data, "password")) {
        const passwordHash = await bcrypt.hash(validatePassword(data.password), 12);
        addUserAssignment("password_hash", passwordHash);
    }

    const profileFields = {};

    if (hasField(data, "vehicle_type")) {
        profileFields.vehicle_type = validateVehicleType(data.vehicle_type);
    }

    if (hasField(data, "vehicle_plate")) {
        profileFields.vehicle_plate = validateVehiclePlate(data.vehicle_plate);
    }

    if (userAssignments.length === 0 && Object.keys(profileFields).length === 0) {
        throw apiError("Provide at least one rider field to update");
    }

    const found = await inTransaction(async (client) => {
        const existing = await client.query(
            `
            SELECT id
            FROM users
            WHERE id = $1
              AND role = 'rider'
            FOR UPDATE
            `,
            [riderId]
        );

        if (existing.rows.length === 0) {
            return false;
        }

        if (userAssignments.length > 0) {
            userValues.push(riderId);

            await client.query(
                `
                UPDATE users
                SET ${userAssignments.join(", ")},
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = $${userValues.length}
                  AND role = 'rider'
                `,
                userValues
            );
        }

        if (Object.keys(profileFields).length > 0) {
            await client.query(
                `
                INSERT INTO rider_profiles (user_id, vehicle_type, vehicle_plate)
                VALUES ($1, $2, $3)
                ON CONFLICT (user_id) DO UPDATE
                SET
                    vehicle_type = CASE WHEN $4 THEN EXCLUDED.vehicle_type
                                        ELSE rider_profiles.vehicle_type END,
                    vehicle_plate = CASE WHEN $5 THEN EXCLUDED.vehicle_plate
                                         ELSE rider_profiles.vehicle_plate END
                `,
                [
                    riderId,
                    profileFields.vehicle_type ?? null,
                    profileFields.vehicle_plate ?? null,
                    hasField(profileFields, "vehicle_type"),
                    hasField(profileFields, "vehicle_plate")
                ]
            );
        }

        return true;
    });

    return found ? getRiderById(riderId) : null;
}

/*
 * DELETE /api/riders/:id
 *
 * Soft delete: disables the account and sets the rider offline.
 * Orders keep their rider_id for history.
 */
async function deactivateRider(id) {
    const riderId = validateId(id, "Rider ID");

    const found = await inTransaction(async (client) => {
        const riderResult = await client.query(
            `
            SELECT id
            FROM users
            WHERE id = $1
              AND role = 'rider'
            FOR UPDATE
            `,
            [riderId]
        );

        if (riderResult.rows.length === 0) {
            return false;
        }

        const assignedOrders = await client.query(
            `
            SELECT id
            FROM orders
            WHERE rider_id = $1
              AND status IN ('ready', 'out_for_delivery')
            FOR UPDATE
            `,
            [riderId]
        );

        if (assignedOrders.rows.length > 0) {
            throw apiError(
                "Unassign or reassign this rider's active orders before deactivation",
                409
            );
        }

        await client.query(
            `
            UPDATE users
            SET is_active = FALSE,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = $1
              AND role = 'rider'
            `,
            [riderId]
        );

        await client.query(
            `
            UPDATE rider_profiles
            SET availability = 'offline'
            WHERE user_id = $1
            `,
            [riderId]
        );

        return true;
    });

    return found ? getRiderById(riderId) : null;
}

/*
 * PATCH /api/riders/:id/activate
 */
async function activateRider(id) {
    const riderId = validateId(id, "Rider ID");

    const result = await pool.query(
        `
        UPDATE users
        SET is_active = TRUE,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $1
          AND role = 'rider'
        RETURNING id
        `,
        [riderId]
    );

    return result.rows.length > 0 ? getRiderById(riderId) : null;
}

/*
|--------------------------------------------------------------------------
| Admin - approval
|--------------------------------------------------------------------------
*/

/*
 * PATCH /api/riders/:id/approve
 */
async function approveRider(id) {
    const riderId = validateId(id, "Rider ID");

    const found = await inTransaction(async (client) => {
        const riderResult = await client.query(
            `
            SELECT u.id, COALESCE(rp.approval_status, 'pending') AS approval_status
            FROM users u
            LEFT JOIN rider_profiles rp ON rp.user_id = u.id
            WHERE u.id = $1
              AND u.role = 'rider'
            FOR UPDATE OF u
            `,
            [riderId]
        );

        if (riderResult.rows.length === 0) {
            return false;
        }

        if (riderResult.rows[0].approval_status === "approved") {
            throw apiError("Rider is already approved", 409);
        }

        await client.query(
            `
            INSERT INTO rider_profiles (user_id, approval_status, approved_at, rejection_reason)
            VALUES ($1, 'approved', CURRENT_TIMESTAMP, NULL)
            ON CONFLICT (user_id) DO UPDATE
            SET approval_status = 'approved',
                approved_at = CURRENT_TIMESTAMP,
                rejection_reason = NULL
            `,
            [riderId]
        );

        return true;
    });

    return found ? getRiderById(riderId) : null;
}

/*
 * PATCH /api/riders/:id/reject
 *
 * Body: { reason?: string }
 */
async function rejectRider(id, input = {}) {
    const riderId = validateId(id, "Rider ID");
    const data = input && typeof input === "object" ? input : {};

    const reason = data.reason === undefined || data.reason === null
        ? null
        : String(data.reason).trim().slice(0, 500) || null;

    const found = await inTransaction(async (client) => {
        const riderResult = await client.query(
            `
            SELECT id
            FROM users
            WHERE id = $1
              AND role = 'rider'
            FOR UPDATE
            `,
            [riderId]
        );

        if (riderResult.rows.length === 0) {
            return false;
        }

        const activeOrders = await client.query(
            `
            SELECT id
            FROM orders
            WHERE rider_id = $1
              AND status IN ('ready', 'out_for_delivery')
            LIMIT 1
            `,
            [riderId]
        );

        if (activeOrders.rows.length > 0) {
            throw apiError("Rider has active orders and cannot be rejected", 409);
        }

        await client.query(
            `
            INSERT INTO rider_profiles (user_id, approval_status, availability, rejection_reason, approved_at)
            VALUES ($1, 'rejected', 'offline', $2, NULL)
            ON CONFLICT (user_id) DO UPDATE
            SET approval_status = 'rejected',
                availability = 'offline',
                rejection_reason = $2,
                approved_at = NULL
            `,
            [riderId, reason]
        );

        return true;
    });

    return found ? getRiderById(riderId) : null;
}

/*
|--------------------------------------------------------------------------
| Rider - availability
|--------------------------------------------------------------------------
*/

/*
 * PATCH /api/riders/me/availability
 *
 * Body: { availability: "available" | "offline" }
 * on_delivery is set automatically by the delivery flow.
 */
async function updateMyAvailability(riderId, input) {
    const validatedRiderId = validateId(riderId, "Rider ID");
    const data = requireObject(input);

    checkAllowedFields(data, ["availability"]);

    const availability = String(data.availability ?? "").trim().toLowerCase();

    if (!["available", "offline"].includes(availability)) {
        throw apiError("Availability must be available or offline");
    }

    await inTransaction(async (client) => {
        const riderResult = await client.query(
            `
            SELECT
                u.is_active,
                COALESCE(rp.approval_status, 'pending') AS approval_status,
                COALESCE(rp.availability, 'offline') AS availability
            FROM users u
            LEFT JOIN rider_profiles rp ON rp.user_id = u.id
            WHERE u.id = $1
              AND u.role = 'rider'
            FOR UPDATE OF u
            `,
            [validatedRiderId]
        );

        if (riderResult.rows.length === 0) {
            throw apiError("Rider not found", 404);
        }

        const rider = riderResult.rows[0];

        if (rider.approval_status !== "approved") {
            throw apiError("Your rider account has not been approved yet", 403);
        }

        if (rider.availability === "on_delivery") {
            throw apiError("Finish your current delivery before changing availability", 409);
        }

        await client.query(
            `
            INSERT INTO rider_profiles (user_id, availability)
            VALUES ($1, $2)
            ON CONFLICT (user_id) DO UPDATE
            SET availability = EXCLUDED.availability
            `,
            [validatedRiderId, availability]
        );
    });

    return getRiderById(validatedRiderId);
}

/*
|--------------------------------------------------------------------------
| Order assignment and delivery flow
|--------------------------------------------------------------------------
*/

async function assignOrder(orderId, riderId) {
    const validatedOrderId = validateId(orderId, "Order ID");
    const validatedRiderId = validateId(riderId, "Rider ID");

    return inTransaction(async (client) => {
        const riderResult = await client.query(
            `
            SELECT u.id, COALESCE(rp.approval_status, 'pending') AS approval_status
            FROM users u
            LEFT JOIN rider_profiles rp ON rp.user_id = u.id
            WHERE u.id = $1
              AND u.role = 'rider'
              AND u.is_active = TRUE
            FOR UPDATE OF u
            `,
            [validatedRiderId]
        );

        if (riderResult.rows.length === 0) {
            throw apiError("Active rider not found", 404);
        }

        if (riderResult.rows[0].approval_status !== "approved") {
            throw apiError("Only approved riders can be assigned orders", 409);
        }

        const orderResult = await client.query(
            `
            SELECT id, status
            FROM orders
            WHERE id = $1
            FOR UPDATE
            `,
            [validatedOrderId]
        );

        if (orderResult.rows.length === 0) {
            throw apiError("Order not found", 404);
        }

        if (orderResult.rows[0].status !== "ready") {
            throw apiError("Only ready orders can be assigned to a rider", 409);
        }

        const result = await client.query(
            `
            UPDATE orders
            SET rider_id = $1,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = $2
            RETURNING id, order_number, status, rider_id, updated_at
            `,
            [validatedRiderId, validatedOrderId]
        );

        return result.rows[0];
    });
}

async function unassignOrder(orderId) {
    const validatedOrderId = validateId(orderId, "Order ID");

    return inTransaction(async (client) => {
        const orderResult = await client.query(
            `
            SELECT id, status, rider_id
            FROM orders
            WHERE id = $1
            FOR UPDATE
            `,
            [validatedOrderId]
        );

        if (orderResult.rows.length === 0) {
            throw apiError("Order not found", 404);
        }

        const order = orderResult.rows[0];

        if (order.status !== "ready") {
            throw apiError("Only ready orders can be unassigned", 409);
        }

        if (order.rider_id === null) {
            throw apiError("Order has no assigned rider", 409);
        }

        const result = await client.query(
            `
            UPDATE orders
            SET rider_id = NULL,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = $1
            RETURNING id, order_number, status, rider_id, updated_at
            `,
            [validatedOrderId]
        );

        return result.rows[0];
    });
}

async function updateMyLocation(riderId, data) {
    const validatedRiderId = validateId(riderId, "Rider ID");
    requireObject(data);
    checkAllowedFields(data, ["latitude", "longitude", "accuracy"]);
    const latitude = Number(data.latitude);
    const longitude = Number(data.longitude);
    const accuracy = data.accuracy == null ? null : Number(data.accuracy);
    if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) throw apiError("Latitude must be between -90 and 90");
    if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) throw apiError("Longitude must be between -180 and 180");
    if (accuracy !== null && (!Number.isFinite(accuracy) || accuracy < 0 || accuracy > 100000)) throw apiError("Location accuracy is invalid");
    const result = await pool.query(`
        INSERT INTO rider_profiles (user_id, current_latitude, current_longitude, location_accuracy_m, location_updated_at)
        VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
        ON CONFLICT (user_id) DO UPDATE
        SET current_latitude = EXCLUDED.current_latitude,
            current_longitude = EXCLUDED.current_longitude,
            location_accuracy_m = EXCLUDED.location_accuracy_m,
            location_updated_at = CURRENT_TIMESTAMP
        RETURNING current_latitude, current_longitude, location_accuracy_m, location_updated_at
    `, [validatedRiderId, latitude, longitude, accuracy]);
    return result.rows[0];
}

async function getRiderOrders(riderId) {
    const validatedRiderId = validateId(riderId, "Rider ID");

    const result = await pool.query(
        `
        ${RIDER_ORDER_SELECT}
        WHERE o.rider_id = $1
        ORDER BY o.placed_at DESC, o.id DESC
        `,
        [validatedRiderId]
    );

    return result.rows;
}

async function getRiderOrderById(orderId, riderId) {
    const validatedOrderId = validateId(orderId, "Order ID");
    const validatedRiderId = validateId(riderId, "Rider ID");

    const result = await pool.query(
        `
        ${RIDER_ORDER_SELECT}
        WHERE o.rider_id = $1
          AND o.id = $2
        LIMIT 1
        `,
        [validatedRiderId, validatedOrderId]
    );

    return result.rows[0] || null;
}

/*
 * Rider marks an order out_for_delivery or delivered.
 * Availability follows automatically:
 *   out_for_delivery -> on_delivery
 *   delivered        -> available (if no other order is out for delivery)
 */
async function updateRiderOrderStatus(orderId, riderId, newStatus) {
    const validatedOrderId = validateId(orderId, "Order ID");
    const validatedRiderId = validateId(riderId, "Rider ID");

    const transitions = {
        out_for_delivery: {
            from: "ready",
            timestampColumn: "out_for_delivery_at"
        },
        delivered: {
            from: "out_for_delivery",
            timestampColumn: "delivered_at"
        }
    };

    const transition = transitions[newStatus];

    if (!transition) {
        throw apiError("Invalid rider order status");
    }

    return inTransaction(async (client) => {
        const orderResult = await client.query(
            `
            SELECT id, order_number, status, rider_id
            FROM orders
            WHERE id = $1
              AND rider_id = $2
            FOR UPDATE
            `,
            [validatedOrderId, validatedRiderId]
        );

        if (orderResult.rows.length === 0) {
            throw apiError("Assigned order not found", 404);
        }

        const order = orderResult.rows[0];

        if (order.status !== transition.from) {
            throw apiError(
                `Cannot change order status from ${order.status} to ${newStatus}`,
                409
            );
        }

        const result = await client.query(
            `
            UPDATE orders
            SET status = $1,
                ${transition.timestampColumn} = CURRENT_TIMESTAMP,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = $2
              AND rider_id = $3
            RETURNING
                id,
                order_number,
                status,
                rider_id,
                out_for_delivery_at,
                delivered_at,
                updated_at
            `,
            [newStatus, validatedOrderId, validatedRiderId]
        );

        if (newStatus === "out_for_delivery") {
            await client.query(
                `
                INSERT INTO rider_profiles (user_id, availability)
                VALUES ($1, 'on_delivery')
                ON CONFLICT (user_id) DO UPDATE
                SET availability = 'on_delivery'
                `,
                [validatedRiderId]
            );
        } else {
            await client.query(
                `
                UPDATE rider_profiles
                SET availability = 'available'
                WHERE user_id = $1
                  AND availability = 'on_delivery'
                  AND NOT EXISTS (
                      SELECT 1
                      FROM orders
                      WHERE rider_id = $1
                        AND status = 'out_for_delivery'
                  )
                `,
                [validatedRiderId]
            );
        }

        return result.rows[0];
    });
}

/*
 * Confirm cash collection for an order assigned to this rider.
 * Payment confirmation is allowed only after delivery is marked complete.
 */
async function markRiderCashPaymentComplete(orderId, riderId) {
    const validatedOrderId = validateId(orderId, "Order ID");
    const validatedRiderId = validateId(riderId, "Rider ID");

    return inTransaction(async (client) => {
        const result = await client.query(
            `
            SELECT o.id, o.status AS order_status,
                   p.id AS payment_id, p.payment_method, p.payment_status
            FROM orders o
            LEFT JOIN payments p ON p.order_id = o.id
            WHERE o.id = $1 AND o.rider_id = $2
            FOR UPDATE OF o
            `,
            [validatedOrderId, validatedRiderId]
        );

        if (!result.rows.length) throw apiError("Assigned order not found", 404);
        const order = result.rows[0];

        if (order.order_status !== "delivered") {
            throw apiError("Mark the order as delivered before confirming payment", 409);
        }
        if (!order.payment_id) {
            throw apiError("No payment record exists for this order. Ask an administrator to check the order payment.", 409);
        }
        if (String(order.payment_method || "").toLowerCase() !== "cash") {
            throw apiError("Only cash payments can be confirmed by the rider", 409);
        }
        if (order.payment_status === "completed") {
            throw apiError("This cash payment is already marked complete", 409);
        }
        if (!["pending", "processing"].includes(order.payment_status)) {
            throw apiError(`Cannot complete a payment with status ${order.payment_status}`, 409);
        }

        const updated = await client.query(
            `
            UPDATE payments
            SET payment_status = 'completed',
                paid_at = COALESCE(paid_at, CURRENT_TIMESTAMP),
                updated_at = CURRENT_TIMESTAMP
            WHERE id = $1
            RETURNING id, order_id, payment_method, payment_status, amount, paid_at
            `,
            [order.payment_id]
        );
        return updated.rows[0];
    });
}

/*
|--------------------------------------------------------------------------
| Rider dashboard: available orders
|--------------------------------------------------------------------------
*/

async function getAvailableOrders(riderId) {
    const validatedRiderId = validateId(riderId, "Rider ID");

    const riderResult = await pool.query(
        `
        SELECT
            u.id,
            u.is_active,
            COALESCE(rp.approval_status, 'pending') AS approval_status,
            COALESCE(rp.availability, 'offline') AS availability
        FROM users u
        LEFT JOIN rider_profiles rp ON rp.user_id = u.id
        WHERE u.id = $1
          AND u.role = 'rider'
        LIMIT 1
        `,
        [validatedRiderId]
    );

    const rider = riderResult.rows[0];

    if (!rider) {
        throw apiError("Rider not found", 404);
    }

    if (!rider.is_active || rider.approval_status !== "approved") {
        throw apiError("Your rider account must be active and approved", 403);
    }

    const result = await pool.query(
        `
        ${RIDER_ORDER_SELECT}
        WHERE o.status = 'ready'
          AND o.rider_id IS NULL
        ORDER BY o.ready_at ASC NULLS LAST, o.placed_at ASC, o.id ASC
        `
    );

    return result.rows;
}

/*
|--------------------------------------------------------------------------
| Rider accepts an available order
|--------------------------------------------------------------------------
*/

async function acceptAvailableOrder(orderId, riderId) {
    const validatedOrderId = validateId(orderId, "Order ID");
    const validatedRiderId = validateId(riderId, "Rider ID");

    return inTransaction(async (client) => {
        // Lock the rider record while checking eligibility.
        const riderResult = await client.query(
            `
            SELECT
                u.id,
                u.is_active,
                COALESCE(rp.approval_status, 'pending') AS approval_status,
                COALESCE(rp.availability, 'offline') AS availability
            FROM users u
            LEFT JOIN rider_profiles rp ON rp.user_id = u.id
            WHERE u.id = $1
              AND u.role = 'rider'
            FOR UPDATE OF u
            `,
            [validatedRiderId]
        );

        if (riderResult.rows.length === 0) {
            throw apiError("Rider not found", 404);
        }

        const rider = riderResult.rows[0];

        if (!rider.is_active || rider.approval_status !== "approved") {
            throw apiError("Your rider account must be active and approved", 403);
        }

        if (rider.availability !== "available") {
            throw apiError("You must be online and available to accept an order", 409);
        }

        // Lock the order so two riders cannot claim it simultaneously.
        const orderResult = await client.query(
            `
            SELECT id, status, rider_id
            FROM orders
            WHERE id = $1
            FOR UPDATE
            `,
            [validatedOrderId]
        );

        if (orderResult.rows.length === 0) {
            throw apiError("Order not found", 404);
        }

        const order = orderResult.rows[0];

        if (order.status !== "ready") {
            throw apiError("Only orders ready for pickup can be accepted", 409);
        }

        if (order.rider_id !== null) {
            throw apiError("This order has already been assigned to another rider", 409);
        }

        const updateResult = await client.query(
            `
            UPDATE orders
            SET rider_id = $1,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = $2
              AND status = 'ready'
              AND rider_id IS NULL
            RETURNING id, order_number, restaurant_id, status, rider_id, updated_at
            `,
            [validatedRiderId, validatedOrderId]
        );

        if (updateResult.rows.length === 0) {
            throw apiError("This order is no longer available", 409);
        }

        return updateResult.rows[0];
    });
}



/*
|--------------------------------------------------------------------------
| Rider earnings
|--------------------------------------------------------------------------
| Business rule:
| A rider earns 100% of delivery_fee for each delivered order.
| Orders that have not been delivered are not included in earnings.
*/

async function getMyEarnings(riderId, options = {}) {
    const validatedRiderId = validateId(riderId, "Rider ID");
    const today = "(CURRENT_TIMESTAMP AT TIME ZONE 'Africa/Nairobi')::date";
    const periods = {
        "This Week": { start: "DATE_TRUNC('week', " + today + ")::date", end: "(DATE_TRUNC('week', " + today + ") + INTERVAL '1 week')::date" },
        "This Month": { start: "DATE_TRUNC('month', " + today + ")::date", end: "(DATE_TRUNC('month', " + today + ") + INTERVAL '1 month')::date" },
        "Last Month": { start: "(DATE_TRUNC('month', " + today + ") - INTERVAL '1 month')::date", end: "DATE_TRUNC('month', " + today + ")::date" },
        "Last 3 Months": { start: "(DATE_TRUNC('month', " + today + ") - INTERVAL '2 months')::date", end: "(DATE_TRUNC('month', " + today + ") + INTERVAL '1 month')::date" }
    };
    const requested = String(options.period || "This Week");
    const period = Object.prototype.hasOwnProperty.call(periods, requested) ? requested : "This Week";
    const selected = periods[period];

    // Compare business dates in Africa/Nairobi consistently with the UI.
    const summaryResult = await pool.query(
        `
        SELECT
            COALESCE((SELECT NULLIF(settings #>> '{payments,transactionFee}', '')::numeric FROM admin_settings WHERE id = 1), 0) AS platform_fee_rate,
            COALESCE(SUM(delivery_fee) FILTER (WHERE ((delivered_at AT TIME ZONE 'UTC') AT TIME ZONE 'Africa/Nairobi')::date >= ${today} AND ((delivered_at AT TIME ZONE 'UTC') AT TIME ZONE 'Africa/Nairobi')::date < (${today} + 1)), 0) AS today,
            COALESCE(SUM(delivery_fee) FILTER (WHERE ((delivered_at AT TIME ZONE 'UTC') AT TIME ZONE 'Africa/Nairobi')::date >= ${periods["This Week"].start} AND ((delivered_at AT TIME ZONE 'UTC') AT TIME ZONE 'Africa/Nairobi')::date < ${periods["This Week"].end}), 0) AS this_week,
            COALESCE(SUM(delivery_fee) FILTER (WHERE ((delivered_at AT TIME ZONE 'UTC') AT TIME ZONE 'Africa/Nairobi')::date >= ${periods["This Month"].start} AND ((delivered_at AT TIME ZONE 'UTC') AT TIME ZONE 'Africa/Nairobi')::date < ${periods["This Month"].end}), 0) AS this_month,
            COUNT(*) FILTER (WHERE ((delivered_at AT TIME ZONE 'UTC') AT TIME ZONE 'Africa/Nairobi')::date >= ${periods["This Month"].start} AND ((delivered_at AT TIME ZONE 'UTC') AT TIME ZONE 'Africa/Nairobi')::date < ${periods["This Month"].end}) AS month_deliveries,
            COALESCE(SUM(delivery_fee), 0) AS all_time,
            COUNT(*) AS all_time_deliveries,
            COALESCE(SUM(delivery_fee) FILTER (WHERE ((delivered_at AT TIME ZONE 'UTC') AT TIME ZONE 'Africa/Nairobi')::date >= ${selected.start} AND ((delivered_at AT TIME ZONE 'UTC') AT TIME ZONE 'Africa/Nairobi')::date < ${selected.end}), 0) AS selected_period_earnings,
            COUNT(*) FILTER (WHERE ((delivered_at AT TIME ZONE 'UTC') AT TIME ZONE 'Africa/Nairobi')::date >= ${selected.start} AND ((delivered_at AT TIME ZONE 'UTC') AT TIME ZONE 'Africa/Nairobi')::date < ${selected.end}) AS selected_period_deliveries
        FROM orders
        WHERE rider_id = $1 AND status = 'delivered' AND delivered_at IS NOT NULL
        `,
        [validatedRiderId]
    );
    const summary = summaryResult.rows[0];

    // History is scoped to the selected period and is complete for that period.
    const historyResult = await pool.query(
        `
        SELECT o.id, o.order_number, o.restaurant_id, r.name AS restaurant_name,
               o.status, o.delivery_fee, o.delivered_at
        FROM orders o
        LEFT JOIN restaurants r ON r.id = o.restaurant_id
        WHERE o.rider_id = $1 AND o.status = 'delivered'
          AND o.delivered_at IS NOT NULL
          AND ((o.delivered_at AT TIME ZONE 'UTC') AT TIME ZONE 'Africa/Nairobi')::date >= ${selected.start}
          AND ((o.delivered_at AT TIME ZONE 'UTC') AT TIME ZONE 'Africa/Nairobi')::date < ${selected.end}
        ORDER BY o.delivered_at DESC, o.id DESC
        `,
        [validatedRiderId]
    );

    // Return daily totals for the entire selected period, not just the last week.
    const chartResult = await pool.query(
        `
        WITH bounds AS (
            SELECT ${selected.start} AS start_date, ${selected.end} AS end_date
        ),
        days AS (
            SELECT generate_series(start_date, end_date - 1, INTERVAL '1 day')::date AS earning_date
            FROM bounds
        ),
        daily AS (
            SELECT ((delivered_at AT TIME ZONE 'UTC') AT TIME ZONE 'Africa/Nairobi')::date AS earning_date,
                   COALESCE(SUM(delivery_fee), 0) AS earnings,
                   COUNT(*) AS deliveries
            FROM orders, bounds
            WHERE rider_id = $1 AND status = 'delivered'
              AND delivered_at IS NOT NULL
              AND ((delivered_at AT TIME ZONE 'UTC') AT TIME ZONE 'Africa/Nairobi')::date >= bounds.start_date
              AND ((delivered_at AT TIME ZONE 'UTC') AT TIME ZONE 'Africa/Nairobi')::date < bounds.end_date
            GROUP BY ((delivered_at AT TIME ZONE 'UTC') AT TIME ZONE 'Africa/Nairobi')::date
        )
        SELECT days.earning_date, COALESCE(daily.earnings, 0) AS earnings,
               COALESCE(daily.deliveries, 0) AS deliveries
        FROM days LEFT JOIN daily USING (earning_date)
        ORDER BY days.earning_date ASC
        `,
        [validatedRiderId]
    );

    const allTime = Number(summary.all_time || 0);
    const allTimeDeliveries = Number(summary.all_time_deliveries || 0);
    return {
        currency: "KSh",
        period,
        summary: {
            today: Number(summary.today || 0),
            thisWeek: Number(summary.this_week || 0),
            thisMonth: Number(summary.this_month || 0),
            monthDeliveries: Number(summary.month_deliveries || 0),
            allTime,
            allTimeDeliveries,
            averagePerDelivery: allTimeDeliveries > 0 ? Number((allTime / allTimeDeliveries).toFixed(2)) : 0
        },
        selectedPeriod: {
            earnings: Number(summary.selected_period_earnings || 0),
            deliveries: Number(summary.selected_period_deliveries || 0)
        },
        history: historyResult.rows.map(order => ({ ...order, delivery_fee: Number(order.delivery_fee || 0) })),
        chart: chartResult.rows.map(day => ({
            date: day.earning_date,
            earnings: Number(day.earnings || 0),
            deliveries: Number(day.deliveries || 0)
        }))
    };
}

/*
|--------------------------------------------------------------------------
| PATCH /api/riders/me
|--------------------------------------------------------------------------
| A rider may update only their own basic account details.
| Role, account status, approval, availability, password and vehicle
| details cannot be changed through this endpoint.
*/

async function updateMyProfile(riderId, input) {
    const id = validateId(riderId, "Rider ID");
    const data = requireObject(input);
    const allowed = [
        "first_name", "last_name", "email", "phone",
        "address", "city", "postal_code",
        "vehicle_type", "vehicle_plate",
        "emergency_contact_name", "emergency_contact_phone",
        "emergency_contact_relationship", "avatar_url"
    ];
    checkAllowedFields(data, allowed);
    if (!Object.keys(data).length) throw apiError("Provide at least one profile field to update");

    const userFields = {};
    const profileFields = {};
    const { firstName, lastName } = resolveNames(data, { required: false });
    if (firstName !== undefined) userFields.first_name = firstName;
    if (lastName !== undefined) userFields.last_name = lastName;
    if (hasField(data, "email")) userFields.email = validateEmail(data.email);
    if (hasField(data, "phone")) userFields.phone = validatePhone(data.phone, { required: true });
    if (hasField(data, "avatar_url")) {
        const value = String(data.avatar_url ?? "").trim();
        if (value && (!/^https:\/\//i.test(value) || value.length > 2048)) {
            throw apiError("Profile photo URL must be a valid HTTPS URL");
        }
        userFields.avatar_url = value || null;
    }
    for (const field of ["address", "city", "postal_code", "emergency_contact_name", "emergency_contact_phone", "emergency_contact_relationship"]) {
        if (hasField(data, field)) {
            const value = String(data[field] ?? "").trim();
            if (value.length > (field === "address" ? 250 : 120)) throw apiError(`${field.replaceAll("_", " ")} is too long`);
            profileFields[field] = value || null;
        }
    }
    if (hasField(data, "emergency_contact_name") && profileFields.emergency_contact_name && profileFields.emergency_contact_name.length < 2) throw apiError("Emergency contact name must contain at least 2 characters");
    if (hasField(data, "emergency_contact_phone")) {
        const value = profileFields.emergency_contact_phone;
        if (value && !isValidPhone(value)) throw apiError("Enter a valid emergency contact phone number");
    }
    if (hasField(data, "emergency_contact_relationship")) {
        const value = profileFields.emergency_contact_relationship;
        if (value && !["Spouse", "Parent", "Sibling", "Friend", "Other"].includes(value)) throw apiError("Select a valid emergency contact relationship");
    }
    if (hasField(data, "vehicle_type")) profileFields.vehicle_type = data.vehicle_type ? validateVehicleType(data.vehicle_type) : null;
    if (hasField(data, "vehicle_plate")) profileFields.vehicle_plate = data.vehicle_plate ? validateVehiclePlate(data.vehicle_plate) : null;

    return inTransaction(async (client) => {
        const exists = await client.query("SELECT id FROM users WHERE id = $1 AND role = 'rider' FOR UPDATE", [id]);
        if (!exists.rowCount) return null;
        const userKeys = Object.keys(userFields);
        if (userKeys.length) {
            const values = userKeys.map(key => userFields[key]);
            values.push(id);
            await client.query(
                `UPDATE users SET ${userKeys.map((key, i) => `${key} = $${i + 1}`).join(", ")}, updated_at = CURRENT_TIMESTAMP WHERE id = $${values.length} AND role = 'rider'`,
                values
            );
        }
        if (Object.keys(profileFields).length) {
            const keys = Object.keys(profileFields);
            const values = [id, ...keys.map(key => profileFields[key])];
            const columns = keys.join(", ");
            const placeholders = keys.map((_, i) => `$${i + 2}`).join(", ");
            const updates = keys.map(key => `${key} = EXCLUDED.${key}`).join(", ");
            await client.query(
                `INSERT INTO rider_profiles (user_id, ${columns}) VALUES ($1, ${placeholders}) ON CONFLICT (user_id) DO UPDATE SET ${updates}, updated_at = CURRENT_TIMESTAMP`,
                values
            );
        }
        return true;
    }).then(async (found) => found ? getRiderById(id) : null);
}


module.exports = {
    VEHICLE_TYPES,
    AVAILABILITY_VALUES,
    RIDER_STATUS_FILTERS,

    getRiders,
    getRiderSummary,
    getRiderById,
    exportRiders,
    createRider,
    updateRider,
    deactivateRider,
    activateRider,
    approveRider,
    rejectRider,
    updateMyAvailability,
    updateMyProfile,

    assignOrder,
    unassignOrder,
    getRiderOrders,
    getRiderOrderById,
    updateMyLocation,
    updateRiderOrderStatus,
    markRiderCashPaymentComplete,
    getMyEarnings,

    getAvailableOrders,
    acceptAvailableOrder,
};