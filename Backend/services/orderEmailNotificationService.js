"use strict";

const pool = require("../config/database");
const emailService = require("./emailService");

/**
 * Sends only the order-placed email and the delivered-after-payment email
 * to the email address on the customer's account. Provider failures are
 * logged but never undo a successfully saved order.
 */
async function notifyCustomerOrderUpdate(orderId) {
    try {
        const result = await pool.query(
            `SELECT
                o.id, o.order_number, o.status, o.subtotal,
                o.delivery_fee, o.total_amount,
                p.payment_status,
                u.email AS customer_email,
                r.name AS restaurant_name
             FROM orders o
             JOIN users u ON u.id = o.customer_id
             JOIN restaurants r ON r.id = o.restaurant_id
             LEFT JOIN payments p ON p.order_id = o.id
             WHERE o.id = $1
             LIMIT 1`,
            [orderId]
        );

        if (!result.rows.length) {
            console.warn("[order-email] Order not found for email notification.");
            return;
        }

        const order = result.rows[0];

        // Only two customer emails are permitted:
        // 1) once when the order is placed (pending);
        // 2) after delivery AND payment confirmation.
        const isOrderPlaced = order.status === "pending";
        const isPaidDeliveryComplete =
            order.status === "delivered" &&
            String(order.payment_status || "").toLowerCase() === "completed";

        if (!isOrderPlaced && !isPaidDeliveryComplete) {
            return;
        }

        if (!order.customer_email) {
            console.warn(`[order-email] No customer email for order #${order.order_number || order.id}.`);
            return;
        }

        await emailService.sendOrderUpdateEmail({
            to: order.customer_email,
            orderNumber: order.order_number || order.id,
            restaurantName: order.restaurant_name,
            status: order.status,
            subtotal: order.subtotal,
            deliveryFee: order.delivery_fee,
            totalAmount: order.total_amount
        });
    } catch (error) {
        console.error("[order-email] Failed to send order update email:", error.message);
    }
}

module.exports = { notifyCustomerOrderUpdate };
