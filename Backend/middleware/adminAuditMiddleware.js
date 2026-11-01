"use strict";

const { recordAuditLog } = require("../services/admin/adminOperationsService");

const SENSITIVE_KEY = /pass(word)?|token|secret|authorization|credential/i;
const MAX_DETAILS_LENGTH = 4000;
const MAX_DEPTH = 4;

/*
 * Copy of the request body that is safe to store: secrets are replaced by
 * "[redacted]" and large values are cut, so the audit trail shows WHAT was
 * changed (for example which setting) without recording credentials.
 */
function redact(value, depth = 0) {
    if (value === null || value === undefined) {
        return value;
    }

    if (typeof value === "string") {
        return value.length > 300 ? `${value.slice(0, 300)}…` : value;
    }

    if (typeof value !== "object") {
        return value;
    }

    if (depth >= MAX_DEPTH) {
        return "[truncated]";
    }

    if (Array.isArray(value)) {
        return value.slice(0, 20).map((item) => redact(item, depth + 1));
    }

    const output = {};

    for (const [key, item] of Object.entries(value)) {
        output[key] = SENSITIVE_KEY.test(key)
            ? "[redacted]"
            : redact(item, depth + 1);
    }

    return output;
}

function buildDetails(req) {
    const body = req.body;

    if (!body || typeof body !== "object" || Object.keys(body).length === 0) {
        return null;
    }

    const details = { body: redact(body) };

    return JSON.stringify(details).length > MAX_DETAILS_LENGTH
        ? { body: "[too large to store]" }
        : details;
}

function auditAdminAction(req, res, next) {
    if (["POST", "PUT", "PATCH", "DELETE"].includes(req.method)) {
        res.on("finish", () => {
            recordAuditLog({
                adminId: req.user?.id,
                adminRole: req.user?.role,
                method: req.method,
                resource: req.originalUrl.split("?")[0],
                statusCode: res.statusCode,
                details: buildDetails(req),
            }).catch((error) => {
                console.error("Failed to record admin action:", error.message);
            });
        });
    }

    next();
}

module.exports = auditAdminAction;
module.exports.redact = redact;
