"use strict";

const { recordAuditLog } = require("../services/admin/adminOperationsService");

function auditAdminAction(req, res, next) {
    if (req.user?.role === "admin" && ["POST", "PUT", "PATCH", "DELETE"].includes(req.method)) {
        res.on("finish", () => {
            recordAuditLog({
                adminId: req.user?.id,
                method: `${req.method} ${req.route?.path || req.path}`,
                resource: req.originalUrl.split("?")[0],
                statusCode: res.statusCode,
            }).catch((error) => {
                console.error("Failed to record admin action:", error.message);
            });
        });
    }

    next();
}

module.exports = auditAdminAction;
