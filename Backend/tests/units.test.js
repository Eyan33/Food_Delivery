"use strict";

process.env.NODE_ENV = "production";
// Deterministic "database is down": nothing listens on port 1.
process.env.DATABASE_URL = "postgresql://nobody:nopass@127.0.0.1:1/nodb";
process.env.DB_CONNECTION_TIMEOUT_MS = "2000";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const { createRateLimiter } = require("../middleware/security/rateLimit");
const { prepareSchemaSql, resolveSchemaPath } = require("../db/initDatabase");
const pool = require("../config/database");
const { sanitizeDatabaseError } = pool;

test.after(async () => {
    await pool.end();
});

test("sanitizeDatabaseError hides PostgreSQL details but keeps code and constraint", () => {
    const error = Object.assign(
        new Error('duplicate key value violates unique constraint "users_email_key"'),
        { severity: "ERROR", code: "23505", constraint: "users_email_key", table: "users" },
    );

    const originalLog = console.error;
    console.error = () => {};
    try {
        sanitizeDatabaseError(error);
    } finally {
        console.error = originalLog;
    }

    assert.equal(error.code, "23505");
    assert.equal(error.constraint, "users_email_key");
    assert.doesNotMatch(error.message, /users_email_key|duplicate|constraint/i);
    assert.match(error.internalMessage, /users_email_key/);
});

test("sanitizeDatabaseError leaves application errors untouched", () => {
    const error = new Error("Order not found");
    error.statusCode = 404;

    assert.equal(sanitizeDatabaseError(error).message, "Order not found");
});

test("sanitizeDatabaseError hides connection failures", () => {
    const error = Object.assign(new Error("connect ECONNREFUSED 10.0.3.7:5432"), {
        code: "ECONNREFUSED",
        syscall: "connect",
    });

    const originalLog = console.error;
    console.error = () => {};
    try {
        sanitizeDatabaseError(error);
    } finally {
        console.error = originalLog;
    }

    assert.doesNotMatch(error.message, /10\.0\.3\.7|ECONNREFUSED/);
});

test("rate limiter blocks after max, sets headers, and resets per key", () => {
    const limiter = createRateLimiter({ windowMs: 60000, max: 2, keyGenerator: (req) => req.key });

    function call(key) {
        const headers = {};
        const res = {
            statusCode: 200,
            setHeader: (name, value) => { headers[name] = value; },
            status(code) { this.statusCode = code; return this; },
            json(body) { this.body = body; return this; },
            on() {},
        };
        let passed = false;
        limiter({ key }, res, () => { passed = true; });
        return { passed, res, headers };
    }

    assert.equal(call("a").passed, true);
    assert.equal(call("a").passed, true);

    const blocked = call("a");
    assert.equal(blocked.passed, false);
    assert.equal(blocked.res.statusCode, 429);
    assert.equal(blocked.res.body.success, false);
    assert.ok(Number(blocked.headers["Retry-After"]) >= 1);

    assert.equal(call("b").passed, true, "a different key has its own budget");
});

test("rate limiter does not count successful requests when asked", () => {
    const limiter = createRateLimiter({
        windowMs: 60000,
        max: 1,
        skipSuccessfulRequests: true,
        keyGenerator: () => "k",
    });

    function call(statusCode) {
        let onFinish;
        const res = {
            statusCode: 200,
            setHeader() {},
            status(code) { this.statusCode = code; return this; },
            json() { return this; },
            on: (event, cb) => { if (event === "finish") onFinish = cb; },
        };
        let passed = false;
        limiter({}, res, () => { passed = true; });
        if (passed) { res.statusCode = statusCode; onFinish(); }
        return passed;
    }

    for (let i = 0; i < 5; i += 1) {
        assert.equal(call(200), true, `successful attempt ${i + 1} should not be counted`);
    }
    assert.equal(call(401), true, "first failure is allowed");
    assert.equal(call(401), false, "second failure is blocked");
});

test("prepareSchemaSql strips psql meta-commands and transaction_timeout from the real schema", () => {
    const schemaPath = resolveSchemaPath();
    assert.ok(schemaPath && fs.existsSync(schemaPath), "schema file must be found");

    const raw = fs.readFileSync(schemaPath, "utf8");
    assert.match(raw, /^\\restrict/m, "fixture sanity: dump contains \\restrict");
    assert.match(raw, /^SET transaction_timeout/m, "fixture sanity: dump contains transaction_timeout");

    const prepared = prepareSchemaSql(raw);

    assert.doesNotMatch(prepared, /^\\/m);
    assert.doesNotMatch(prepared, /transaction_timeout/);
    assert.match(prepared, /CREATE TABLE public\.users/);
    assert.match(prepared, /CREATE TABLE public\.payments/);
});

test("validateEnvironment enforces production secrets", () => {
    const saved = { ...process.env };
    const reload = () => {
        delete require.cache[require.resolve("../config/env")];
        return require("../config/env");
    };

    try {
        process.env.NODE_ENV = "production";
        process.env.DATABASE_URL = "postgresql://u:p@h:5432/d";

        process.env.JWT_SECRET = "short";
        assert.ok(reload().validateEnvironment().errors.some((m) => /JWT_SECRET/.test(m)));

        process.env.JWT_SECRET = "REPLACE_WITH_A_LONG_RANDOM_SECRET_VALUE_1234567890";
        assert.ok(reload().validateEnvironment().errors.some((m) => /placeholder/.test(m)));

        process.env.JWT_SECRET = require("node:crypto").randomBytes(48).toString("base64url");
        assert.deepEqual(reload().validateEnvironment().errors, []);

        delete process.env.DATABASE_URL;
        for (const key of ["DB_HOST", "DB_NAME", "DB_USER", "DB_PASSWORD"]) delete process.env[key];
        assert.ok(reload().validateEnvironment().errors.some((m) => /Database/.test(m)));

        process.env.DATABASE_URL = "postgresql://u:p@h:5432/d";
        process.env.ADMIN_PASSWORD = "tooshort";
        assert.ok(reload().validateEnvironment().errors.some((m) => /ADMIN_PASSWORD/.test(m)));
    } finally {
        for (const key of Object.keys(process.env)) if (!(key in saved)) delete process.env[key];
        Object.assign(process.env, saved);
    }
});

test("frontend is compatible with the strict CSP (no inline scripts or handlers)", () => {
    const frontend = path.resolve(__dirname, "..", "..", "Frontend");
    const offenders = [];

    (function walk(dir) {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            const full = path.join(dir, entry.name);
            if (entry.isDirectory()) { walk(full); continue; }
            if (!/\.(html|js)$/.test(entry.name)) continue;

            const text = fs.readFileSync(full, "utf8");
            const checks = [
                [/\son(click|change|submit|input|load|error|focus|blur|keyup|keydown)\s*=/i, "inline event handler"],
                [/javascript:/i, "javascript: URL"],
            ];
            if (entry.name.endsWith(".html")) {
                checks.push([/<script(?![^>]*\bsrc=)[^>]*>\s*\S/i, "inline <script>"]);
            }
            for (const [pattern, label] of checks) {
                if (pattern.test(text)) offenders.push(`${path.relative(frontend, full)}: ${label}`);
            }
        }
    })(frontend);

    assert.deepEqual(offenders, []);
});

test("pool.query failures reach callers without connection details", async () => {
    const originalLog = console.error;
    console.error = () => {};

    let caught;
    try {
        await pool.query("SELECT 1");
    } catch (error) {
        caught = error;
    } finally {
        console.error = originalLog;
    }

    assert.ok(caught, "query against an unreachable database must reject");
    assert.doesNotMatch(caught.message, /127\.0\.0\.1|ECONNREFUSED|nodb|nobody/);
    assert.ok(caught.internalMessage, "original message is kept for server-side logging");
});

test("pool.connect() clients are sanitized too (transaction code path)", async () => {
    const originalLog = console.error;
    console.error = () => {};

    let caught;
    try {
        const client = await pool.connect();
        try {
            await client.query("SELECT 1");
        } finally {
            client.release();
        }
    } catch (error) {
        caught = error;
    } finally {
        console.error = originalLog;
    }

    assert.ok(caught, "must reject");
    assert.doesNotMatch(caught.message, /127\.0\.0\.1|ECONNREFUSED|nodb|nobody|relation|column/);
});
