const express = require("express");

const customerController = require("../../controllers/customer/customerController");
const authenticateToken = require("../../middleware/auth/authMiddleware");
const authorizeRoles = require("../../middleware/auth/roleMiddleware");

const router = express.Router();

router.use(
    authenticateToken,
    authorizeRoles("admin")
);

router.get("/", customerController.getCustomers);

router.post("/", customerController.createCustomer);

router.patch("/:id/activate",customerController.activateCustomer);

router.get("/:id", customerController.getCustomer);

router.put("/:id", customerController.updateCustomer);

router.delete("/:id", customerController.deleteCustomer);


module.exports = router;