"use strict";

/*
 * Manual entry point:  npm run db:init
 * (server.js already runs the same logic on startup.)
 */

const { validateEnvironment } = require("../config/env");
const pool = require("../config/database");
const { initializeDatabase } = require("../db/initDatabase");

const { errors } = validateEnvironment();
const blocking = errors.filter((message) => !message.startsWith("JWT_SECRET"));

if (blocking.length > 0) {
    blocking.forEach((message) => console.error(`[config] ${message}`));
    process.exit(1);
}

initializeDatabase()
    .then(() => pool.end())
    .then(() => process.exit(0))
    .catch((error) => {
        console.error("[db-init] failed:", error.internalMessage || error.message);
        process.exit(1);
    });
