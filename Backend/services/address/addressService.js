const pool = require("../../config/database");


/*
 * Get all active addresses belonging to a user.
 */
async function getUserAddresses(userId) {

    const result = await pool.query(
        `
        SELECT
            id,
            user_id,
            label,
            recipient_name,
            phone,
            address_line,
            city,
            latitude,
            longitude,
            delivery_instructions,
            is_default,
            is_active,
            created_at,
            updated_at

        FROM addresses

        WHERE user_id = $1
          AND is_active = true

        ORDER BY
            is_default DESC,
            created_at ASC
        `,
        [userId]
    );

    return result.rows;
}


/*
 * Get one address belonging to a user.
 */
async function getAddressById(userId, addressId) {

    const result = await pool.query(
        `
        SELECT
            id,
            user_id,
            label,
            recipient_name,
            phone,
            address_line,
            city,
            latitude,
            longitude,
            delivery_instructions,
            is_default,
            is_active,
            created_at,
            updated_at

        FROM addresses

        WHERE id = $1
          AND user_id = $2
          AND is_active = true

        LIMIT 1
        `,
        [
            addressId,
            userId
        ]
    );

    return result.rows[0] || null;
}


/*
 * Clear the current default address for a user.
 */
async function clearDefaultAddress(userId) {

    await pool.query(
        `
        UPDATE addresses

        SET is_default = false

        WHERE user_id = $1
          AND is_default = true
        `,
        [userId]
    );
}


/*
 * Create an address.
 */
async function createAddress(userId, data) {

    const {
        label,
        recipient_name,
        phone,
        address_line,
        city,
        latitude,
        longitude,
        delivery_instructions,
        is_default
    } = data;


    /*
     * Required fields.
     */
    if (!label || !label.trim()) {
        throw new Error("Address label is required");
    }

    if (!recipient_name || !recipient_name.trim()) {
        throw new Error("Recipient name is required");
    }

    if (!phone || !phone.trim()) {
        throw new Error("Phone number is required");
    }

    if (!address_line || !address_line.trim()) {
        throw new Error("Address line is required");
    }

    if (!city || !city.trim()) {
        throw new Error("City is required");
    }


    /*
     * Validate latitude if supplied.
     */
    let parsedLatitude = null;

    if (
        latitude !== undefined &&
        latitude !== null &&
        latitude !== ""
    ) {

        parsedLatitude = Number(latitude);

        if (
            !Number.isFinite(parsedLatitude) ||
            parsedLatitude < -90 ||
            parsedLatitude > 90
        ) {
            throw new Error("Latitude must be between -90 and 90");
        }
    }


    /*
     * Validate longitude if supplied.
     */
    let parsedLongitude = null;

    if (
        longitude !== undefined &&
        longitude !== null &&
        longitude !== ""
    ) {

        parsedLongitude = Number(longitude);

        if (
            !Number.isFinite(parsedLongitude) ||
            parsedLongitude < -180 ||
            parsedLongitude > 180
        ) {
            throw new Error("Longitude must be between -180 and 180");
        }
    }


    /*
     * Determine whether this should become
     * the user's default address.
     */
    const makeDefault = Boolean(is_default);


    /*
     * If this address is default, remove the
     * previous default first.
     */
    if (makeDefault) {
        await clearDefaultAddress(userId);
    }


    /*
     * Insert address.
     */
    const result = await pool.query(
        `
        INSERT INTO addresses (
            user_id,
            label,
            recipient_name,
            phone,
            address_line,
            city,
            latitude,
            longitude,
            delivery_instructions,
            is_default
        )

        VALUES (
            $1,
            $2,
            $3,
            $4,
            $5,
            $6,
            $7,
            $8,
            $9,
            $10
        )

        RETURNING
            id,
            user_id,
            label,
            recipient_name,
            phone,
            address_line,
            city,
            latitude,
            longitude,
            delivery_instructions,
            is_default,
            is_active,
            created_at,
            updated_at
        `,
        [
            userId,
            label.trim(),
            recipient_name.trim(),
            phone.trim(),
            address_line.trim(),
            city.trim(),
            parsedLatitude,
            parsedLongitude,
            delivery_instructions
                ? delivery_instructions.trim()
                : null,
            makeDefault
        ]
    );

    return result.rows[0];
}


/*
 * Update an address belonging to the user.
 */
async function updateAddress(userId, addressId, data) {

    const {
        label,
        recipient_name,
        phone,
        address_line,
        city,
        latitude,
        longitude,
        delivery_instructions,
        is_default
    } = data;


    /*
     * Check ownership.
     */
    const existingAddress = await getAddressById(
        userId,
        addressId
    );

    if (!existingAddress) {
        throw new Error(
            "Address not found or you do not have permission to modify it"
        );
    }


    /*
     * Validate supplied latitude.
     */
    let parsedLatitude = latitude;

    if (
        latitude !== undefined &&
        latitude !== null &&
        latitude !== ""
    ) {

        parsedLatitude = Number(latitude);

        if (
            !Number.isFinite(parsedLatitude) ||
            parsedLatitude < -90 ||
            parsedLatitude > 90
        ) {
            throw new Error("Latitude must be between -90 and 90");
        }
    }


    /*
     * Validate supplied longitude.
     */
    let parsedLongitude = longitude;

    if (
        longitude !== undefined &&
        longitude !== null &&
        longitude !== ""
    ) {

        parsedLongitude = Number(longitude);

        if (
            !Number.isFinite(parsedLongitude) ||
            parsedLongitude < -180 ||
            parsedLongitude > 180
        ) {
            throw new Error("Longitude must be between -180 and 180");
        }
    }


    /*
     * If explicitly changing this address
     * to default, clear the previous default.
     */
    if (is_default === true) {
        await clearDefaultAddress(userId);
    }


    /*
     * Update only supplied fields.
     */
    const result = await pool.query(
        `
        UPDATE addresses

        SET
            label = COALESCE($1, label),
            recipient_name = COALESCE($2, recipient_name),
            phone = COALESCE($3, phone),
            address_line = COALESCE($4, address_line),
            city = COALESCE($5, city),
            latitude = COALESCE($6, latitude),
            longitude = COALESCE($7, longitude),
            delivery_instructions = COALESCE(
                $8,
                delivery_instructions
            ),
            is_default = COALESCE(
                $9,
                is_default
            )

        WHERE id = $10
          AND user_id = $11
          AND is_active = true

        RETURNING
            id,
            user_id,
            label,
            recipient_name,
            phone,
            address_line,
            city,
            latitude,
            longitude,
            delivery_instructions,
            is_default,
            is_active,
            created_at,
            updated_at
        `,
        [
            label !== undefined
                ? label.trim()
                : null,

            recipient_name !== undefined
                ? recipient_name.trim()
                : null,

            phone !== undefined
                ? phone.trim()
                : null,

            address_line !== undefined
                ? address_line.trim()
                : null,

            city !== undefined
                ? city.trim()
                : null,

            parsedLatitude,

            parsedLongitude,

            delivery_instructions !== undefined
                ? delivery_instructions.trim()
                : null,

            is_default !== undefined
                ? Boolean(is_default)
                : null,

            addressId,
            userId
        ]
    );


    if (result.rows.length === 0) {
        throw new Error(
            "Address not found or you do not have permission to modify it"
        );
    }


    return result.rows[0];
}


/*
 * Set an address as the user's default address.
 */
async function setDefaultAddress(userId, addressId) {

    const address = await getAddressById(
        userId,
        addressId
    );

    if (!address) {
        throw new Error(
            "Address not found or you do not have permission to modify it"
        );
    }


    /*
     * Clear existing default.
     */
    await clearDefaultAddress(userId);


    /*
     * Set requested address as default.
     */
    const result = await pool.query(
        `
        UPDATE addresses

        SET is_default = true

        WHERE id = $1
          AND user_id = $2
          AND is_active = true

        RETURNING
            id,
            user_id,
            label,
            recipient_name,
            phone,
            address_line,
            city,
            latitude,
            longitude,
            delivery_instructions,
            is_default,
            is_active,
            created_at,
            updated_at
        `,
        [
            addressId,
            userId
        ]
    );

    return result.rows[0];
}


/*
 * Delete an address.
 *
 * We use a soft delete because orders may reference
 * the address through address_id.
 */
async function deleteAddress(userId, addressId) {

    const address = await getAddressById(
        userId,
        addressId
    );

    if (!address) {
        throw new Error(
            "Address not found or you do not have permission to delete it"
        );
    }


    const result = await pool.query(
        `
        UPDATE addresses

        SET
            is_active = false,
            is_default = false

        WHERE id = $1
          AND user_id = $2
          AND is_active = true

        RETURNING
            id,
            user_id,
            label,
            is_default,
            is_active
        `,
        [
            addressId,
            userId
        ]
    );


    return result.rows[0];
}


module.exports = {
    getUserAddresses,
    getAddressById,
    createAddress,
    updateAddress,
    setDefaultAddress,
    deleteAddress
};