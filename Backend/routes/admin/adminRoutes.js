const express = require("express");

const adminController = require("../../controllers/admin/adminController");
const authenticateToken = require("../../middleware/auth/authMiddleware");
const authorizeRoles = require("../../middleware/auth/roleMiddleware");

const router = express.Router();

router.use(
    authenticateToken,
    authorizeRoles("admin")
);

// Static paths must come before /:id
router.get("/me", adminController.getMe);
router.patch("/me/avatar", adminController.updateMyAvatar);
router.get("/dashboard", adminController.getDashboard);
router.get("/reports", adminController.getReports);
router.get("/settings", adminController.getSettings);
router.put("/settings", adminController.updateSettings);
router.get("/notifications", adminController.getNotifications);
router.patch("/notifications/read-all", adminController.markAllNotificationsRead);
router.patch("/notifications/:id/read", adminController.markNotificationRead);
router.get("/audit-logs", adminController.getAuditLogs);
router.get("/reviews", adminController.getReviews);
router.patch("/reviews/:id/visibility", adminController.updateReviewVisibility);

router.get("/", adminController.getAdmins);
router.post("/", adminController.createAdmin);

router.get("/:id", adminController.getAdmin);
router.put("/:id", adminController.updateAdmin);
router.patch("/:id/activate", adminController.activateAdmin);
router.delete("/:id", adminController.deactivateAdmin);

module.exports = router;
