const { Pool } = require("pg");
require("dotenv").config();

const requiredEnvironment = ["DB_HOST", "DB_NAME", "DB_USER", "DB_PASSWORD"];
const missingEnvironment = requiredEnvironment.filter(
    (key) => !process.env[key]
);

if (missingEnvironment.length > 0) {
    console.error(
        `Missing required database environment variables: ${missingEnvironment.join(", ")}`
    );
}

const sslEnabled = String(process.env.DB_SSL || "").toLowerCase() === "true";

const pool = new Pool({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 5432),
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    ...(sslEnabled ? { ssl: { rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED !== "false" } } : {}),
    connectionTimeoutMillis: Number(process.env.DB_CONNECTION_TIMEOUT_MS || 10000),
    idleTimeoutMillis: Number(process.env.DB_IDLE_TIMEOUT_MS || 30000),
});

pool.on("connect", () => {
    console.log("PostgreSQL connection established.");
});

pool.on("error", (error) => {
    console.error("Unexpected PostgreSQL pool error:", error.message);
});

module.exports = pool;
