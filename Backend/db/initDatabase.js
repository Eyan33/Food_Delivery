"use strict";

/*
 * First-run database setup, safe to run on every start.
 *
 *  1. Waits for PostgreSQL to accept connections (Render may still be
 *     provisioning the database during the very first deploy).
 *  2. Applies food_delivery_schema.sql ONLY when the database is empty
 *     (no public.users table). Existing data is never touched.
 *  3. Optionally creates the first admin account from ADMIN_EMAIL and
 *     ADMIN_PASSWORD. An existing account is never modified.
 *
 * Set DB_AUTO_INIT=false to skip all of this.
 */

const fs = require("fs");
const path = require("path");
const bcrypt = require("bcrypt");

const pool = require("../config/database");
const { normalizeEmail, isValidEmail } = require("../utils/auth/validators");

// Arbitrary constant: serialises schema creation if two instances boot together.
const SCHEMA_LOCK_ID = 727274;

function log(message) {
    console.log(`[db-init] ${message}`);
}

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function resolveSchemaPath() {
    if (process.env.SCHEMA_PATH) {
        return path.resolve(process.env.SCHEMA_PATH);
    }

    return [
        path.resolve(__dirname, "..", "..", "food_delivery_schema.sql"),
        path.resolve(__dirname, "schema.sql"),
    ].find((candidate) => fs.existsSync(candidate));
}

/*
 * The provided schema is a pg_dump file. Two things in it cannot be sent
 * through a normal driver connection:
 *   - psql meta-commands such as \restrict / \unrestrict
 *   - "SET transaction_timeout", which only exists on PostgreSQL 17+
 *     (it is set to 0, the default, so dropping it changes nothing)
 */
function prepareSchemaSql(rawSql) {
    return String(rawSql)
        .split(/\r?\n/)
        .filter((line) => !line.startsWith("\\"))
        .filter((line) => !/^SET\s+transaction_timeout\b/i.test(line))
        .join("\n");
}

async function waitForDatabase({ attempts = 10, delayMs = 5000 } = {}) {
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
        try {
            await pool.query("SELECT 1");
            return;
        } catch (error) {
            if (attempt === attempts) {
                throw error;
            }

            log(
                `database not ready (attempt ${attempt}/${attempts}), retrying in ${delayMs / 1000}s`,
            );
            await sleep(delayMs);
        }
    }
}

async function ensureSchema() {
    const client = await pool.connect();

    try {
        await client.query("SELECT pg_advisory_lock($1)", [SCHEMA_LOCK_ID]);

        const existing = await client.query(
            "SELECT to_regclass('public.users') AS users_table",
        );

        if (existing.rows[0].users_table) {
            log("schema already present, leaving existing data untouched");
            return false;
        }

        const schemaPath = resolveSchemaPath();

        if (!schemaPath) {
            throw new Error(
                "food_delivery_schema.sql was not found. Set SCHEMA_PATH or keep the file at the repository root.",
            );
        }

        log(`empty database detected, applying schema from ${schemaPath}`);

        // One multi-statement query runs as a single implicit transaction:
        // either the whole schema is created or nothing is.
        await client.query(prepareSchemaSql(fs.readFileSync(schemaPath, "utf8")));

        log("schema applied");
        return true;
    } finally {
        try {
            await client.query("SELECT pg_advisory_unlock($1)", [SCHEMA_LOCK_ID]);
        } catch (error) {
            // The connection is destroyed below anyway, which also frees the lock.
        }

        // The dump changes this session's search_path, so never hand the
        // connection back to the pool.
        client.release(true);
    }
}

async function seedAdmin() {
    const email = normalizeEmail(process.env.ADMIN_EMAIL);
    const password = process.env.ADMIN_PASSWORD;

    if (!email && !password) {
        return;
    }

    if (!email || !password) {
        log("ADMIN_EMAIL and ADMIN_PASSWORD must both be set, skipping admin creation");
        return;
    }

    if (!isValidEmail(email)) {
        throw new Error("ADMIN_EMAIL is not a valid email address");
    }

    if (password.length < 12) {
        throw new Error("ADMIN_PASSWORD must be at least 12 characters");
    }

    const existing = await pool.query(
        "SELECT id, role FROM users WHERE email = $1 LIMIT 1",
        [email],
    );

    if (existing.rows.length > 0) {
        if (existing.rows[0].role !== "admin") {
            log(`account ${email} already exists and is not an admin, leaving it unchanged`);
        } else {
            log("admin account already exists, nothing to do");
        }

        return;
    }

    const passwordHash = await bcrypt.hash(password, 12);

    await pool.query(
        `
        INSERT INTO users (first_name, last_name, email, phone, password_hash, role)
        VALUES ($1, $2, $3, $4, $5, 'admin')
        `,
        [
            (process.env.ADMIN_FIRST_NAME || "Platform").trim(),
            (process.env.ADMIN_LAST_NAME || "Admin").trim(),
            email,
            process.env.ADMIN_PHONE ? String(process.env.ADMIN_PHONE).trim() : null,
            passwordHash,
        ],
    );

    log(`admin account created for ${email}. Remove ADMIN_PASSWORD from the environment now.`);
}

async function initializeDatabase() {
    await waitForDatabase();
    await ensureSchema();
    await seedAdmin();
}

module.exports = {
    initializeDatabase,
    prepareSchemaSql,
    resolveSchemaPath,
};
