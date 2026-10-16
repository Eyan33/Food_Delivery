const adminService = require("../../services/admin/adminService");

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
        const data = await adminService.getReports(period);

        return res.status(200).json({
            success: true,
            data
        });
    } catch (error) {
        return handleError(res, error, "Failed to load reports data");
    }
}

module.exports = {
    getAdmins,
    getMe,
    getAdmin,
    createAdmin,
    updateAdmin,
    deactivateAdmin,
    activateAdmin,
    getDashboard,
    getReports
};
