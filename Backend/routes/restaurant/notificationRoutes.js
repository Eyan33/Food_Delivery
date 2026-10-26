"use strict";

const express = require("express");
const authenticateToken = require("../../middleware/auth/authMiddleware");
const authorizeRoles = require("../../middleware/auth/roleMiddleware");
const controller = require("../../controllers/restaurant/notificationController");

const router = express.Router();
router.use(authenticateToken, authorizeRoles("restaurant"));
router.get("/", controller.list);
router.patch("/read-all", controller.markAllRead);
router.patch("/:id/read", controller.markRead);

module.exports = router;
