const auditAdminAction = require("../adminAuditMiddleware");

function authorizeRoles(...allowedRoles) {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({
                success: false,
                message: "Authentication required"
            });
        }

        // Privileged roles must be listed explicitly by each route. This
        // prevents a future admin-only route from silently granting access
        // to the super admin without a deliberate authorization decision.
        const roleIsAllowed = allowedRoles.includes(req.user.role);

        if (!roleIsAllowed) {
            return res.status(403).json({
                success: false,
                message: "You do not have permission to access this resource"
            });
        }

        if (req.user.role === "admin" || req.user.role === "super_admin") {
            auditAdminAction(req, res, () => {});
        }

        return next();
    };
}

module.exports = authorizeRoles;
