const customerService = require("../../services/customer/customerService");

function handleError(res, error, fallbackMessage) {
    console.error("Customer API error:", error);

    if (error.code === "23505") {
        return res.status(409).json({
            success: false,
            message: "An account with this email or phone already exists"
        });
    }

    const statusCode = error.statusCode || 500;

    return res.status(statusCode).json({
        success: false,
        message: statusCode < 500
            ? error.message
            : fallbackMessage
    });
}

async function getCustomers(req, res) {
    try {
        const result = await customerService.getCustomers({
            search: req.query.search,
            status: req.query.status,
            page: req.query.page,
            limit: req.query.limit
        });

        return res.status(200).json({
            success: true,
            data: {
                customers: result.customers,
                pagination: result.pagination,
                statistics: result.statistics
            }
        });
    } catch (error) {
        return handleError(
            res,
            error,
            "Failed to retrieve customers"
        );
    }
}

async function getCustomer(req, res) {
    try {
        const customer = await customerService.getCustomerById(
            req.params.id
        );

        if (!customer) {
            return res.status(404).json({
                success: false,
                message: "Customer not found"
            });
        }

        return res.status(200).json({
            success: true,
            data: {
                customer
            }
        });
    } catch (error) {
        return handleError(
            res,
            error,
            "Failed to retrieve customer"
        );
    }
}

async function createCustomer(req, res) {
    try {
        const customer = await customerService.createCustomer(req.body);

        return res.status(201).json({
            success: true,
            message: "Customer created successfully",
            data: {
                customer
            }
        });
    } catch (error) {
        return handleError(
            res,
            error,
            "Failed to create customer"
        );
    }
}

async function updateCustomer(req, res) {
    try {
        const customer = await customerService.updateCustomer(
            req.params.id,
            req.body
        );

        if (!customer) {
            return res.status(404).json({
                success: false,
                message: "Customer not found"
            });
        }

        return res.status(200).json({
            success: true,
            message: "Customer updated successfully",
            data: {
                customer
            }
        });
    } catch (error) {
        return handleError(
            res,
            error,
            "Failed to update customer"
        );
    }
}

async function deleteCustomer(req, res) {
    try {
        const customer = await customerService.deactivateCustomer(
            req.params.id
        );

        if (!customer) {
            return res.status(404).json({
                success: false,
                message: "Customer not found"
            });
        }

        return res.status(200).json({
            success: true,
            message: "Customer deactivated successfully",
            data: {
                customer
            }
        });
    } catch (error) {
        return handleError(
            res,
            error,
            "Failed to deactivate customer"
        );
    }
}

async function activateCustomer(req, res) {
    try {
        const customer = await customerService.activateCustomer(
            req.params.id
        );

        if (!customer) {
            return res.status(404).json({
                success: false,
                message: "Customer not found"
            });
        }

        return res.status(200).json({
            success: true,
            message: "Customer activated successfully",
            data: {
                customer
            }
        });
    } catch (error) {
        return handleError(
            res,
            error,
            "Failed to activate customer"
        );
    }
}

module.exports = {
    getCustomers,
    getCustomer,
    createCustomer,
    updateCustomer,
    deleteCustomer,
    activateCustomer
};