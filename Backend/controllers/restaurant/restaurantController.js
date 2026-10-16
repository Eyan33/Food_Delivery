const restaurantService = require("../../services/restaurant/restaurantService");


function handleError(res, error, fallbackMessage) {
    console.error("Restaurant API error:", error);

    if (error.code === "23505") {
        return res.status(409).json({
            success: false,
            message:
                "An account with this email or phone already exists"
        });
    }

    const statusCode =
        error.statusCode || 500;

    return res.status(statusCode).json({
        success: false,
        message:
            statusCode < 500
                ? error.message
                : fallbackMessage
    });
}


/*
 * =========================================================
 * RESTAURANT OWNER
 * =========================================================
 */

async function getMyRestaurant(req, res) {
    try {
        const restaurant =
            await restaurantService.getRestaurantByOwnerId(
                req.user.id
            );

        if (!restaurant) {
            return res.status(404).json({
                success: false,
                message:
                    "Restaurant profile not found"
            });
        }

        return res.status(200).json({
            success: true,
            data: {
                restaurant
            }
        });

    } catch (error) {
        return handleError(
            res,
            error,
            "Failed to retrieve restaurant"
        );
    }
}


async function getRestaurant(req, res) {
    try {
        const restaurant =
            await restaurantService.getRestaurantById(
                req.params.id
            );

        if (!restaurant) {
            return res.status(404).json({
                success: false,
                message:
                    "Restaurant not found"
            });
        }

        return res.status(200).json({
            success: true,
            data: {
                restaurant
            }
        });

    } catch (error) {
        return handleError(
            res,
            error,
            "Failed to retrieve restaurant"
        );
    }
}


async function getRestaurants(req, res) {
    try {
        const restaurants =
            await restaurantService.getAllRestaurants();

        return res.status(200).json({
            success: true,
            data: {
                restaurants
            }
        });

    } catch (error) {
        return handleError(
            res,
            error,
            "Failed to retrieve restaurants"
        );
    }
}


async function createRestaurant(req, res) {
    try {
        const restaurant =
            await restaurantService.createRestaurant(
                req.user.id,
                req.body
            );

        return res.status(201).json({
            success: true,
            message:
                "Restaurant created successfully",
            data: {
                restaurant
            }
        });

    } catch (error) {
        return handleError(
            res,
            error,
            "Failed to create restaurant"
        );
    }
}


async function updateRestaurant(req, res) {
    try {
        const restaurant =
            await restaurantService.updateRestaurant(
                req.user.id,
                req.body
            );

        if (!restaurant) {
            return res.status(404).json({
                success: false,
                message:
                    "Restaurant profile not found"
            });
        }

        return res.status(200).json({
            success: true,
            message:
                "Restaurant updated successfully",
            data: {
                restaurant
            }
        });

    } catch (error) {
        return handleError(
            res,
            error,
            "Failed to update restaurant"
        );
    }
}


async function updateRestaurantStatus(req, res) {
    try {
        const { is_open } = req.body;

        if (typeof is_open !== "boolean") {
            return res.status(400).json({
                success: false,
                message:
                    "is_open must be a boolean"
            });
        }

        const restaurant =
            await restaurantService.updateRestaurantStatus(
                req.user.id,
                is_open
            );

        return res.status(200).json({
            success: true,
            message: is_open
                ? "Restaurant is now open"
                : "Restaurant is now closed",
            data: {
                restaurant
            }
        });

    } catch (error) {
        return handleError(
            res,
            error,
            "Failed to update restaurant status"
        );
    }
}


/*
 * =========================================================
 * ADMIN
 * =========================================================
 */


/*
 * Admin - Create restaurant + owner
 */
async function createRestaurantAdmin(req, res) {
    try {
        const restaurant =
            await restaurantService.createRestaurantForAdmin(
                req.body
            );

        return res.status(201).json({
            success: true,
            message:
                "Restaurant created successfully",
            data: {
                restaurant
            }
        });

    } catch (error) {
        return handleError(
            res,
            error,
            "Failed to create restaurant"
        );
    }
}


/*
 * Admin - Get all restaurants
 */
async function getAllRestaurantsAdmin(req, res) {
    try {
        const result =
            await restaurantService.getAllRestaurantsForAdmin({
                search: req.query.search,
                status: req.query.status,
                open: req.query.open,
                approval: req.query.approval,
                page: req.query.page,
                limit: req.query.limit
            });

        return res.status(200).json({
            success: true,
            data: {
                restaurants:
                    result.restaurants,

                pagination:
                    result.pagination,

                statistics:
                    result.statistics
            }
        });

    } catch (error) {
        return handleError(
            res,
            error,
            "Failed to retrieve restaurants"
        );
    }
}


/*
 * Admin - Get one restaurant
 */
async function getRestaurantAdmin(req, res) {
    try {
        const restaurant =
            await restaurantService.getRestaurantByIdForAdmin(
                req.params.id
            );

        if (!restaurant) {
            return res.status(404).json({
                success: false,
                message:
                    "Restaurant not found"
            });
        }

        return res.status(200).json({
            success: true,
            data: {
                restaurant
            }
        });

    } catch (error) {
        return handleError(
            res,
            error,
            "Failed to retrieve restaurant"
        );
    }
}


/*
 * Admin - Approve restaurant
 */
async function approveRestaurant(req, res) {
    try {
        const restaurant =
            await restaurantService.approveRestaurant(
                req.params.id,
                req.user.id
            );

        return res.status(200).json({
            success: true,
            message:
                "Restaurant approved successfully",
            data: {
                restaurant
            }
        });

    } catch (error) {
        return handleError(
            res,
            error,
            "Failed to approve restaurant"
        );
    }
}


/*
 * Admin - Reject restaurant
 */
async function rejectRestaurant(req, res) {
    try {
        const restaurant =
            await restaurantService.rejectRestaurant(
                req.params.id,
                req.user.id,
                req.body?.reason
            );

        return res.status(200).json({
            success: true,
            message:
                "Restaurant rejected",
            data: {
                restaurant
            }
        });

    } catch (error) {
        return handleError(
            res,
            error,
            "Failed to reject restaurant"
        );
    }
}


/*
 * Admin - Activate restaurant
 */
async function activateRestaurant(req, res) {
    try {
        const restaurant =
            await restaurantService.activateRestaurant(
                req.params.id
            );

        return res.status(200).json({
            success: true,
            message:
                "Restaurant activated successfully",
            data: {
                restaurant
            }
        });

    } catch (error) {
        return handleError(
            res,
            error,
            "Failed to activate restaurant"
        );
    }
}


/*
 * Admin - Deactivate restaurant
 */
async function deactivateRestaurant(req, res) {
    try {
        const restaurant =
            await restaurantService.deactivateRestaurant(
                req.params.id
            );

        return res.status(200).json({
            success: true,
            message:
                "Restaurant deactivated successfully",
            data: {
                restaurant
            }
        });

    } catch (error) {
        return handleError(
            res,
            error,
            "Failed to deactivate restaurant"
        );
    }
}


/*
 * Admin - Update restaurant + owner account
 */
async function adminUpdateRestaurant(req, res) {
    try {
        const restaurant =
            await restaurantService.adminUpdateRestaurant(
                req.params.id,
                req.body
            );

        return res.status(200).json({
            success: true,
            message:
                "Restaurant updated successfully",
            data: {
                restaurant
            }
        });

    } catch (error) {
        return handleError(
            res,
            error,
            "Failed to update restaurant"
        );
    }
}


module.exports = {
    getMyRestaurant,
    getRestaurant,
    getRestaurants,
    createRestaurant,
    updateRestaurant,
    updateRestaurantStatus,

    createRestaurantAdmin,
    getAllRestaurantsAdmin,
    getRestaurantAdmin,

    approveRestaurant,
    rejectRestaurant,
    activateRestaurant,
    deactivateRestaurant,
    adminUpdateRestaurant
};