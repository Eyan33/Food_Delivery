const express = require("express");

const paymentController =
    require("../../controllers/payments/paymentController");

const authenticateToken =
    require("../../middleware/auth/authMiddleware");

const authorizeRoles =
    require("../../middleware/auth/roleMiddleware");

const router = express.Router();

/*
 * Safaricom callback is public because the provider cannot send our customer JWT.
 * POST /api/payments/mpesa/callback
 */
router.post("/mpesa/callback", paymentController.mpesaCallback);

/*
|--------------------------------------------------------------------------
| Customer Routes
|--------------------------------------------------------------------------
*/

/*
 * Initiate M-Pesa STK Push for the payment row created with the order.
 * POST /api/payments/mpesa/stk-push
 */
router.post(
    "/mpesa/stk-push",
    authenticateToken,
    authorizeRoles("customer"),
    paymentController.initiateMpesaStkPush
);

/*
 * Create payment
 *
 * POST /api/payments
 */
router.post(
    "/",
    authenticateToken,
    authorizeRoles("customer"),
    paymentController.createPayment
);

/*
 * Get payment for an order
 *
 * GET /api/payments/order/:orderId
 */
router.get(
    "/order/:orderId",
    authenticateToken,
    authorizeRoles("customer"),
    paymentController.getOrderPayment
);

/*
 * Get customer's payments
 *
 * GET /api/payments/my-payments
 */
router.get(
    "/my-payments",
    authenticateToken,
    authorizeRoles("customer"),
    paymentController.getMyPayments
);

/*
|--------------------------------------------------------------------------
| Restaurant Routes
|--------------------------------------------------------------------------
*/

/*
 * Get restaurant payments
 *
 * GET /api/payments/restaurant
 */
router.get(
    "/restaurant",
    authenticateToken,
    authorizeRoles("restaurant"),
    paymentController.getRestaurantPayments
);

/*
 * Restaurant update payment status
 *
 * PATCH /api/payments/:id/status
 */
router.patch(
    "/:id/status",
    authenticateToken,
    authorizeRoles("restaurant"),
    paymentController.updatePaymentStatus
);

/*
|--------------------------------------------------------------------------
| Admin Routes
|--------------------------------------------------------------------------
*/

/*
 * Get payments
 *
 * GET /api/payments/admin
 *
 * Supported query parameters:
 * search
 * status
 * payment_method
 * restaurant_id
 * customer_id
 * order_id
 * date_from
 * date_to
 * page
 * limit
 */
router.get(
    "/admin",
    authenticateToken,
    authorizeRoles("admin"),
    paymentController.getAdminPayments
);

/*
 * Payment reconciliation
 *
 * GET /api/payments/admin/reconciliation
 */
router.get(
    "/admin/reconciliation",
    authenticateToken,
    authorizeRoles("admin"),
    paymentController.getAdminPaymentReconciliation
);

/*
 * Get one payment
 *
 * GET /api/payments/admin/:id
 */
router.get(
    "/admin/:id",
    authenticateToken,
    authorizeRoles("admin"),
    paymentController.getAdminPayment
);

/*
 * Update payment status
 *
 * PATCH /api/payments/admin/:id/status
 */
router.patch(
    "/admin/:id/status",
    authenticateToken,
    authorizeRoles("admin"),
    paymentController.updateAdminPaymentStatus
);

/*
 * Mark a completed payment as refunded
 *
 * PATCH /api/payments/admin/:id/refund
 *
 * This records the refund status.
 * Provider refund integration is still required
 * for an actual M-Pesa/card refund.
 */
router.patch(
    "/admin/:id/refund",
    authenticateToken,
    authorizeRoles("admin"),
    paymentController.refundAdminPayment
);

module.exports = router;
