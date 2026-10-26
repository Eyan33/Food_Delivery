const orderService = require("../../services/order/orderService");
const pool = require("../../config/database");
const { notifyCustomerOrderUpdate } = require("../../services/orderEmailNotificationService");

async function notifyRestaurantOfNewOrder(order, source) {
    try {
        const orderId = order && (order.id || order.order_id);
        if (!orderId) return;
        const result = await pool.query(
            `SELECT o.id, o.restaurant_id FROM public.orders o WHERE o.id = $1 LIMIT 1`,
            [orderId],
        );
        if (!result.rows.length) return;
        const savedOrder = result.rows[0];
        await pool.query(
            `INSERT INTO public.restaurant_notifications
                (restaurant_id, type, title, message, order_id, target_url, dedupe_key)
             VALUES ($1, 'new_order', 'New order received', $2, $3, 'orders.html', $4)
             ON CONFLICT (dedupe_key) DO NOTHING`,
            [
                savedOrder.restaurant_id,
                source === "admin"
                    ? `A new order (#${savedOrder.id}) was created by the platform admin.`
                    : `A new customer order (#${savedOrder.id}) has been placed.`,
                savedOrder.id,
                `new-order:${savedOrder.id}`,
            ],
        );
    } catch (error) {
        console.error("[restaurant-notifications] new-order notification failed:", error.message);
    }
}

/*
|--------------------------------------------------------------------------
| Customer - Create Order
|--------------------------------------------------------------------------
*/

async function createOrder(req, res) {
    try {
        const order = await orderService.createOrder(
            req.user.id,
            req.body
        );

        await notifyCustomerOrderUpdate(order.id);

        await notifyRestaurantOfNewOrder(order, "customer");

        return res.status(201).json({
            success: true,
            message: "Order placed successfully",
            data: {
                order
            }
        });
    } catch (error) {
        console.error("Create order error:", error);

        return res.status(error.statusCode || 400).json({
            success: false,
            message: error.message
        });
    }
}

/*
|--------------------------------------------------------------------------
| Customer - Get My Orders
|--------------------------------------------------------------------------
*/

async function getMyOrders(req, res) {
    try {
        const orders = await orderService.getCustomerOrders(
            req.user.id
        );

        return res.status(200).json({
            success: true,
            data: {
                orders
            }
        });
    } catch (error) {
        console.error("Get customer orders error:", error);

        return res.status(500).json({
            success: false,
            message: "Failed to retrieve orders"
        });
    }
}

/*
|--------------------------------------------------------------------------
| Customer - Get Single Order
|--------------------------------------------------------------------------
*/

async function getMyOrder(req, res) {
    try {
        const order = await orderService.getOrderById(
            req.params.id,
            req.user.id
        );

        if (!order) {
            return res.status(404).json({
                success: false,
                message: "Order not found"
            });
        }

        return res.status(200).json({
            success: true,
            data: {
                order
            }
        });
    } catch (error) {
        console.error("Get order error:", error);

        return res.status(500).json({
            success: false,
            message: "Failed to retrieve order"
        });
    }
}

/*
|--------------------------------------------------------------------------
| Customer - Cancel Order
|--------------------------------------------------------------------------
*/

async function cancelOrder(req, res) {
    try {
        const order = await orderService.cancelOrder(
            req.params.id,
            req.user.id
        );

        await notifyCustomerOrderUpdate(order.id);

        return res.status(200).json({
            success: true,
            message: "Order cancelled successfully",
            data: {
                order
            }
        });
    } catch (error) {
        console.error("Cancel order error:", error);

        return res.status(error.statusCode || 400).json({
            success: false,
            message: error.message
        });
    }
}

/*
|--------------------------------------------------------------------------
| Restaurant - Get Orders
|--------------------------------------------------------------------------
*/

async function getRestaurantOrders(req, res) {
    try {
        const orders = await orderService.getRestaurantOrders(
            req.user.id
        );

        return res.status(200).json({
            success: true,
            data: {
                orders
            }
        });
    } catch (error) {
        console.error("Get restaurant orders error:", error);

        return res.status(500).json({
            success: false,
            message: "Failed to retrieve restaurant orders"
        });
    }
}

/*
|--------------------------------------------------------------------------
| Restaurant - Get Single Order
|--------------------------------------------------------------------------
*/

async function getRestaurantOrder(req, res) {
    try {
        const order = await orderService.getRestaurantOrder(
            req.params.id,
            req.user.id
        );

        if (!order) {
            return res.status(404).json({
                success: false,
                message: "Order not found"
            });
        }

        return res.status(200).json({
            success: true,
            data: {
                order
            }
        });
    } catch (error) {
        console.error("Get restaurant order error:", error);

        return res.status(500).json({
            success: false,
            message: "Failed to retrieve order"
        });
    }
}

/*
|--------------------------------------------------------------------------
| Restaurant - Confirm Order
|--------------------------------------------------------------------------
*/

async function confirmOrder(req, res) {
    try {
        const order = await orderService.updateOrderStatus(
            req.params.id,
            req.user.id,
            "confirmed"
        );

        await notifyCustomerOrderUpdate(order.id);

        return res.status(200).json({
            success: true,
            message: "Order confirmed successfully",
            data: {
                order
            }
        });
    } catch (error) {
        console.error("Confirm order error:", error);

        return res.status(error.statusCode || 400).json({
            success: false,
            message: error.message
        });
    }
}

/*
|--------------------------------------------------------------------------
| Restaurant - Preparing
|--------------------------------------------------------------------------
*/

async function prepareOrder(req, res) {
    try {
        const order = await orderService.updateOrderStatus(
            req.params.id,
            req.user.id,
            "preparing"
        );

        await notifyCustomerOrderUpdate(order.id);

        return res.status(200).json({
            success: true,
            message: "Order is now being prepared",
            data: {
                order
            }
        });
    } catch (error) {
        console.error("Prepare order error:", error);

        return res.status(error.statusCode || 400).json({
            success: false,
            message: error.message
        });
    }
}

/*
|--------------------------------------------------------------------------
| Restaurant - Ready
|--------------------------------------------------------------------------
*/

async function readyOrder(req, res) {
    try {
        const order = await orderService.updateOrderStatus(
            req.params.id,
            req.user.id,
            "ready"
        );

        await notifyCustomerOrderUpdate(order.id);

        return res.status(200).json({
            success: true,
            message: "Order is ready",
            data: {
                order
            }
        });
    } catch (error) {
        console.error("Ready order error:", error);

        return res.status(error.statusCode || 400).json({
            success: false,
            message: error.message
        });
    }
}

/*
|--------------------------------------------------------------------------
| Admin - Get All Orders
|--------------------------------------------------------------------------
*/

async function getAllOrders(req, res) {
    try {
        const result = await orderService.getAllOrders({
            search: req.query.search,
            status: req.query.status,
            restaurantId: req.query.restaurant_id,
            customerId: req.query.customer_id,
            dateFrom: req.query.date_from,
            dateTo: req.query.date_to,
            page: req.query.page,
            limit: req.query.limit
        });

        return res.status(200).json({
            success: true,
            data: {
                orders: result.orders,
                pagination: result.pagination,
                statistics: result.statistics
            }
        });
    } catch (error) {
        console.error("Admin get all orders error:", error);

        return res.status(error.statusCode || 500).json({
            success: false,
            message:
                error.statusCode
                    ? error.message
                    : "Failed to retrieve orders"
        });
    }
}

/*
|--------------------------------------------------------------------------
| Admin - Get Single Order
|--------------------------------------------------------------------------
*/

async function getAdminOrder(req, res) {
    try {
        const order = await orderService.getOrderByIdForAdmin(
            req.params.id
        );

        if (!order) {
            return res.status(404).json({
                success: false,
                message: "Order not found"
            });
        }

        return res.status(200).json({
            success: true,
            data: {
                order
            }
        });
    } catch (error) {
        console.error("Admin get order error:", error);

        return res.status(error.statusCode || 500).json({
            success: false,
            message:
                error.statusCode
                    ? error.message
                    : "Failed to retrieve order"
        });
    }
}

/*
|--------------------------------------------------------------------------
| Admin - Update Order Status
|--------------------------------------------------------------------------
*/

async function adminUpdateStatus(req, res) {
    try {
        const { status } = req.body;

        if (!status) {
            return res.status(400).json({
                success: false,
                message: "Status is required"
            });
        }

        const order = await orderService.adminUpdateOrderStatus(
            req.params.id,
            status
        );

        await notifyCustomerOrderUpdate(order.id);

        return res.status(200).json({
            success: true,
            message: "Order status updated successfully",
            data: {
                order
            }
        });
    } catch (error) {
        console.error("Admin update status error:", error);

        return res.status(error.statusCode || 400).json({
            success: false,
            message: error.message
        });
    }
}

/*
|--------------------------------------------------------------------------
| Admin - Cancel Order
|--------------------------------------------------------------------------
*/

async function adminCancelOrder(req, res) {
    try {
        const order = await orderService.adminCancelOrder(
            req.params.id
        );

        await notifyCustomerOrderUpdate(order.id);

        return res.status(200).json({
            success: true,
            message: "Order cancelled successfully",
            data: {
                order
            }
        });
    } catch (error) {
        console.error("Admin cancel order error:", error);

        return res.status(error.statusCode || 400).json({
            success: false,
            message: error.message
        });
    }
}

/*
|--------------------------------------------------------------------------
| Admin - Dashboard Summary
|--------------------------------------------------------------------------
*/

async function getAdminOrderSummary(req, res) {
    try {
        if (typeof orderService.getAdminOrderSummary !== "function") {
            return res.status(501).json({
                success: false,
                message: "Admin order summary service is not implemented"
            });
        }

        const summary = await orderService.getAdminOrderSummary();

        return res.status(200).json({
            success: true,
            data: summary
        });
    } catch (error) {
        console.error("Admin order summary error:", error);

        return res.status(error.statusCode || 500).json({
            success: false,
            message: error.message || "Failed to retrieve order summary"
        });
    }
}

/*
|--------------------------------------------------------------------------
| Admin - Order Form Options
|--------------------------------------------------------------------------
*/

async function getAdminOrderFormOptions(req, res) {
    try {
        if (typeof orderService.getAdminOrderFormOptions !== "function") {
            return res.status(501).json({
                success: false,
                message: "Admin order form options service is not implemented"
            });
        }

        const options = await orderService.getAdminOrderFormOptions(
            req.query.restaurant_id
        );

        return res.status(200).json({
            success: true,
            data: options
        });
    } catch (error) {
        console.error("Admin order form options error:", error);

        return res.status(error.statusCode || 500).json({
            success: false,
            message: error.message || "Failed to retrieve order form options"
        });
    }
}

/*
|--------------------------------------------------------------------------
| Admin - Create Order
|--------------------------------------------------------------------------
*/

async function createAdminOrder(req, res) {
    try {
        if (typeof orderService.createAdminOrder !== "function") {
            return res.status(501).json({
                success: false,
                message: "Admin order creation service is not implemented"
            });
        }

        const order = await orderService.createAdminOrder(
            req.body,
            req.user.id
        );

        await notifyCustomerOrderUpdate(order.id);

        await notifyRestaurantOfNewOrder(order, "admin");

        return res.status(201).json({
            success: true,
            message: "Order created successfully",
            data: {
                order
            }
        });
    } catch (error) {
        console.error("Admin create order error:", error);

        return res.status(error.statusCode || 400).json({
            success: false,
            message: error.message
        });
    }
}

/*
|--------------------------------------------------------------------------
| Exports
|--------------------------------------------------------------------------
*/

module.exports = {
    createOrder,
    getMyOrders,
    getMyOrder,
    cancelOrder,

    getRestaurantOrders,
    getRestaurantOrder,
    confirmOrder,
    prepareOrder,
    readyOrder,

    getAllOrders,
    getAdminOrder,
    adminUpdateStatus,
    adminCancelOrder,

    getAdminOrderSummary,
    getAdminOrderFormOptions,
    createAdminOrder
};