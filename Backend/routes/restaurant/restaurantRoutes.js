const express = require("express");

const restaurantController = require("../../controllers/restaurant/restaurantController");

const authenticateToken = require("../../middleware/auth/authMiddleware");

const authorizeRoles = require("../../middleware/auth/roleMiddleware");

const router = express.Router();


/*
 * =========================================================
 * PUBLIC ROUTES
 * =========================================================
 */

router.get(
    "/",
    restaurantController.getRestaurants
);


/*
 * =========================================================
 * RESTAURANT OWNER ROUTES
 * =========================================================
 *
 * These must come before /:id
 */

router.get(
    "/owner/me",
    authenticateToken,
    authorizeRoles("restaurant"),
    restaurantController.getMyRestaurant
);

router.post(
    "/",
    authenticateToken,
    authorizeRoles("restaurant"),
    restaurantController.createRestaurant
);

router.put(
    "/owner/me",
    authenticateToken,
    authorizeRoles("restaurant"),
    restaurantController.updateRestaurant
);

router.patch(
    "/owner/status",
    authenticateToken,
    authorizeRoles("restaurant"),
    restaurantController.updateRestaurantStatus
);


/*
 * =========================================================
 * ADMIN ROUTES
 * =========================================================
 */

/*
 * Admin - Create restaurant + owner account
 */
router.post(
    "/admin",
    authenticateToken,
    authorizeRoles("admin"),
    restaurantController.createRestaurantAdmin
);


/*
 * Admin - List restaurants
 */
router.get(
    "/admin",
    authenticateToken,
    authorizeRoles("admin"),
    restaurantController.getAllRestaurantsAdmin
);


/*
 * Admin - Get one restaurant
 */
router.get(
    "/admin/:id",
    authenticateToken,
    authorizeRoles("admin"),
    restaurantController.getRestaurantAdmin
);


/*
 * Admin - Approve
 */
router.patch(
    "/admin/:id/approve",
    authenticateToken,
    authorizeRoles("admin"),
    restaurantController.approveRestaurant
);


/*
 * Admin - Reject
 */
router.patch(
    "/admin/:id/reject",
    authenticateToken,
    authorizeRoles("admin"),
    restaurantController.rejectRestaurant
);


/*
 * Admin - Activate
 */
router.patch(
    "/admin/:id/activate",
    authenticateToken,
    authorizeRoles("admin"),
    restaurantController.activateRestaurant
);


/*
 * Admin - Deactivate
 */
router.patch(
    "/admin/:id/deactivate",
    authenticateToken,
    authorizeRoles("admin"),
    restaurantController.deactivateRestaurant
);


/*
 * Admin - Update restaurant + owner account
 */
router.put(
    "/admin/:id",
    authenticateToken,
    authorizeRoles("admin"),
    restaurantController.adminUpdateRestaurant
);


/*
 * =========================================================
 * PUBLIC SINGLE RESTAURANT ROUTE
 * =========================================================
 */

router.get(
    "/:id",
    restaurantController.getRestaurant
);

module.exports = router;