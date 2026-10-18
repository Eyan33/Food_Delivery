const adminService = require("../../services/admin/adminService");
const operationsService = require("../../services/admin/adminOperationsService");

function handleError(res, error, fallbackMessage) {
    console.error("Admin API error:", error);

    if (error.code === "23505") {
        return res.status(409).json({
            success: false,
            message: "An account with this email or phone already exists"
        });
    }

    const statusCode = error.statusCode || 500;

    return res.status(statusCode).json({
        success: false,
        message: statusCode < 500
            ? error.message
            : fallbackMessage
    });
}

async function getAdmins(req, res) {
    try {
        const result = await adminService.getAdmins({
            search: req.query.search,
            status: req.query.status,
            page: req.query.page,
            limit: req.query.limit
        });

        return res.status(200).json({
            success: true,
            data: {
                admins: result.admins,
                pagination: result.pagination,
                statistics: result.statistics
            }
        });
    } catch (error) {
        return handleError(res, error, "Failed to retrieve admins");
    }
}

async function getMe(req, res) {
    try {
        const admin = await adminService.getAdminById(req.user.id);

        if (!admin) {
            return res.status(404).json({
                success: false,
                message: "Admin not found"
            });
        }

        return res.status(200).json({
            success: true,
            data: {
                admin
            }
        });
    } catch (error) {
        return handleError(res, error, "Failed to retrieve admin profile");
    }
}

async function getAdmin(req, res) {
    try {
        const admin = await adminService.getAdminById(req.params.id);

        if (!admin) {
            return res.status(404).json({
                success: false,
                message: "Admin not found"
            });
        }

        return res.status(200).json({
            success: true,
            data: {
                admin
            }
        });
    } catch (error) {
        return handleError(res, error, "Failed to retrieve admin");
    }
}

async function createAdmin(req, res) {
    try {
        const admin = await adminService.createAdmin(req.body);

        return res.status(201).json({
            success: true,
            message: "Admin created successfully",
            data: {
                admin
            }
        });
    } catch (error) {
        return handleError(res, error, "Failed to create admin");
    }
}

async function updateAdmin(req, res) {
    try {
        const admin = await adminService.updateAdmin(
            req.params.id,
            req.body
        );

        if (!admin) {
            return res.status(404).json({
                success: false,
                message: "Admin not found"
            });
        }

        return res.status(200).json({
            success: true,
            message: "Admin updated successfully",
            data: {
                admin
            }
        });
    } catch (error) {
        return handleError(res, error, "Failed to update admin");
    }
}

async function updateMyAvatar(req, res) {
    try {
        const avatarUrl = String(req.body?.avatar_url || "").trim();
        let parsed;
        try {
            parsed = new URL(avatarUrl);
        } catch {
            return res.status(400).json({ success: false, message: "Enter a valid HTTPS image URL" });
        }
        if (parsed.protocol !== "https:" || avatarUrl.length > 2048) {
            return res.status(400).json({ success: false, message: "Avatar URL must use HTTPS and be under 2048 characters" });
        }
        const admin = await adminService.updateAdminAvatar(req.user.id, avatarUrl);
        if (!admin) return res.status(404).json({ success: false, message: "Admin not found" });
        return res.status(200).json({ success: true, data: { admin } });
    } catch (error) {
        return handleError(res, error, "Failed to update administrator avatar");
    }
}

async function deactivateAdmin(req, res) {
    try {
        const admin = await adminService.deactivateAdmin(
            req.params.id,
            req.user.id
        );

        if (!admin) {
            return res.status(404).json({
                success: false,
                message: "Admin not found"
            });
        }

        return res.status(200).json({
            success: true,
            message: "Admin deactivated successfully",
            data: {
                admin
            }
        });
    } catch (error) {
        return handleError(res, error, "Failed to deactivate admin");
    }
}

async function activateAdmin(req, res) {
    try {
        const admin = await adminService.activateAdmin(req.params.id);

        if (!admin) {
            return res.status(404).json({
                success: false,
                message: "Admin not found"
            });
        }

        return res.status(200).json({
            success: true,
            message: "Admin activated successfully",
            data: {
                admin
            }
        });
    } catch (error) {
        return handleError(res, error, "Failed to activate admin");
    }
}

async function getDashboard(req, res) {
    try {
        const period = req.query.period || "7d";

        const data = await adminService.getDashboard(
            period,
            req.user
        );

        return res.status(200).json({
            success: true,
            data
        });
    } catch (error) {
        return handleError(res, error, "Failed to load dashboard data");
    }
}

async function getReports(req, res) {
    try {
        const period = req.query.period || "30d";
        const data = await adminService.getReports(period, {
            startDate: req.query.start_date,
            endDate: req.query.end_date
        });

        return res.status(200).json({
            success: true,
            data
        });
    } catch (error) {
        return handleError(res, error, "Failed to load reports data");
    }
}

async function getSettings(req, res) {
    try {
        const data = await operationsService.getSettings();
        return res.status(200).json({ success: true, data });
    } catch (error) {
        return handleError(res, error, "Failed to load platform settings");
    }
}

async function updateSettings(req, res) {
    try {
        const data = await operationsService.updateSettings(req.body, req.user.id);
        return res.status(200).json({ success: true, message: "Settings saved", data });
    } catch (error) {
        return handleError(res, error, "Failed to save platform settings");
    }
}

async function getNotifications(req, res) {
    try {
        const data = await operationsService.getNotifications(req.query);
        return res.status(200).json({ success: true, data });
    } catch (error) {
        return handleError(res, error, "Failed to load notifications");
    }
}

async function markNotificationRead(req, res) {
    try {
        const notification = await operationsService.markNotificationRead(req.params.id);
        if (!notification) return res.status(404).json({ success: false, message: "Notification not found" });
        return res.status(200).json({ success: true, data: { notification } });
    } catch (error) {
        return handleError(res, error, "Failed to update notification");
    }
}

async function markAllNotificationsRead(req, res) {
    try {
        const updated = await operationsService.markAllNotificationsRead();
        return res.status(200).json({ success: true, data: { updated } });
    } catch (error) {
        return handleError(res, error, "Failed to update notifications");
    }
}

async function getAuditLogs(req, res) {
    try {
        const data = await operationsService.getAuditLogs(req.query);
        return res.status(200).json({ success: true, data });
    } catch (error) {
        return handleError(res, error, "Failed to load audit history");
    }
}

async function getReviews(req, res) {
    try {
        const data = await operationsService.getReviews(req.query);
        return res.status(200).json({ success: true, data });
    } catch (error) {
        return handleError(res, error, "Failed to load reviews");
    }
}

async function updateReviewVisibility(req, res) {
    try {
        const { is_visible: isVisible } = req.body || {};
        if (typeof isVisible !== "boolean") {
            return res.status(400).json({ success: false, message: "is_visible must be a boolean" });
        }
        const review = await operationsService.setReviewVisibility(req.params.id, isVisible);
        if (!review) return res.status(404).json({ success: false, message: "Review not found" });
        return res.status(200).json({ success: true, data: { review } });
    } catch (error) {
        return handleError(res, error, "Failed to update review");
    }
}

module.exports = {
    getAdmins,
    getMe,
    updateMyAvatar,
    getAdmin,
    createAdmin,
    updateAdmin,
    deactivateAdmin,
    activateAdmin,
    getDashboard,
    getReports,
    getSettings,
    updateSettings,
    getNotifications,
    markNotificationRead,
    markAllNotificationsRead,
    getAuditLogs,
    getReviews,
    updateReviewVisibility
};
