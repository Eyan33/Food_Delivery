
const riderService = require("../../services/rider/riderService");

function handleError(res, error, fallbackMessage) {
    console.error("Rider API error:", error);

    if (error.code === "23505") {
        return res.status(409).json({
            success: false,
            message: "An account with this email or phone already exists"
        });
    }

    if (error.code === "23514") {
        return res.status(400).json({
            success: false,
            message: "One of the submitted values is not allowed"
        });
    }

    const statusCode = error.statusCode || 500;

    return res.status(statusCode).json({
        success: false,
        message: statusCode < 500 ? error.message : fallbackMessage
    });
}

function endpoint(fallbackMessage, handler) {
    return async (req, res) => {
        try {
            return await handler(req, res);
        } catch (error) {
            return handleError(res, error, fallbackMessage);
        }
    };
}

function notFound(res) {
    return res.status(404).json({
        success: false,
        message: "Rider not found"
    });
}

/*
 * Query parameters shared by the list and the export.
 */
function listOptions(query) {
    return {
        search: query.search,
        status: query.status,
        vehicle_type: query.vehicle_type,
        joined_from: query.joined_from,
        joined_to: query.joined_to,
        sort: query.sort,
        page: query.page,
        limit: query.limit
    };
}

/*
|--------------------------------------------------------------------------
| Admin
|--------------------------------------------------------------------------
*/

// GET /api/riders
const getRiders = endpoint("Failed to retrieve riders", async (req, res) => {
    const result = await riderService.getRiders(listOptions(req.query));

    return res.status(200).json({
        success: true,
        data: result
    });
});

// GET /api/riders/summary
const getRiderSummary = endpoint(
    "Failed to retrieve rider summary",
    async (req, res) => {
        const summary = await riderService.getRiderSummary();

        return res.status(200).json({
            success: true,
            data: { summary }
        });
    }
);

// GET /api/riders/export
const exportRiders = endpoint("Failed to export riders", async (req, res) => {
    const csv = await riderService.exportRiders(listOptions(req.query));
    const date = new Date().toISOString().slice(0, 10);

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
        "Content-Disposition",
        `attachment; filename="riders-${date}.csv"`
    );

    // BOM so Excel opens UTF-8 names correctly.
    return res.status(200).send(`\uFEFF${csv}`);
});

// GET /api/riders/:id
const getRider = endpoint("Failed to retrieve rider", async (req, res) => {
    const rider = await riderService.getRiderById(req.params.id);

    if (!rider) return notFound(res);

    return res.status(200).json({
        success: true,
        data: { rider }
    });
});

// POST /api/riders
const createRider = endpoint("Failed to create rider", async (req, res) => {
    const { rider, temporaryPassword } =
        await riderService.createRider(req.body);

    return res.status(201).json({
        success: true,
        message: "Rider created successfully",
        data: {
            rider,
            // Only present when the admin did not send a password.
            // Show it once so it can be shared with the rider.
            temporary_password: temporaryPassword
        }
    });
});

// PUT /api/riders/:id
const updateRider = endpoint("Failed to update rider", async (req, res) => {
    const rider = await riderService.updateRider(req.params.id, req.body);

    if (!rider) return notFound(res);

    return res.status(200).json({
        success: true,
        message: "Rider updated successfully",
        data: { rider }
    });
});

// DELETE /api/riders/:id (soft delete)
const deactivateRider = endpoint(
    "Failed to deactivate rider",
    async (req, res) => {
        const rider = await riderService.deactivateRider(req.params.id);

        if (!rider) return notFound(res);

        return res.status(200).json({
            success: true,
            message: "Rider deactivated successfully",
            data: { rider }
        });
    }
);

// PATCH /api/riders/:id/activate
const activateRider = endpoint(
    "Failed to activate rider",
    async (req, res) => {
        const rider = await riderService.activateRider(req.params.id);

        if (!rider) return notFound(res);

        return res.status(200).json({
            success: true,
            message: "Rider activated successfully",
            data: { rider }
        });
    }
);

// PATCH /api/riders/:id/approve
const approveRider = endpoint(
    "Failed to approve rider",
    async (req, res) => {
        const rider = await riderService.approveRider(req.params.id);

        if (!rider) return notFound(res);

        return res.status(200).json({
            success: true,
            message: "Rider approved successfully",
            data: { rider }
        });
    }
);

// PATCH /api/riders/:id/reject
const rejectRider = endpoint(
    "Failed to reject rider",
    async (req, res) => {
        const rider = await riderService.rejectRider(
            req.params.id,
            req.body
        );

        if (!rider) return notFound(res);

        return res.status(200).json({
            success: true,
            message: "Rider rejected",
            data: { rider }
        });
    }
);

// PATCH /api/riders/orders/:orderId/assign
const assignOrder = endpoint(
    "Failed to assign order",
    async (req, res) => {
        const order = await riderService.assignOrder(
            req.params.orderId,
            req.body?.rider_id
        );

        return res.status(200).json({
            success: true,
            message: "Order assigned successfully",
            data: { order }
        });
    }
);

// DELETE /api/riders/orders/:orderId/assignment
const unassignOrder = endpoint(
    "Failed to unassign order",
    async (req, res) => {
        const order = await riderService.unassignOrder(req.params.orderId);

        return res.status(200).json({
            success: true,
            message: "Order unassigned successfully",
            data: { order }
        });
    }
);

/*
|--------------------------------------------------------------------------
| Rider (logged-in rider)
|--------------------------------------------------------------------------
*/

// PATCH /api/riders/me/availability
const updateMyAvailability = endpoint(
    "Failed to update availability",
    async (req, res) => {
        const rider = await riderService.updateMyAvailability(
            req.user.id,
            req.body
        );

        return res.status(200).json({
            success: true,
            message: `You are now ${rider.availability}`,
            data: { rider }
        });
    }
);

// GET /api/riders/my-orders
const getMyOrders = endpoint(
    "Failed to retrieve assigned orders",
    async (req, res) => {
        const orders = await riderService.getRiderOrders(req.user.id);

        return res.status(200).json({
            success: true,
            data: { orders }
        });
    }
);

// GET /api/riders/my-orders/:id
const getMyOrder = endpoint(
    "Failed to retrieve assigned order",
    async (req, res) => {
        const order = await riderService.getRiderOrderById(
            req.params.id,
            req.user.id
        );

        if (!order) {
            return res.status(404).json({
                success: false,
                message: "Assigned order not found"
            });
        }

        return res.status(200).json({
            success: true,
            data: { order }
        });
    }
);

// GET /api/riders/my-earnings
const getMyEarnings = endpoint(
    "Failed to retrieve rider earnings",
    async (req, res) => {
        const earnings = await riderService.getMyEarnings(
            req.user.id,
            {
                period: req.query.period || "This Week"
            }
        );

        return res.status(200).json({
            success: true,
            data: { earnings }
        });
    }
);

// PATCH /api/riders/my-orders/:id/out-for-delivery
const markOutForDelivery = endpoint(
    "Failed to update order status",
    async (req, res) => {
        const order = await riderService.updateRiderOrderStatus(
            req.params.id,
            req.user.id,
            "out_for_delivery"
        );

        return res.status(200).json({
            success: true,
            message: "Order is out for delivery",
            data: { order }
        });
    }
);

// PATCH /api/riders/my-orders/:id/delivered
const markDelivered = endpoint(
    "Failed to update order status",
    async (req, res) => {
        const order = await riderService.updateRiderOrderStatus(
            req.params.id,
            req.user.id,
            "delivered"
        );

        return res.status(200).json({
            success: true,
            message: "Order marked as delivered",
            data: { order }
        });
    }
);

// PATCH /api/riders/my-orders/:id/cash-payment-complete
const markCashPaymentComplete = endpoint(
    "Failed to mark cash payment complete",
    async (req, res) => {
        const payment = await riderService.markRiderCashPaymentComplete(
            req.params.id,
            req.user.id
        );

        return res.status(200).json({
            success: true,
            message: "Cash payment marked complete",
            data: { payment }
        });
    }
);

// GET /api/riders/me
const getMyProfile = endpoint(
    "Failed to retrieve rider profile",
    async (req, res) => {
        const rider = await riderService.getRiderById(req.user.id);

        if (!rider) {
            return res.status(404).json({
                success: false,
                message: "Rider profile not found"
            });
        }

        return res.status(200).json({
            success: true,
            data: { rider }
        });
    }
);


/*
 * PATCH /api/riders/me
 */
const updateMyProfile = endpoint(
    "Failed to update rider profile",
    async (req, res) => {
        const rider = await riderService.updateMyProfile(
            req.user.id,
            req.body
        );

        if (!rider) {
            return res.status(404).json({
                success: false,
                message: "Rider profile not found"
            });
        }

        return res.status(200).json({
            success: true,
            message: "Profile updated successfully",
            data: { rider }
        });
    }
);


// GET /api/riders/available-orders
const getAvailableOrders = endpoint(
    "Failed to retrieve available orders",
    async (req, res) => {
        const orders = await riderService.getAvailableOrders(req.user.id);

        return res.status(200).json({
            success: true,
            data: { orders }
        });
    }
);

// POST /api/riders/available-orders/:id/accept
const acceptAvailableOrder = endpoint(
    "Failed to accept order",
    async (req, res) => {
        const order = await riderService.acceptAvailableOrder(
            req.params.id,
            req.user.id
        );

        return res.status(200).json({
            success: true,
            message: "Order accepted successfully",
            data: { order }
        });
    }
);

module.exports = {
    getRiders,
    getRiderSummary,
    exportRiders,
    getRider,
    createRider,
    updateRider,
    deactivateRider,
    activateRider,
    approveRider,
    rejectRider,
    assignOrder,
    unassignOrder,

    updateMyAvailability,
    getMyOrders,
    getMyOrder,
    getMyEarnings,
    markOutForDelivery,
    markDelivered,
    markCashPaymentComplete,

    updateMyProfile,
    getMyProfile,
    getAvailableOrders,
    acceptAvailableOrder
};
