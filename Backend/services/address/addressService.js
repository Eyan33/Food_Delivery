const pool = require("../../config/database");

function validationError(message, statusCode = 400) {
    const error = new Error(message);
    error.statusCode = statusCode;
    return error;
}

function requiredText(value, label) {
    if (typeof value !== "string" || !value.trim()) {
        throw validationError(label + " is required");
    }
    return value.trim();
}

function optionalText(value, label) {
    if (value === undefined) return undefined;
    if (value === null || value === "") return null;
    if (typeof value !== "string") throw validationError(label + " must be text");
    return value.trim() || null;
}

function optionalCoordinate(value, label, min, max) {
    if (value === undefined) return undefined;
    if (value === null || value === "") return null;
    const number = Number(value);
    if (!Number.isFinite(number) || number < min || number > max) {
        throw validationError(label + " must be between " + min + " and " + max);
    }
    return number;
}

function normalizeAddressInput(data, partial = false) {
    const result = {};
    const fields = [
        ["label", "Address label"],
        ["recipient_name", "Recipient name"],
        ["phone", "Phone number"],
        ["address_line", "Address line"],
        ["city", "City"]
    ];

    for (const [key, label] of fields) {
        if (partial && data[key] === undefined) continue;
        result[key] = requiredText(data[key], label);
    }

    if (result.phone !== undefined) {
        const digits = result.phone.replace(/\D/g, "");
        if (!/^[0-9+()\s.-]+$/.test(result.phone) || digits.length < 7 || digits.length > 15) {
            throw validationError("Please enter a valid phone number");
        }
    }

    const latitude = optionalCoordinate(data.latitude, "Latitude", -90, 90);
    const longitude = optionalCoordinate(data.longitude, "Longitude", -180, 180);
    if (latitude !== undefined) result.latitude = latitude;
    if (longitude !== undefined) result.longitude = longitude;

    const instructions = optionalText(data.delivery_instructions, "Delivery instructions");
    if (instructions !== undefined) result.delivery_instructions = instructions;

    if (data.is_default !== undefined) {
        if (typeof data.is_default !== "boolean" && data.is_default !== "true" && data.is_default !== "false") {
            throw validationError("Default address setting must be true or false");
        }
        result.is_default = data.is_default === true || data.is_default === "true";
    }

    return result;
}

async function withUserTransaction(userId, work) {
    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        // Serialize address mutations for this user without relying on a schema-specific user table.
        await client.query("SELECT pg_advisory_xact_lock(hashtext($1::text))", [String(userId)]);
        const result = await work(client);
        await client.query("COMMIT");
        return result;
    } catch (error) {
        try { await client.query("ROLLBACK"); } catch (rollbackError) {
            console.error("Address transaction rollback failed:", rollbackError);
        }
        throw error;
    } finally {
        client.release();
    }
}

const addressColumns = `
    id, user_id, label, recipient_name, phone, address_line, city,
    latitude, longitude, delivery_instructions, is_default, is_active,
    created_at, updated_at
`;

async function getUserAddresses(userId) {
    const result = await pool.query(
        `SELECT ${addressColumns} FROM addresses
         WHERE user_id = $1 AND is_active = true
         ORDER BY is_default DESC, created_at ASC`,
        [userId]
    );
    return result.rows;
}

async function getAddressById(userId, addressId) {
    const result = await pool.query(
        `SELECT ${addressColumns} FROM addresses
         WHERE id = $1 AND user_id = $2 AND is_active = true LIMIT 1`,
        [addressId, userId]
    );
    return result.rows[0] || null;
}

async function createAddress(userId, data = {}) {
    const input = normalizeAddressInput(data);
    return withUserTransaction(userId, async client => {
        const count = await client.query(
            "SELECT COUNT(*)::int AS count FROM addresses WHERE user_id = $1 AND is_active = true",
            [userId]
        );
        const makeDefault = input.is_default === true || count.rows[0].count === 0;
        if (makeDefault) {
            await client.query(
                "UPDATE addresses SET is_default = false WHERE user_id = $1 AND is_default = true",
                [userId]
            );
        }
        const result = await client.query(
            `INSERT INTO addresses (
                user_id, label, recipient_name, phone, address_line, city,
                latitude, longitude, delivery_instructions, is_default
             ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
             RETURNING ${addressColumns}`,
            [
                userId, input.label, input.recipient_name, input.phone,
                input.address_line, input.city,
                input.latitude ?? null, input.longitude ?? null,
                input.delivery_instructions ?? null, makeDefault
            ]
        );
        return result.rows[0];
    });
}

async function updateAddress(userId, addressId, data = {}) {
    const input = normalizeAddressInput(data, true);
    return withUserTransaction(userId, async client => {
        const existing = await client.query(
            `SELECT ${addressColumns} FROM addresses
             WHERE id = $1 AND user_id = $2 AND is_active = true FOR UPDATE`,
            [addressId, userId]
        );
        if (!existing.rows[0]) throw validationError("Address not found", 404);

        if (input.is_default === true) {
            await client.query(
                "UPDATE addresses SET is_default = false WHERE user_id = $1 AND is_default = true",
                [userId]
            );
        }

        const keys = [
            "label", "recipient_name", "phone", "address_line", "city",
            "latitude", "longitude", "delivery_instructions", "is_default"
        ];
        const assignments = [];
        const values = [];
        for (const key of keys) {
            if (input[key] === undefined) continue;
            values.push(input[key]);
            assignments.push(key + " = $" + values.length);
        }
        if (!assignments.length) return existing.rows[0];

        values.push(addressId, userId);
        const result = await client.query(
            `UPDATE addresses SET ${assignments.join(", ")}
             WHERE id = $${values.length - 1} AND user_id = $${values.length} AND is_active = true
             RETURNING ${addressColumns}`,
            values
        );
        if (!result.rows[0]) throw validationError("Address not found", 404);
        return result.rows[0];
    });
}

async function setDefaultAddress(userId, addressId) {
    return withUserTransaction(userId, async client => {
        const target = await client.query(
            "SELECT id FROM addresses WHERE id = $1 AND user_id = $2 AND is_active = true FOR UPDATE",
            [addressId, userId]
        );
        if (!target.rows[0]) throw validationError("Address not found", 404);

        await client.query(
            "UPDATE addresses SET is_default = false WHERE user_id = $1 AND is_default = true",
            [userId]
        );
        const result = await client.query(
            `UPDATE addresses SET is_default = true
             WHERE id = $1 AND user_id = $2 AND is_active = true
             RETURNING ${addressColumns}`,
            [addressId, userId]
        );
        return result.rows[0];
    });
}

async function deleteAddress(userId, addressId) {
    return withUserTransaction(userId, async client => {
        const target = await client.query(
            `SELECT ${addressColumns} FROM addresses
             WHERE id = $1 AND user_id = $2 AND is_active = true FOR UPDATE`,
            [addressId, userId]
        );
        const address = target.rows[0];
        if (!address) throw validationError("Address not found", 404);

        const result = await client.query(
            `UPDATE addresses SET is_active = false, is_default = false
             WHERE id = $1 AND user_id = $2 AND is_active = true
             RETURNING id, user_id, label, is_default, is_active`,
            [addressId, userId]
        );

        if (address.is_default) {
            const replacement = await client.query(
                `SELECT id FROM addresses
                 WHERE user_id = $1 AND is_active = true
                 ORDER BY created_at ASC, id ASC LIMIT 1 FOR UPDATE`,
                [userId]
            );
            if (replacement.rows[0]) {
                await client.query(
                    "UPDATE addresses SET is_default = true WHERE id = $1 AND user_id = $2",
                    [replacement.rows[0].id, userId]
                );
            }
        }
        return result.rows[0];
    });
}

module.exports = {
    getUserAddresses,
    getAddressById,
    createAddress,
    updateAddress,
    setDefaultAddress,
    deleteAddress
};
