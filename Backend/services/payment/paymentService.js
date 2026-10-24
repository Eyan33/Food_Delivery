const pool = require("../../config/database");

const MAX_BIGINT = 9223372036854775807n;

const PAYMENT_METHODS = ["mpesa", "cash", "card"];

const PAYMENT_STATUSES = [
  "pending",
  "processing",
  "completed",
  "failed",
  "refunded",
];

/*
|--------------------------------------------------------------------------
| Payment status transitions
|--------------------------------------------------------------------------
|
| Refunded is deliberately handled through a dedicated admin function
| rather than being accepted as an arbitrary status jump.
|--------------------------------------------------------------------------
*/
const RESTAURANT_PAYMENT_TRANSITIONS = {
  pending: ["processing", "completed", "failed"],

  processing: ["completed", "failed"],

  completed: [],

  failed: ["pending", "processing"],

  refunded: [],
};

const ADMIN_PAYMENT_TRANSITIONS = {
  pending: ["processing", "completed", "failed"],

  processing: ["completed", "failed"],

  completed: [],

  failed: ["pending", "processing"],

  refunded: [],
};

/*
|--------------------------------------------------------------------------
| Helpers
|--------------------------------------------------------------------------
*/

function createError(message, statusCode = 400) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function requireId(value, label) {
  if (value === undefined || value === null || value === "") {
    throw createError(`${label} is required`);
  }

  const id = String(value).trim();

  if (!/^[1-9]\d*$/.test(id) || BigInt(id) > MAX_BIGINT) {
    throw createError(`${label} must be a positive integer`);
  }

  return id;
}

function optionalId(value, label) {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  return requireId(value, label);
}

function validatePaymentStatus(value) {
  const status = String(value || "")
    .trim()
    .toLowerCase();

  if (!PAYMENT_STATUSES.includes(status)) {
    throw createError(
      `Invalid payment status. Use one of: ${PAYMENT_STATUSES.join(", ")}`,
    );
  }

  return status;
}

function validatePaymentMethod(value) {
  const method = String(value || "")
    .trim()
    .toLowerCase();

  if (!PAYMENT_METHODS.includes(method)) {
    throw createError("Invalid payment method. Use mpesa, cash, or card");
  }

  return method;
}

function parseDate(value, label) {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  const text = String(value).trim();

  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    throw createError(`${label} must be in YYYY-MM-DD format`);
  }

  const date = new Date(`${text}T00:00:00Z`);

  if (
    Number.isNaN(date.getTime()) ||
    date.toISOString().slice(0, 10) !== text
  ) {
    throw createError(`${label} must be a valid date`);
  }

  return text;
}

function escapeLike(value) {
  return String(value).replace(/[\\%_]/g, "\\$&");
}

/*
|--------------------------------------------------------------------------
| Get payment by order ID
|--------------------------------------------------------------------------
|
| customerId is optional so existing internal calls can retrieve
| a payment by order ID while customer-facing calls remain scoped.
|--------------------------------------------------------------------------
*/
async function getPaymentByOrderId(orderId, customerId = null) {
  const validOrderId = requireId(orderId, "Order ID");

  const values = [validOrderId];

  let customerCondition = "";

  if (customerId !== null && customerId !== undefined) {
    const validCustomerId = requireId(customerId, "Customer ID");

    values.push(validCustomerId);

    customerCondition = `AND o.customer_id = $${values.length}`;
  }

  const result = await pool.query(
    `
            SELECT
                p.id,
                p.order_id,
                p.payment_method,
                p.payment_status,
                p.amount,
                p.transaction_reference,
                p.phone_number,
                p.provider_response,
                p.paid_at,
                p.created_at,
                p.updated_at

            FROM payments p

            JOIN orders o
                ON o.id = p.order_id

            WHERE p.order_id = $1

            ${customerCondition}

            LIMIT 1
            `,
    values,
  );

  return result.rows[0] || null;
}

/*
|--------------------------------------------------------------------------
| Get payment by ID
|--------------------------------------------------------------------------
*/
async function getPaymentById(paymentId) {
  const id = requireId(paymentId, "Payment ID");

  const result = await pool.query(
    `
            SELECT
                p.id,
                p.order_id,
                p.payment_method,
                p.payment_status,
                p.amount,
                p.transaction_reference,
                p.phone_number,
                p.provider_response,
                p.paid_at,
                p.created_at,
                p.updated_at

            FROM payments p

            WHERE p.id = $1

            LIMIT 1
            `,
    [id],
  );

  return result.rows[0] || null;
}

/*
|--------------------------------------------------------------------------
| Create Payment
|--------------------------------------------------------------------------
*/
async function createPayment(customerId, data) {
  const validCustomerId = requireId(customerId, "Customer ID");

  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw createError("Payment data must be a JSON object");
  }

  const orderId = requireId(data.order_id, "Order ID");

  const paymentMethod = validatePaymentMethod(data.payment_method);

  const phoneNumber =
    data.phone_number === undefined || data.phone_number === null
      ? null
      : String(data.phone_number).trim();

  /*
   * M-Pesa requires a phone number.
   */
  if (paymentMethod === "mpesa" && !phoneNumber) {
    throw createError("Phone number is required for M-Pesa payment");
  }

  /*
   * Get order.
   */
  const orderResult = await pool.query(
    `
            SELECT
                id,
                customer_id,
                status,
                total_amount

            FROM orders

            WHERE id = $1

            LIMIT 1
            `,
    [orderId],
  );

  if (orderResult.rows.length === 0) {
    throw createError("Order not found", 404);
  }

  const order = orderResult.rows[0];

  /*
   * Verify ownership.
   */
  if (String(order.customer_id) !== String(validCustomerId)) {
    throw createError("You do not have permission to pay for this order", 403);
  }

  /*
   * Prevent payment for cancelled orders.
   */
  if (order.status === "cancelled") {
    throw createError("You cannot pay for a cancelled order", 409);
  }

  /*
   * Also prevent creating another payment
   * when one already exists.
   *
   * The original implementation called
   * getPaymentByOrderId without customerId,
   * which was incorrect because that function
   * required the customer condition.
   */
  const existingPayment = await getPaymentByOrderId(orderId, validCustomerId);

  if (existingPayment) {
    throw createError("A payment already exists for this order", 409);
  }

  /*
   * Create payment.
   */
  const result = await pool.query(
    `
            INSERT INTO payments (
                order_id,
                payment_method,
                payment_status,
                amount,
                phone_number
            )

            VALUES (
                $1,
                $2,
                'pending',
                $3,
                $4
            )

            RETURNING *
            `,
    [orderId, paymentMethod, order.total_amount, phoneNumber],
  );

  return result.rows[0];
}

/*
|--------------------------------------------------------------------------
| Restaurant - Update Payment Status
|--------------------------------------------------------------------------
*/
async function updatePaymentStatus(
  paymentId,
  restaurantOwnerId,
  paymentStatus,
  transactionReference = null,
  providerResponse = null,
) {
  const id = requireId(paymentId, "Payment ID");

  const ownerId = requireId(restaurantOwnerId, "Restaurant owner ID");

  const status = validatePaymentStatus(paymentStatus);

  if (status === "refunded") {
    throw createError("Restaurant users cannot mark payments as refunded");
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const ownershipResult = await client.query(
      `
                SELECT
                    p.id,
                    p.order_id,
                    p.payment_status,
                    p.transaction_reference,
                    p.provider_response,

                    o.restaurant_id,

                    r.owner_id

                FROM payments p

                INNER JOIN orders o
                    ON o.id = p.order_id

                INNER JOIN restaurants r
                    ON r.id = o.restaurant_id

                WHERE p.id = $1
                  AND r.owner_id = $2

                FOR UPDATE
                `,
      [id, ownerId],
    );

    if (ownershipResult.rows.length === 0) {
      throw createError(
        "Payment not found or you do not have permission to update it",
        404,
      );
    }

    const currentPayment = ownershipResult.rows[0];

    const currentStatus = currentPayment.payment_status;

    /*
     * Prevent duplicate status.
     */
    if (
      currentStatus === status &&
      !transactionReference &&
      !providerResponse
    ) {
      throw createError(`Payment is already ${status}`);
    }

    /*
     * Validate transition.
     */
    const allowedTransitions = RESTAURANT_PAYMENT_TRANSITIONS[currentStatus];

    if (!allowedTransitions || !allowedTransitions.includes(status)) {
      throw createError(
        `Cannot change payment status from ${currentStatus} to ${status}`,
      );
    }

    const result = await client.query(
      `
                UPDATE payments

                SET
                    payment_status = $1,

                    transaction_reference =
                        COALESCE(
                            $2,
                            transaction_reference
                        ),

                    provider_response =
                        COALESCE(
                            $3,
                            provider_response
                        ),

                    paid_at =
                        CASE
                            WHEN $1 = 'completed'
                                 AND paid_at IS NULL
                            THEN CURRENT_TIMESTAMP

                            ELSE paid_at
                        END,

                    updated_at =
                        CURRENT_TIMESTAMP

                WHERE id = $4

                RETURNING *
                `,
      [status, transactionReference, providerResponse, id],
    );

    if (result.rows.length === 0) {
      throw createError("Payment could not be updated", 409);
    }

    await client.query("COMMIT");

    return result.rows[0];
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});

    throw error;
  } finally {
    client.release();
  }
}

/*
|--------------------------------------------------------------------------
| Customer - Get Payments
|--------------------------------------------------------------------------
*/
async function getCustomerPayments(customerId) {
  const id = requireId(customerId, "Customer ID");

  const result = await pool.query(
    `
            SELECT
                p.id,
                p.order_id,
                p.payment_method,
                p.payment_status,
                p.amount,
                p.transaction_reference,
                p.phone_number,
                p.provider_response,
                p.paid_at,
                p.created_at,
                p.updated_at,

                o.order_number,
                o.status AS order_status

            FROM payments p

            JOIN orders o
                ON o.id =
                    p.order_id

            WHERE o.customer_id = $1

            ORDER BY
                p.created_at DESC
            `,
    [id],
  );

  return result.rows;
}

/*
|--------------------------------------------------------------------------
| Restaurant - Get Payments
|--------------------------------------------------------------------------
*/
async function getRestaurantPayments(restaurantOwnerId) {
  const ownerId = requireId(restaurantOwnerId, "Restaurant owner ID");

  const result = await pool.query(
    `
            SELECT
                p.id,
                p.order_id,
                p.payment_method,
                p.payment_status,
                p.amount,
                p.transaction_reference,
                p.phone_number,
                p.provider_response,
                p.paid_at,
                p.created_at,
                p.updated_at,

                o.order_number,
                o.status AS order_status,
                COALESCE(o.delivery_fee, 0)::numeric AS delivery_fee,
                COALESCE(o.subtotal, 0)::numeric AS food_subtotal,
                GREATEST(
                    COALESCE(o.total_amount, p.amount) - COALESCE(o.delivery_fee, 0),
                    0
                )::numeric AS food_revenue_amount,

                r.id AS restaurant_id,
                r.name AS restaurant_name,
                NULLIF(
                    (SELECT settings #>> '{payments,transactionFee}'
                     FROM admin_settings
                     WHERE id = 1),
                    ''
                )::numeric AS platform_fee_rate

            FROM payments p

            JOIN orders o
                ON o.id =
                    p.order_id

            JOIN restaurants r
                ON r.id =
                    o.restaurant_id

            WHERE r.owner_id = $1

            ORDER BY
                p.created_at DESC
            `,
    [ownerId],
  );

  return result.rows;
}

/*
|--------------------------------------------------------------------------
| Admin - Get All Payments
|--------------------------------------------------------------------------
*/
async function getAdminPayments(options = {}) {
  const search = String(options.search ?? "").trim();

  const status = String(options.status ?? "")
    .trim()
    .toLowerCase();

  const paymentMethod = String(options.paymentMethod ?? "")
    .trim()
    .toLowerCase();

  const restaurantId = optionalId(options.restaurantId, "restaurant_id");

  const customerId = optionalId(options.customerId, "customer_id");

  const orderId = optionalId(options.orderId, "order_id");

  const dateFrom = parseDate(options.dateFrom, "date_from");

  const dateTo = parseDate(options.dateTo, "date_to");

  if (status && status !== "all" && !PAYMENT_STATUSES.includes(status)) {
    throw createError(
      `Invalid payment status. Use one of: ${PAYMENT_STATUSES.join(", ")}`,
    );
  }

  if (
    paymentMethod &&
    paymentMethod !== "all" &&
    !PAYMENT_METHODS.includes(paymentMethod)
  ) {
    throw createError(
      `Invalid payment method. Use one of: ${PAYMENT_METHODS.join(", ")}`,
    );
  }

  if (dateFrom && dateTo && dateFrom > dateTo) {
    throw createError("date_from cannot be after date_to");
  }

  const requestedPage = Number.parseInt(options.page, 10);

  const requestedLimit = Number.parseInt(options.limit, 10);

  const page =
    Number.isInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;

  const limit =
    Number.isInteger(requestedLimit) && requestedLimit > 0
      ? Math.min(requestedLimit, 100)
      : 10;

  const offset = (page - 1) * limit;

  const values = [];
  const conditions = [];

  /*
   * Status.
   */
  if (status && status !== "all") {
    values.push(status);

    conditions.push(`p.payment_status = $${values.length}`);
  }

  /*
   * Payment method.
   */
  if (paymentMethod && paymentMethod !== "all") {
    values.push(paymentMethod);

    conditions.push(`p.payment_method = $${values.length}`);
  }

  /*
   * Search.
   */
  if (search) {
    values.push(`%${escapeLike(search)}%`);

    const placeholder = `$${values.length}`;

    conditions.push(
      `
            (
                p.transaction_reference
                    ILIKE ${placeholder}
                    ESCAPE '\\'

                OR o.order_number
                    ILIKE ${placeholder}
                    ESCAPE '\\'

                OR COALESCE(
                    u.first_name,
                    ''
                )
                    ILIKE ${placeholder}
                    ESCAPE '\\'

                OR COALESCE(
                    u.last_name,
                    ''
                )
                    ILIKE ${placeholder}
                    ESCAPE '\\'

                OR COALESCE(
                    u.email,
                    ''
                )
                    ILIKE ${placeholder}
                    ESCAPE '\\'

                OR COALESCE(
                    u.phone,
                    ''
                )
                    ILIKE ${placeholder}
                    ESCAPE '\\'

                OR COALESCE(
                    p.phone_number,
                    ''
                )
                    ILIKE ${placeholder}
                    ESCAPE '\\'

                OR r.name
                    ILIKE ${placeholder}
                    ESCAPE '\\'
            )
            `,
    );
  }

  /*
   * Restaurant.
   */
  if (restaurantId) {
    values.push(restaurantId);

    conditions.push(`r.id = $${values.length}`);
  }

  /*
   * Customer.
   */
  if (customerId) {
    values.push(customerId);

    conditions.push(`u.id = $${values.length}`);
  }

  /*
   * Order.
   */
  if (orderId) {
    values.push(orderId);

    conditions.push(`o.id = $${values.length}`);
  }

  /*
   * Date from.
   */
  if (dateFrom) {
    values.push(dateFrom);

    conditions.push(`p.created_at >= $${values.length}::date`);
  }

  /*
   * Date to.
   */
  if (dateTo) {
    values.push(dateTo);

    conditions.push(
      `p.created_at < (
                $${values.length}::date + 1
            )`,
    );
  }

  const whereClause =
    conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const statisticsResult = await pool.query(
    `
            SELECT

                COUNT(*)::int
                    AS total_transactions,

                COUNT(*)
                    FILTER (
                        WHERE p.payment_status =
                            'completed'
                    )::int
                    AS completed_transactions,

                COUNT(*)
                    FILTER (
                        WHERE p.payment_status =
                            'processing'
                    )::int
                    AS processing_transactions,

                COUNT(*)
                    FILTER (
                        WHERE p.payment_status =
                            'pending'
                    )::int
                    AS pending_transactions,

                COUNT(*)
                    FILTER (
                        WHERE p.payment_status =
                            'failed'
                    )::int
                    AS failed_transactions,

                COUNT(*)
                    FILTER (
                        WHERE p.payment_status =
                            'refunded'
                    )::int
                    AS refunded_transactions,

                COALESCE(
                    SUM(
                        CASE
                            WHEN p.payment_status =
                                'completed'
                            THEN p.amount
                            ELSE 0
                        END
                    ),
                    0
                ) AS total_revenue,

                COALESCE(
                    SUM(
                        CASE
                            WHEN p.payment_status =
                                'pending'
                            THEN p.amount
                            ELSE 0
                        END
                    ),
                    0
                ) AS pending_amount,

                COALESCE(
                    SUM(
                        CASE
                            WHEN p.payment_status =
                                'refunded'
                            THEN p.amount
                            ELSE 0
                        END
                    ),
                    0
                ) AS refunded_amount,

                COUNT(*) FILTER (
                    WHERE
                        p.payment_status =
                            'completed'
                        AND p.paid_at >= CURRENT_DATE
                )::int
                    AS completed_today,

                COALESCE(
                    SUM(
                        CASE
                            WHEN p.payment_status =
                                'completed'
                            AND p.paid_at >= CURRENT_DATE
                            THEN p.amount
                            ELSE 0
                        END
                    ),
                    0
                ) AS today_revenue

            FROM payments p

            INNER JOIN orders o
                ON o.id =
                    p.order_id

            INNER JOIN users u
                ON u.id =
                    o.customer_id

            INNER JOIN restaurants r
                ON r.id =
                    o.restaurant_id

            ${whereClause}
            `,
    values,
  );

  const paymentsResult = await pool.query(
    `
            SELECT
                p.id,
                p.order_id,
                p.payment_method,
                p.payment_status,
                p.amount,
                p.transaction_reference,
                p.phone_number,
                p.provider_response,
                p.paid_at,
                p.created_at,
                p.updated_at,

                o.order_number,
                o.status AS order_status,
                o.total_amount
                    AS order_total_amount,

                u.id
                    AS customer_id,

                CONCAT_WS(
                    ' ',
                    u.first_name,
                    u.last_name
                )
                    AS customer_name,

                u.email
                    AS customer_email,

                u.phone
                    AS customer_phone,

                r.id
                    AS restaurant_id,

                r.name
                    AS restaurant_name

            FROM payments p

            INNER JOIN orders o
                ON o.id =
                    p.order_id

            INNER JOIN users u
                ON u.id =
                    o.customer_id

            INNER JOIN restaurants r
                ON r.id =
                    o.restaurant_id

            ${whereClause}

            ORDER BY
                p.created_at DESC,
                p.id DESC

            LIMIT
                $${values.length + 1}

            OFFSET
                $${values.length + 2}
            `,
    [...values, limit, offset],
  );

  const statistics = statisticsResult.rows[0];

  const totalItems = Number(statistics.total_transactions);

  const completedTransactions = Number(statistics.completed_transactions);

  const failedTransactions = Number(statistics.failed_transactions);

  const attemptedTransactions = completedTransactions + failedTransactions;

  return {
    payments: paymentsResult.rows,

    pagination: {
      page,
      limit,
      totalItems,

      totalPages: Math.max(1, Math.ceil(totalItems / limit)),
    },

    statistics: {
      totalTransactions: totalItems,

      completedTransactions,

      processingTransactions: Number(statistics.processing_transactions),

      pendingTransactions: Number(statistics.pending_transactions),

      failedTransactions,

      refundedTransactions: Number(statistics.refunded_transactions),

      totalRevenue: Number(statistics.total_revenue),

      pendingAmount: Number(statistics.pending_amount),

      refundedAmount: Number(statistics.refunded_amount),

      completedToday: Number(statistics.completed_today),

      todayRevenue: Number(statistics.today_revenue),

      successRate:
        attemptedTransactions > 0
          ? Number(
              ((completedTransactions / attemptedTransactions) * 100).toFixed(
                1,
              ),
            )
          : 0,
    },
  };
}

/*
|--------------------------------------------------------------------------
| Admin - Get One Payment
|--------------------------------------------------------------------------
*/
async function getAdminPaymentById(paymentId) {
  const id = requireId(paymentId, "Payment ID");

  const result = await pool.query(
    `
            SELECT

                p.id,
                p.order_id,
                p.payment_method,
                p.payment_status,
                p.amount,
                p.transaction_reference,
                p.phone_number,
                p.provider_response,
                p.paid_at,
                p.created_at,
                p.updated_at,

                o.order_number,
                o.status
                    AS order_status,

                o.total_amount
                    AS order_total_amount,

                o.delivery_address,
                o.delivery_city,
                o.recipient_name,
                o.recipient_phone,

                u.id
                    AS customer_id,

                CONCAT_WS(
                    ' ',
                    u.first_name,
                    u.last_name
                )
                    AS customer_name,

                u.email
                    AS customer_email,

                u.phone
                    AS customer_phone,

                r.id
                    AS restaurant_id,

                r.name
                    AS restaurant_name

            FROM payments p

            INNER JOIN orders o
                ON o.id =
                    p.order_id

            INNER JOIN users u
                ON u.id =
                    o.customer_id

            INNER JOIN restaurants r
                ON r.id =
                    o.restaurant_id

            WHERE p.id = $1

            LIMIT 1
            `,
    [id],
  );

  if (result.rows.length === 0) {
    return null;
  }

  const payment = result.rows[0];

  /*
   * Include order items for the admin detail view.
   */
  const itemsResult = await pool.query(
    `
            SELECT
                oi.id,
                oi.order_id,
                oi.food_id,
                oi.food_name,
                oi.quantity,
                oi.unit_price,
                oi.subtotal,
                f.image_url

            FROM order_items oi

            LEFT JOIN foods f
                ON f.id =
                    oi.food_id

            WHERE oi.order_id = $1

            ORDER BY
                oi.id ASC
            `,
    [payment.order_id],
  );

  payment.order_items = itemsResult.rows;

  return payment;
}

/*
|--------------------------------------------------------------------------
| Admin - Update Payment Status
|--------------------------------------------------------------------------
*/
async function updateAdminPaymentStatus(
  paymentId,
  paymentStatus,
  transactionReference = null,
  providerResponse = null,
) {
  const id = requireId(paymentId, "Payment ID");

  const status = validatePaymentStatus(paymentStatus);

  /*
   * Refunding must use the dedicated refund
   * function, not a generic status update.
   */
  if (status === "refunded") {
    throw createError(
      "Use the refund action to mark a completed payment as refunded",
    );
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const paymentResult = await client.query(
      `
                SELECT
                    id,
                    order_id,
                    payment_status,
                    amount,
                    transaction_reference,
                    provider_response,
                    paid_at

                FROM payments

                WHERE id = $1

                FOR UPDATE
                `,
      [id],
    );

    if (paymentResult.rows.length === 0) {
      throw createError("Payment not found", 404);
    }

    const currentPayment = paymentResult.rows[0];

    const currentStatus = currentPayment.payment_status;

    if (
      currentStatus === status &&
      !transactionReference &&
      !providerResponse
    ) {
      throw createError(`Payment is already ${status}`);
    }

    const allowedTransitions = ADMIN_PAYMENT_TRANSITIONS[currentStatus];

    if (!allowedTransitions || !allowedTransitions.includes(status)) {
      throw createError(
        `Cannot change payment status from ${currentStatus} to ${status}`,
      );
    }

    const result = await client.query(
      `
                UPDATE payments

                SET
                    payment_status = $1,

                    transaction_reference =
                        COALESCE(
                            $2,
                            transaction_reference
                        ),

                    provider_response =
                        COALESCE(
                            $3,
                            provider_response
                        ),

                    paid_at =
                        CASE
                            WHEN $5 = TRUE
                                 AND paid_at IS NULL
                            THEN CURRENT_TIMESTAMP

                            ELSE paid_at
                        END,

                    updated_at =
                        CURRENT_TIMESTAMP

                WHERE id = $4

                RETURNING *
                `,
      [status, transactionReference, providerResponse, id, status === "completed"],
    );

    if (result.rows.length === 0) {
      throw createError("Payment could not be updated", 409);
    }

    await client.query("COMMIT");

    return result.rows[0];
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});

    throw error;
  } finally {
    client.release();
  }
}

/*
|--------------------------------------------------------------------------
| Admin - Mark Payment Refunded
|--------------------------------------------------------------------------
|
| This records the database state as refunded.
| It does not call a payment provider.
|--------------------------------------------------------------------------
*/
async function refundAdminPayment(
  paymentId,
  transactionReference = null,
  providerResponse = null,
) {
  const id = requireId(paymentId, "Payment ID");

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const paymentResult = await client.query(
      `
                SELECT
                    id,
                    payment_status,
                    transaction_reference,
                    provider_response

                FROM payments

                WHERE id = $1

                FOR UPDATE
                `,
      [id],
    );

    if (paymentResult.rows.length === 0) {
      throw createError("Payment not found", 404);
    }

    const payment = paymentResult.rows[0];

    if (payment.payment_status === "refunded") {
      throw createError("Payment is already marked as refunded", 409);
    }

    if (payment.payment_status !== "completed") {
      throw createError(
        "Only completed payments can be marked as refunded",
        409,
      );
    }

    const result = await client.query(
      `
                UPDATE payments

                SET
                    payment_status =
                        'refunded',

                    transaction_reference =
                        COALESCE(
                            $1,
                            transaction_reference
                        ),

                    provider_response =
                        COALESCE(
                            $2,
                            provider_response
                        ),

                    updated_at =
                        CURRENT_TIMESTAMP

                WHERE id = $3

                RETURNING *
                `,
      [transactionReference, providerResponse, id],
    );

    await client.query("COMMIT");

    return result.rows[0];
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});

    throw error;
  } finally {
    client.release();
  }
}

/*
|--------------------------------------------------------------------------
| Admin - Payment Statistics
|--------------------------------------------------------------------------
|
| Kept as a standalone function for compatibility with code that may
| already call it directly.
|--------------------------------------------------------------------------
*/
async function getAdminPaymentStatistics(options = {}) {
  const result = await getAdminPayments({
    ...options,
    page: 1,
    limit: 1,
  });

  return result.statistics;
}

/*
|--------------------------------------------------------------------------
| Admin - Reconciliation
|--------------------------------------------------------------------------
|
| Compares payment.amount against order.total_amount.
| This is internal database reconciliation, not provider reconciliation.
|--------------------------------------------------------------------------
*/
async function getAdminPaymentReconciliation(options = {}) {
  const dateFrom = parseDate(options.dateFrom, "date_from");

  const dateTo = parseDate(options.dateTo, "date_to");

  const restaurantId = optionalId(options.restaurantId, "restaurant_id");

  const status = String(options.status ?? "")
    .trim()
    .toLowerCase();

  if (status && status !== "all" && !PAYMENT_STATUSES.includes(status)) {
    throw createError(
      `Invalid payment status. Use one of: ${PAYMENT_STATUSES.join(", ")}`,
    );
  }

  if (dateFrom && dateTo && dateFrom > dateTo) {
    throw createError("date_from cannot be after date_to");
  }

  const values = [];
  const conditions = [];

  if (dateFrom) {
    values.push(dateFrom);

    conditions.push(`p.created_at >= $${values.length}::date`);
  }

  if (dateTo) {
    values.push(dateTo);

    conditions.push(
      `p.created_at < (
                $${values.length}::date + 1
            )`,
    );
  }

  if (restaurantId) {
    values.push(restaurantId);

    conditions.push(`r.id = $${values.length}`);
  }

  if (status && status !== "all") {
    values.push(status);

    conditions.push(`p.payment_status = $${values.length}`);
  }

  const whereClause =
    conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const summaryResult = await pool.query(
    `
            SELECT

                COUNT(*)::int
                    AS total_payments,

                COUNT(*)
                    FILTER (
                        WHERE p.payment_status =
                            'completed'
                    )::int
                    AS completed_payments,

                COUNT(*)
                    FILTER (
                        WHERE p.payment_status =
                            'refunded'
                    )::int
                    AS refunded_payments,

                COUNT(*)
                    FILTER (
                        WHERE ABS(
                            COALESCE(
                                p.amount,
                                0
                            ) -
                            COALESCE(
                                o.total_amount,
                                0
                            )
                        ) > 0.01
                    )::int
                    AS mismatched_payments,

                COALESCE(
                    SUM(
                        CASE
                            WHEN p.payment_status =
                                'completed'
                            THEN p.amount
                            ELSE 0
                        END
                    ),
                    0
                ) AS completed_amount,

                COALESCE(
                    SUM(
                        CASE
                            WHEN p.payment_status =
                                'completed'
                            THEN o.total_amount
                            ELSE 0
                        END
                    ),
                    0
                ) AS completed_order_amount

            FROM payments p

            INNER JOIN orders o
                ON o.id =
                    p.order_id

            INNER JOIN restaurants r
                ON r.id =
                    o.restaurant_id

            ${whereClause}
            `,
    values,
  );

  const mismatchesResult = await pool.query(
    `
            SELECT
                p.id
                    AS payment_id,

                p.order_id,

                o.order_number,

                p.payment_status,

                p.payment_method,

                p.amount
                    AS payment_amount,

                o.total_amount
                    AS order_amount,

                (
                    p.amount -
                    o.total_amount
                ) AS difference,

                p.transaction_reference,

                p.created_at,

                r.id
                    AS restaurant_id,

                r.name
                    AS restaurant_name

            FROM payments p

            INNER JOIN orders o
                ON o.id =
                    p.order_id

            INNER JOIN restaurants r
                ON r.id =
                    o.restaurant_id

            ${whereClause}

            AND ABS(
                COALESCE(
                    p.amount,
                    0
                ) -
                COALESCE(
                    o.total_amount,
                    0
                )
            ) > 0.01

            ORDER BY
                p.created_at DESC,
                p.id DESC
            `,
    values,
  );

  const summary = summaryResult.rows[0];

  return {
    summary: {
      totalPayments: Number(summary.total_payments),

      completedPayments: Number(summary.completed_payments),

      refundedPayments: Number(summary.refunded_payments),

      mismatchedPayments: Number(summary.mismatched_payments),

      completedAmount: Number(summary.completed_amount),

      completedOrderAmount: Number(summary.completed_order_amount),

      completedDifference: Number(
        (
          Number(summary.completed_amount) -
          Number(summary.completed_order_amount)
        ).toFixed(2),
      ),
    },

    mismatches: mismatchesResult.rows,
  };
}

module.exports = {
  getPaymentByOrderId,
  getPaymentById,

  createPayment,

  updatePaymentStatus,

  getCustomerPayments,
  getRestaurantPayments,

  // Admin
  getAdminPayments,
  getAdminPaymentById,
  getAdminPaymentStatistics,
  updateAdminPaymentStatus,
  refundAdminPayment,
  getAdminPaymentReconciliation,
};
