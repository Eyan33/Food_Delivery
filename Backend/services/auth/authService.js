const bcrypt = require("bcrypt");

const pool = require('../../config/database');
const generateToken = require("../../utils/auth/generateToken");

const {
    normalizeEmail,
    isValidEmail,
    isValidPassword,
    isValidName,
    isValidPhone
} = require("../../utils/auth/validators");


async function registerUser({
    first_name,
    last_name,
    email,
    phone,
    password
}) {
    const firstName = String(first_name || "").trim();
    const lastName = String(last_name || "").trim();
    const normalizedEmail = normalizeEmail(email);

    const normalizedPhone = phone
        ? String(phone).trim()
        : null;


    // Validate first name
    if (!isValidName(firstName)) {
        throw new Error(
            "First name must contain at least 2 characters"
        );
    }


    // Validate last name
    if (!isValidName(lastName)) {
        throw new Error(
            "Last name must contain at least 2 characters"
        );
    }


    // Validate email
    if (!isValidEmail(normalizedEmail)) {
        throw new Error(
            "Please provide a valid email address"
        );
    }


    // Validate phone
    if (!isValidPhone(normalizedPhone)) {
        throw new Error(
            "Please provide a valid phone number"
        );
    }


    // Validate password
    if (!isValidPassword(password)) {
        throw new Error(
            "Password must contain at least 8 characters"
        );
    }


    /*
     * Public registration always creates a customer.
     *
     * Admin and restaurant accounts should not be created
     * by simply sending a different role in the request.
     */
    const role = "customer";


    /*
     * Check whether email or phone already exists.
     *
     * Explicit VARCHAR casting on $2 prevents PostgreSQL
     * from being unable to determine the parameter type when
     * phone is null.
     */
    const existingUser = await pool.query(
        `
        SELECT id
        FROM users
        WHERE email = $1
           OR ($2::VARCHAR IS NOT NULL AND phone = $2::VARCHAR)
        LIMIT 1
        `,
        [
            normalizedEmail,
            normalizedPhone
        ]
    );


    if (existingUser.rows.length > 0) {
        throw new Error(
            "An account with this email or phone already exists"
        );
    }


    /*
     * Hash the password before storing it.
     */
    const passwordHash = await bcrypt.hash(
        password,
        12
    );


    /*
     * Create the user.
     */
    const result = await pool.query(
        `
        INSERT INTO users (
            first_name,
            last_name,
            email,
            phone,
            password_hash,
            role
        )
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING
            id,
            first_name,
            last_name,
            email,
            phone,
            role,
            is_active,
            created_at,
            updated_at
        `,
        [
            firstName,
            lastName,
            normalizedEmail,
            normalizedPhone,
            passwordHash,
            role
        ]
    );


    const user = result.rows[0];


    /*
     * Generate JWT.
     */
    const token = generateToken(user);


    return {
        user,
        token
    };
}


async function loginUser({
    email,
    password
}) {
    const normalizedEmail = normalizeEmail(email);


    if (!isValidEmail(normalizedEmail)) {
        throw new Error(
            "Please provide a valid email address"
        );
    }


    if (!password) {
        throw new Error(
            "Password is required"
        );
    }


    /*
     * Find user by email.
     */
    const result = await pool.query(
        `
        SELECT
            id,
            first_name,
            last_name,
            email,
            phone,
            password_hash,
            role,
            is_active,
            created_at,
            updated_at
        FROM users
        WHERE email = $1
        LIMIT 1
        `,
        [normalizedEmail]
    );


    if (result.rows.length === 0) {
        throw new Error(
            "Invalid email or password"
        );
    }


    const user = result.rows[0];


    /*
     * Check whether account is active.
     */
    if (!user.is_active) {
        throw new Error(
            "This account has been deactivated"
        );
    }


    /*
     * Compare supplied password with bcrypt hash.
     */
    const passwordMatches = await bcrypt.compare(
        password,
        user.password_hash
    );


    if (!passwordMatches) {
        throw new Error(
            "Invalid email or password"
        );
    }


    /*
     * Never return the password hash.
     */
    delete user.password_hash;


    /*
     * Generate JWT.
     */
    const token = generateToken(user);


    return {
        user,
        token
    };
}


async function getCurrentUser(userId) {
    const result = await pool.query(
        `
        SELECT
            id,
            first_name,
            last_name,
            email,
            phone,
            role,
            is_active,
            created_at,
            updated_at
        FROM users
        WHERE id = $1
        LIMIT 1
        `,
        [userId]
    );


    if (result.rows.length === 0) {
        throw new Error(
            "User not found"
        );
    }


    const user = result.rows[0];


    if (!user.is_active) {
        throw new Error(
            "This account has been deactivated"
        );
    }


    return user;
}


async function updateCurrentUser(userId, input = {}) {
    const allowedFields = ["first_name", "last_name", "email", "phone"];

    if (!input || typeof input !== "object" || Array.isArray(input)) {
        throw new Error("Request body must be a JSON object");
    }

    for (const field of Object.keys(input)) {
        if (!allowedFields.includes(field)) {
            throw new Error(`Field "${field}" is not allowed`);
        }
    }

    const assignments = [];
    const values = [];

    const addField = (column, value) => {
        values.push(value);
        assignments.push(`${column} = $${values.length}`);
    };

    if (Object.prototype.hasOwnProperty.call(input, "first_name")) {
        const value = String(input.first_name || "").trim();
        if (!isValidName(value)) {
            throw new Error("First name must contain at least 2 characters");
        }
        addField("first_name", value);
    }

    if (Object.prototype.hasOwnProperty.call(input, "last_name")) {
        const value = String(input.last_name || "").trim();
        if (!isValidName(value)) {
            throw new Error("Last name must contain at least 2 characters");
        }
        addField("last_name", value);
    }

    if (Object.prototype.hasOwnProperty.call(input, "email")) {
        const value = normalizeEmail(input.email);
        if (!isValidEmail(value)) {
            throw new Error("Please provide a valid email address");
        }
        addField("email", value);
    }

    if (Object.prototype.hasOwnProperty.call(input, "phone")) {
        const value = input.phone == null ? "" : String(input.phone).trim();

        if (value && !isValidPhone(value)) {
            throw new Error("Please provide a valid phone number");
        }

        addField("phone", value || null);
    }

    if (assignments.length === 0) {
        throw new Error("Provide at least one profile field to update");
    }

    values.push(userId);

    const result = await pool.query(
        `UPDATE users
         SET ${assignments.join(", ")}, updated_at = CURRENT_TIMESTAMP
         WHERE id = $${values.length}
         RETURNING id, first_name, last_name, email, phone, role,
                   is_active, created_at, updated_at`,
        values
    );

    if (!result.rows.length) {
        throw new Error("User not found");
    }

    return result.rows[0];
}

async function changeCurrentUserPassword(userId, currentPassword, newPassword) {
    if (typeof currentPassword !== "string" || !currentPassword) {
        throw new Error("Current password is required");
    }

    if (!isValidPassword(newPassword)) {
        throw new Error("New password must contain at least 8 characters");
    }

    if (currentPassword === newPassword) {
        throw new Error("Your new password must be different from your current password");
    }

    const result = await pool.query(
        `SELECT password_hash FROM users WHERE id = $1 LIMIT 1`,
        [userId]
    );

    if (!result.rows.length) {
        throw new Error("User not found");
    }

    const matches = await bcrypt.compare(
        currentPassword,
        result.rows[0].password_hash
    );

    if (!matches) {
        throw new Error("Your current password is incorrect");
    }

    const passwordHash = await bcrypt.hash(newPassword, 12);

    await pool.query(
        `UPDATE users
         SET password_hash = $1, password_changed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
         WHERE id = $2`,
        [passwordHash, userId]
    );

    return true;
}


module.exports = {
    registerUser,
    loginUser,
    getCurrentUser,
    updateCurrentUser,
    changeCurrentUserPassword
};