
const express = require("express");

const riderController = require("../../controllers/rider/riderController");
const authenticateToken = require("../../middleware/auth/authMiddleware");
const authorizeRoles = require("../../middleware/auth/roleMiddleware");

const router = express.Router();

const asRider = [authenticateToken, authorizeRoles("rider")];
const asAdmin = [authenticateToken, authorizeRoles("admin")];

/*
|--------------------------------------------------------------------------
| Rider dashboard
|--------------------------------------------------------------------------
| Keep fixed paths above the admin "/:id" route.
*/

router.get("/me", ...asRider, riderController.getMyProfile);

// PATCH /api/riders/me
router.patch(
    "/me",
    ...asRider,
    riderController.updateMyProfile
);

router.patch(
    "/me/availability",
    ...asRider,
    riderController.updateMyAvailability
);

router.patch("/me/location", ...asRider, riderController.updateMyLocation);

router.get(
    "/available-orders",
    ...asRider,
    riderController.getAvailableOrders
);

router.post(
    "/available-orders/:id/accept",
    ...asRider,
    riderController.acceptAvailableOrder
);

router.get("/my-orders", ...asRider, riderController.getMyOrders);
router.get("/my-orders/:id", ...asRider, riderController.getMyOrder);

router.patch(
    "/my-orders/:id/out-for-delivery",
    ...asRider,
    riderController.markOutForDelivery
);

router.patch(
    "/my-orders/:id/delivered",
    ...asRider,
    riderController.markDelivered
);

router.patch(
    "/my-orders/:id/cash-payment-complete",
    ...asRider,
    riderController.markCashPaymentComplete
);

/*
|--------------------------------------------------------------------------
| Admin - order assignment
|--------------------------------------------------------------------------
*/

router.patch(
    "/orders/:orderId/assign",
    ...asAdmin,
    riderController.assignOrder
);

router.delete(
    "/orders/:orderId/assignment",
    ...asAdmin,
    riderController.unassignOrder
);

router.get(
    "/my-earnings",
    ...asRider,
    riderController.getMyEarnings
);

/*
|--------------------------------------------------------------------------
| Admin - rider accounts
|--------------------------------------------------------------------------
*/

router.get("/summary", ...asAdmin, riderController.getRiderSummary);
router.get("/export", ...asAdmin, riderController.exportRiders);

router.get("/", ...asAdmin, riderController.getRiders);
router.post("/", ...asAdmin, riderController.createRider);

router.get("/:id", ...asAdmin, riderController.getRider);
router.put("/:id", ...asAdmin, riderController.updateRider);
router.delete("/:id", ...asAdmin, riderController.deactivateRider);

router.patch("/:id/activate", ...asAdmin, riderController.activateRider);
router.patch("/:id/deactivate", ...asAdmin, riderController.deactivateRider);
router.patch("/:id/approve", ...asAdmin, riderController.approveRider);
router.patch("/:id/reject", ...asAdmin, riderController.rejectRider);

module.exports = router;
