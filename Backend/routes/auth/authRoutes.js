
const express = require("express");

const authController = require("../../controllers/auth/authController");
const authenticateToken = require("../../middleware/auth/authMiddleware");

const router = express.Router();

router.post("/register", authController.register);
router.post("/login", authController.login);

router.get("/me", authenticateToken, authController.me);
router.put("/me", authenticateToken, authController.updateMe);
router.patch("/me/password", authenticateToken, authController.changePassword);

module.exports = router;
