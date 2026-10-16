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
router.get("/dashboard", adminController.getDashboard);
router.get("/reports", adminController.getReports);

router.get("/", adminController.getAdmins);
router.post("/", adminController.createAdmin);

router.get("/:id", adminController.getAdmin);
router.put("/:id", adminController.updateAdmin);
router.patch("/:id/activate", adminController.activateAdmin);
router.delete("/:id", adminController.deactivateAdmin);

module.exports = router;
