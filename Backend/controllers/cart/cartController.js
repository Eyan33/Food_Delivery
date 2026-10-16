const cartService = require("../../services/cart/cartService");


/*
 * Get current user's cart
 */
async function getCart(req, res) {

    try {

        const cart = await cartService.getCart(
            req.user.id
        );

        return res.status(200).json({
            success: true,
            data: {
                cart
            }
        });

    } catch (error) {

        console.error("Get cart error:", error);

        return res.status(500).json({
            success: false,
            message: "Failed to retrieve cart"
        });
    }
}


/*
 * Add item to cart
 */
async function addItem(req, res) {

    try {

        const {
            food_id,
            quantity
        } = req.body;

        const item = await cartService.addItem(
            req.user.id,
            food_id,
            quantity
        );

        return res.status(201).json({
            success: true,
            message: "Item added to cart successfully",
            data: {
                item
            }
        });

    } catch (error) {

        console.error("Add cart item error:", error);

        return res.status(400).json({
            success: false,
            message: error.message
        });
    }
}


/*
 * Update cart item
 */
async function updateItem(req, res) {

    try {

        const {
            quantity
        } = req.body;

        const item = await cartService.updateItem(
            req.user.id,
            req.params.itemId,
            quantity
        );

        return res.status(200).json({
            success: true,
            message: "Cart item updated successfully",
            data: {
                item
            }
        });

    } catch (error) {

        console.error("Update cart item error:", error);

        return res.status(400).json({
            success: false,
            message: error.message
        });
    }
}


/*
 * Remove cart item
 */
async function removeItem(req, res) {

    try {

        const item = await cartService.removeItem(
            req.user.id,
            req.params.itemId
        );

        return res.status(200).json({
            success: true,
            message: "Cart item removed successfully",
            data: {
                item
            }
        });

    } catch (error) {

        console.error("Remove cart item error:", error);

        return res.status(400).json({
            success: false,
            message: error.message
        });
    }
}


/*
 * Clear cart
 */
async function clearCart(req, res) {

    try {

        const result = await cartService.clearCart(
            req.user.id
        );

        return res.status(200).json({
            success: true,
            message: "Cart cleared successfully",
            data: result
        });

    } catch (error) {

        console.error("Clear cart error:", error);

        return res.status(500).json({
            success: false,
            message: "Failed to clear cart"
        });
    }
}


module.exports = {
    getCart,
    addItem,
    updateItem,
    removeItem,
    clearCart
};