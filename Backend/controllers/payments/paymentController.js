const paymentService = require("../../services/payment/paymentService");

/*
|--------------------------------------------------------------------------
| Customer - Create Payment
|--------------------------------------------------------------------------
*/
async function createPayment(req, res) {
  try {
    const payment = await paymentService.createPayment(req.user.id, req.body);

    return res.status(201).json({
      success: true,
      message: "Payment created successfully",
      data: {
        payment,
      },
    });
  } catch (error) {
    console.error("Create payment error:", error);

    if (error.code === "23505") {
      return res.status(409).json({
        success: false,
        message: "A payment already exists for this order",
      });
    }

    return res.status(error.statusCode || 400).json({
      success: false,
      message: error.message,
    });
  }
}

/*
|--------------------------------------------------------------------------
| Customer - Get Payment For Order
|--------------------------------------------------------------------------
*/
async function getOrderPayment(req, res) {
  try {
    const payment = await paymentService.getPaymentByOrderId(
      req.params.orderId,
      req.user.id,
    );

    if (!payment) {
      return res.status(404).json({
        success: false,
        message: "Payment not found",
      });
    }

    return res.status(200).json({
      success: true,
      data: {
        payment,
      },
    });
  } catch (error) {
    console.error("Get order payment error:", error);

    return res.status(error.statusCode || 400).json({
      success: false,
      message: error.message,
    });
  }
}

/*
|--------------------------------------------------------------------------
| Customer - Get My Payments
|--------------------------------------------------------------------------
*/
async function getMyPayments(req, res) {
  try {
    const payments = await paymentService.getCustomerPayments(req.user.id);

    return res.status(200).json({
      success: true,
      data: {
        payments,
      },
    });
  } catch (error) {
    console.error("Get customer payments error:", error);

    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.statusCode ? error.message : "Failed to retrieve payments",
    });
  }
}

/*
|--------------------------------------------------------------------------
| Restaurant - Get Payments
|--------------------------------------------------------------------------
*/
async function getRestaurantPayments(req, res) {
  try {
    const payments = await paymentService.getRestaurantPayments(req.user.id);

    return res.status(200).json({
      success: true,
      data: {
        payments,
      },
    });
  } catch (error) {
    console.error("Get restaurant payments error:", error);

    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.statusCode
        ? error.message
        : "Failed to retrieve restaurant payments",
    });
  }
}

/*
|--------------------------------------------------------------------------
| Restaurant - Update Payment Status
|--------------------------------------------------------------------------
*/
async function updatePaymentStatus(req, res) {
  try {
    const { payment_status, transaction_reference, provider_response } =
      req.body;

    if (!payment_status) {
      return res.status(400).json({
        success: false,
        message: "Payment status is required",
      });
    }

    const payment = await paymentService.updatePaymentStatus(
      req.params.id,
      req.user.id,
      payment_status,
      transaction_reference,
      provider_response,
    );

    return res.status(200).json({
      success: true,
      message: "Payment status updated successfully",
      data: {
        payment,
      },
    });
  } catch (error) {
    console.error("Update payment status error:", error);

    return res.status(error.statusCode || 400).json({
      success: false,
      message: error.message,
    });
  }
}

/*
|--------------------------------------------------------------------------
| Admin - Get Payments
|--------------------------------------------------------------------------
*/
async function getAdminPayments(req, res) {
  try {
    const result = await paymentService.getAdminPayments({
      page: req.query.page,
      limit: req.query.limit,
      status: req.query.status,
      paymentMethod: req.query.payment_method,
      search: req.query.search,
      restaurantId: req.query.restaurant_id,
      customerId: req.query.customer_id,
      orderId: req.query.order_id,
      dateFrom: req.query.date_from,
      dateTo: req.query.date_to,
    });

    return res.status(200).json({
      success: true,
      data: {
        payments: result.payments,

        pagination: result.pagination,

        statistics: result.statistics,
      },
    });
  } catch (error) {
    console.error("Admin get payments error:", error);

    return res.status(error.statusCode || 400).json({
      success: false,
      message: error.message,
    });
  }
}

/*
|--------------------------------------------------------------------------
| Admin - Get Payment
|--------------------------------------------------------------------------
*/
async function getAdminPayment(req, res) {
  try {
    const payment = await paymentService.getAdminPaymentById(req.params.id);

    if (!payment) {
      return res.status(404).json({
        success: false,
        message: "Payment not found",
      });
    }

    return res.status(200).json({
      success: true,
      data: {
        payment,
      },
    });
  } catch (error) {
    console.error("Admin get payment error:", error);

    return res.status(error.statusCode || 400).json({
      success: false,
      message: error.message,
    });
  }
}

/*
|--------------------------------------------------------------------------
| Admin - Update Payment Status
|--------------------------------------------------------------------------
*/
async function updateAdminPaymentStatus(req, res) {
  try {
    const { payment_status, transaction_reference, provider_response } =
      req.body;

    if (!payment_status) {
      return res.status(400).json({
        success: false,
        message: "Payment status is required",
      });
    }

    const payment = await paymentService.updateAdminPaymentStatus(
      req.params.id,
      payment_status,
      transaction_reference,
      provider_response,
    );

    return res.status(200).json({
      success: true,
      message: "Payment status updated successfully",
      data: {
        payment,
      },
    });
  } catch (error) {
    console.error("Admin update payment status error:", error);

    return res.status(error.statusCode || 400).json({
      success: false,
      message: error.message,
    });
  }
}

/*
|--------------------------------------------------------------------------
| Admin - Mark Payment Refunded
|--------------------------------------------------------------------------
|
| This records the payment as refunded in the database.
| It does NOT call M-Pesa/card provider APIs.
|--------------------------------------------------------------------------
*/
async function refundAdminPayment(req, res) {
  try {
    const { transaction_reference, provider_response } = req.body;

    const payment = await paymentService.refundAdminPayment(
      req.params.id,
      transaction_reference,
      provider_response,
    );

    return res.status(200).json({
      success: true,
      message: "Payment marked as refunded",
      data: {
        payment,
      },
    });
  } catch (error) {
    console.error("Admin refund payment error:", error);

    return res.status(error.statusCode || 400).json({
      success: false,
      message: error.message,
    });
  }
}

/*
|--------------------------------------------------------------------------
| Admin - Reconciliation
|--------------------------------------------------------------------------
*/
async function getAdminPaymentReconciliation(req, res) {
  try {
    const result = await paymentService.getAdminPaymentReconciliation({
      dateFrom: req.query.date_from,

      dateTo: req.query.date_to,

      status: req.query.status,

      restaurantId: req.query.restaurant_id,
    });

    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error("Admin payment reconciliation error:", error);

    return res.status(error.statusCode || 400).json({
      success: false,
      message: error.message,
    });
  }
}

module.exports = {
  createPayment,
  getOrderPayment,
  getMyPayments,

  getRestaurantPayments,
  updatePaymentStatus,

  // Admin
  getAdminPayments,
  getAdminPayment,
  updateAdminPaymentStatus,
  refundAdminPayment,
  getAdminPaymentReconciliation,
};
