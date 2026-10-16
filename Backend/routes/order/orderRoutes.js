const express = require("express");

const orderController = require("../../controllers/order/orderController");

const authenticateToken = require("../../middleware/auth/authMiddleware");
const authorizeRoles = require("../../middleware/auth/roleMiddleware");

const router = express.Router();

/*
|--------------------------------------------------------------------------
| Customer Routes
|--------------------------------------------------------------------------
*/

router.post(
    "/",
    authenticateToken,
    authorizeRoles("customer"),
    orderController.createOrder
);

router.get(
    "/my-orders",
    authenticateToken,
    authorizeRoles("customer"),
    orderController.getMyOrders
);

router.get(
    "/my-orders/:id",
    authenticateToken,
    authorizeRoles("customer"),
    orderController.getMyOrder
);

router.patch(
    "/my-orders/:id/cancel",
    authenticateToken,
    authorizeRoles("customer"),
    orderController.cancelOrder
);

/*
|--------------------------------------------------------------------------
| Restaurant Routes
|--------------------------------------------------------------------------
*/

router.get(
    "/restaurant",
    authenticateToken,
    authorizeRoles("restaurant"),
    orderController.getRestaurantOrders
);

router.get(
    "/restaurant/:id",
    authenticateToken,
    authorizeRoles("restaurant"),
    orderController.getRestaurantOrder
);

router.patch(
    "/restaurant/:id/confirm",
    authenticateToken,
    authorizeRoles("restaurant"),
    orderController.confirmOrder
);

router.patch(
    "/restaurant/:id/preparing",
    authenticateToken,
    authorizeRoles("restaurant"),
    orderController.prepareOrder
);

router.patch(
    "/restaurant/:id/ready",
    authenticateToken,
    authorizeRoles("restaurant"),
    orderController.readyOrder
);

/*
|--------------------------------------------------------------------------
| Admin Routes
|--------------------------------------------------------------------------
|
| IMPORTANT:
| Keep the fixed admin routes before /admin/:id.
| This prevents "summary" or "options" from being treated as an order ID.
|
*/

router.get(
    "/admin/summary",
    authenticateToken,
    authorizeRoles("admin"),
    orderController.getAdminOrderSummary
);

router.get(
    "/admin/options",
    authenticateToken,
    authorizeRoles("admin"),
    orderController.getAdminOrderFormOptions
);

router.post(
    "/admin",
    authenticateToken,
    authorizeRoles("admin"),
    orderController.createAdminOrder
);

router.get(
    "/admin",
    authenticateToken,
    authorizeRoles("admin"),
    orderController.getAllOrders
);

router.get(
    "/admin/:id",
    authenticateToken,
    authorizeRoles("admin"),
    orderController.getAdminOrder
);

router.patch(
    "/admin/:id/status",
    authenticateToken,
    authorizeRoles("admin"),
    orderController.adminUpdateStatus
);

router.patch(
    "/admin/:id/cancel",
    authenticateToken,
    authorizeRoles("admin"),
    orderController.adminCancelOrder
);

module.exports = router;