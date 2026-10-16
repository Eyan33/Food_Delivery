const express = require("express");

const addressController = require("../../controllers/address/addressController");

const authenticateToken = require("../../middleware/auth/authMiddleware");

const authorizeRoles = require("../../middleware/auth/roleMiddleware");

const router = express.Router();


/*
 * All address routes require authentication
 * and customer role.
 */
router.use(
    authenticateToken,
    authorizeRoles("customer")
);


/*
 * Get current user's addresses
 *
 * GET /api/addresses
 */
router.get(
    "/",
    addressController.getAddresses
);


/*
 * Get one address
 *
 * GET /api/addresses/:id
 */
router.get(
    "/:id",
    addressController.getAddress
);


/*
 * Create address
 *
 * POST /api/addresses
 */
router.post(
    "/",
    addressController.createAddress
);


/*
 * Update address
 *
 * PUT /api/addresses/:id
 */
router.put(
    "/:id",
    addressController.updateAddress
);


/*
 * Set address as default
 *
 * PATCH /api/addresses/:id/default
 */
router.patch(
    "/:id/default",
    addressController.setDefaultAddress
);


/*
 * Delete address
 *
 * DELETE /api/addresses/:id
 */
router.delete(
    "/:id",
    addressController.deleteAddress
);


module.exports = router;