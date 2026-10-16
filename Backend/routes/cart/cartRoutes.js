const express = require("express");

const cartController = require("../../controllers/cart/cartController");

const authenticateToken = require("../../middleware/auth/authMiddleware");

const authorizeRoles = require("../../middleware/auth/roleMiddleware");

const router = express.Router();


/*
 * All cart routes require authentication
 * and customer role.
 */

router.use(
    authenticateToken,
    authorizeRoles("customer")
);


/*
 * Get current user's cart
 *
 * GET /api/cart
 */
router.get(
    "/",
    cartController.getCart
);


/*
 * Add food to cart
 *
 * POST /api/cart/items
 */
router.post(
    "/items",
    cartController.addItem
);


/*
 * Update cart item quantity
 *
 * PUT /api/cart/items/:itemId
 */
router.put(
    "/items/:itemId",
    cartController.updateItem
);


/*
 * Remove cart item
 *
 * DELETE /api/cart/items/:itemId
 */
router.delete(
    "/items/:itemId",
    cartController.removeItem
);


/*
 * Clear cart
 *
 * DELETE /api/cart
 */
router.delete(
    "/",
    cartController.clearCart
);


module.exports = router;