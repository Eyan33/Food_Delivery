"use strict";

const pool = require("../../config/database");

function config() {
  const required = ["MPESA_CONSUMER_KEY", "MPESA_CONSUMER_SECRET", "MPESA_SHORTCODE", "MPESA_PASSKEY", "MPESA_CALLBACK_URL"];
  const missing = required.filter((key) => !String(process.env[key] || "").trim());
  if (missing.length) {
    const error = new Error("M-Pesa is not configured. Check the required Render environment variables.");
    error.statusCode = 503;
    throw error;
  }
  const environment = String(process.env.MPESA_ENVIRONMENT || "sandbox").toLowerCase();
  if (!["sandbox", "production"].includes(environment)) {
    const error = new Error("MPESA_ENVIRONMENT must be sandbox or production.");
    error.statusCode = 503;
    throw error;
  }
  return {
    baseUrl: environment === "production" ? "https://api.safaricom.co.ke" : "https://sandbox.safaricom.co.ke",
    key: process.env.MPESA_CONSUMER_KEY.trim(),
    secret: process.env.MPESA_CONSUMER_SECRET.trim(),
    shortcode: process.env.MPESA_SHORTCODE.trim(),
    passkey: process.env.MPESA_PASSKEY.trim(),
    callbackUrl: process.env.MPESA_CALLBACK_URL.trim(),
  };
}

function normalizePhone(value) {
  const phone = String(value || "").replace(/[\s()+-]/g, "");
  if (/^0[17]\d{8}$/.test(phone)) return "254" + phone.slice(1);
  if (/^254[17]\d{8}$/.test(phone)) return phone;
  if (/^[17]\d{8}$/.test(phone)) return "254" + phone;
  const error = new Error("Enter a valid Kenyan M-Pesa number, e.g. 0712345678.");
  error.statusCode = 400;
  throw error;
}

async function readJson(response) {
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(body.errorMessage || body.error_description || "M-Pesa service request failed.");
    error.statusCode = 502;
    throw error;
  }
  return body;
}

async function getAccessToken(settings) {
  const url = settings.baseUrl + "/oauth/v1/generate?grant_type=client_credentials";
  const response = await fetch(url, {
    headers: { Authorization: "Basic " + Buffer.from(settings.key + ":" + settings.secret).toString("base64"), Accept: "application/json" },
    signal: AbortSignal.timeout(15000),
  });
  const body = await readJson(response);
  if (!body.access_token) {
    const error = new Error("M-Pesa did not return an access token.");
    error.statusCode = 502;
    throw error;
  }
  return body.access_token;
}

function mpesaTimestamp(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Nairobi", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
  }).formatToParts(date).reduce((result, part) => {
    if (part.type !== "literal") result[part.type] = part.value;
    return result;
  }, {});
  return parts.year + parts.month + parts.day + parts.hour + parts.minute + parts.second;
}

async function calculateCheckoutAmount(customerId, payload) {
  const restaurantId = payload?.restaurant_id;
  const items = payload?.items;
  if (!restaurantId || !Array.isArray(items) || !items.length) {
    const error = new Error("Restaurant and cart items are required.");
    error.statusCode = 400;
    throw error;
  }
  const restaurantResult = await pool.query(
    "SELECT id, is_open, is_active, delivery_fee, minimum_order FROM public.restaurants WHERE id = $1 LIMIT 1",
    [String(restaurantId)],
  );
  const restaurant = restaurantResult.rows[0];
  if (!restaurant || !restaurant.is_active || !restaurant.is_open) {
    const error = new Error("The selected restaurant is unavailable or closed.");
    error.statusCode = 409;
    throw error;
  }
  const ids = items.map((item) => String(item.food_id || ""));
  if (ids.some((id) => !/^\\d+$/.test(id))) {
    const error = new Error("The cart contains an invalid food item.");
    error.statusCode = 400;
    throw error;
  }
  const foodsResult = await pool.query(
    "SELECT id, restaurant_id, name, price, is_available, is_active FROM public.foods WHERE id = ANY($1::bigint[])",
    [ids],
  );
  if (foodsResult.rows.length !== ids.length) {
    const error = new Error("One or more cart items are no longer available.");
    error.statusCode = 409;
    throw error;
  }
  let subtotal = 0;
  for (const requested of items) {
    const food = foodsResult.rows.find((item) => String(item.id) === String(requested.food_id));
    const quantity = Number(requested.quantity);
    if (!food || String(food.restaurant_id) !== String(restaurantId) || !food.is_active || !food.is_available) {
      const error = new Error("A cart item is no longer available from this restaurant.");
      error.statusCode = 409;
      throw error;
    }
    if (!Number.isInteger(quantity) || quantity < 1) {
      const error = new Error("Cart quantities must be positive whole numbers.");
      error.statusCode = 400;
      throw error;
    }
    const price = Number(food.price);
    if (requested.expected_price != null && Math.abs(Number(requested.expected_price) - price) > 0.009) {
      const error = new Error(`${food.name} price has changed. Review your cart before paying.`);
      error.statusCode = 409;
      throw error;
    }
    subtotal += price * quantity;
  }
  if (subtotal < Number(restaurant.minimum_order || 0)) {
    const error = new Error("The cart does not meet the restaurant minimum order.");
    error.statusCode = 400;
    throw error;
  }
  const total = Math.round((subtotal + Number(restaurant.delivery_fee || 0)) * 100) / 100;
  if (total < 1 || Math.abs(total - Math.round(total)) > 0.001) {
    const error = new Error("M-Pesa requires an order total in whole shillings. Adjust your cart or use another payment method.");
    error.statusCode = 400;
    throw error;
  }
  return total;
}

async function startCheckoutSession({ customerId, payload, phoneNumber }) {
  const settings = config();
  const phone = normalizePhone(phoneNumber);
  const amount = await calculateCheckoutAmount(customerId, payload);
  const sessionResult = await pool.query(
    `INSERT INTO public.mpesa_checkout_sessions (customer_id, payload, amount, phone_number)
     VALUES ($1, $2::jsonb, $3, $4) RETURNING id`,
    [String(customerId), JSON.stringify(payload), amount, phone],
  );
  const sessionId = sessionResult.rows[0].id;
  try {
    const timestamp = mpesaTimestamp();
    const password = Buffer.from(settings.shortcode + settings.passkey + timestamp).toString("base64");
    const token = await getAccessToken(settings);
    const response = await fetch(settings.baseUrl + "/mpesa/stkpush/v1/processrequest", {
      method: "POST",
      headers: { Authorization: "Bearer " + token, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        BusinessShortCode: settings.shortcode,
        Password: password,
        Timestamp: timestamp,
        TransactionType: "CustomerPayBillOnline",
        Amount: Math.round(amount),
        PartyA: phone,
        PartyB: settings.shortcode,
        PhoneNumber: phone,
        CallBackURL: settings.callbackUrl,
        AccountReference: ("FD" + String(sessionId)).slice(0, 12),
        TransactionDesc: "Food delivery checkout " + sessionId,
      }),
      signal: AbortSignal.timeout(20000),
    });
    const body = await readJson(response);
    if (String(body.ResponseCode) !== "0" || !body.CheckoutRequestID) {
      await pool.query(
        "UPDATE public.mpesa_checkout_sessions SET status = 'failed', provider_response = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2",
        [JSON.stringify(body).slice(0, 8000), sessionId],
      );
      const error = new Error(body.ResponseDescription || body.errorMessage || "M-Pesa could not start the payment request.");
      error.statusCode = 502;
      throw error;
    }
    await pool.query(
      `UPDATE public.mpesa_checkout_sessions
          SET status = 'processing', checkout_request_id = $1, merchant_request_id = $2,
              provider_response = $3, updated_at = CURRENT_TIMESTAMP
        WHERE id = $4`,
      [body.CheckoutRequestID, body.MerchantRequestID || null, JSON.stringify(body).slice(0, 8000), sessionId],
    );
    return {
      checkout_session_id: String(sessionId),
      payment_status: "processing",
      amount,
      message: "Payment request sent. Check your phone and enter your M-Pesa PIN. Your order will be created only after payment is confirmed.",
    };
  } catch (error) {
    await pool.query(
      "UPDATE public.mpesa_checkout_sessions SET status = 'failed', updated_at = CURRENT_TIMESTAMP WHERE id = $1 AND status <> 'processing'",
      [sessionId],
    ).catch(() => {});
    throw error;
  }
}

function callbackMetadata(callback) {
  const items = callback?.Body?.stkCallback?.CallbackMetadata?.Item;
  return Array.isArray(items) ? Object.fromEntries(items.filter((item) => item && item.Name).map((item) => [item.Name, item.Value])) : {};
}

async function processCallback(payload) {
  const callback = payload?.Body?.stkCallback;
  const checkoutId = callback?.CheckoutRequestID;
  if (!checkoutId || callback.ResultCode === undefined || callback.ResultCode === null) {
    return { accepted: false, reason: "invalid_callback" };
  }
  const metadata = callbackMetadata(payload);
  const client = await pool.connect();
  let completedOrderId = null;
  try {
    await client.query("BEGIN");
    const found = await client.query(
      `SELECT id, customer_id, payload, amount, phone_number, status, order_id
         FROM public.mpesa_checkout_sessions WHERE checkout_request_id = $1 FOR UPDATE`,
      [String(checkoutId)],
    );
    if (!found.rows.length) {
      await client.query("ROLLBACK");
      return { accepted: false, reason: "unknown_checkout" };
    }
    const session = found.rows[0];
    if (session.status === "completed" && session.order_id) {
      await client.query("COMMIT");
      return { accepted: true, duplicate: true, completedOrderId: session.order_id };
    }
    if (session.status === "failed") {
      await client.query("COMMIT");
      return { accepted: true, duplicate: true };
    }
    const receipt = metadata.MpesaReceiptNumber ? String(metadata.MpesaReceiptNumber) : null;
    const callbackAmount = Number(metadata.Amount);
    if (Number(callback.ResultCode) === 0 &&
        (!receipt || !Number.isFinite(callbackAmount) || callbackAmount !== Math.round(Number(session.amount)))) {
      await client.query(
        "UPDATE public.mpesa_checkout_sessions SET provider_response = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2",
        [JSON.stringify(payload).slice(0, 12000), session.id],
      );
      await client.query("COMMIT");
      return { accepted: false, reason: "callback_amount_or_receipt_mismatch" };
    }
    if (Number(callback.ResultCode) !== 0) {
      await client.query(
        `UPDATE public.mpesa_checkout_sessions SET status = 'failed', provider_response = $1, updated_at = CURRENT_TIMESTAMP
          WHERE id = $2`,
        [JSON.stringify(payload).slice(0, 12000), session.id],
      );
      await client.query("COMMIT");
      return { accepted: true, failed: true };
    }

    // Only now, after Safaricom confirms payment, create the actual order.
    // The unique session link makes retries safe if a later database update fails.
    const existingOrder = await client.query(
      "SELECT id FROM public.orders WHERE mpesa_checkout_session_id = $1 LIMIT 1",
      [session.id],
    );
    let orderId;
    if (existingOrder.rows.length) {
      orderId = existingOrder.rows[0].id;
    } else {
      const orderService = require("../../services/order/orderService");
      const orderPayload = {
        ...session.payload,
        payment_method: "mpesa",
        delivery_phone: session.phone_number,
        mpesa_checkout_session_id: session.id,
      };
      const order = await orderService.createOrder(session.customer_id, orderPayload);
      orderId = order.id;
    }
    await client.query(
      `UPDATE public.payments
          SET payment_status = 'completed', transaction_reference = $1,
              phone_number = $2, mpesa_checkout_request_id = $3,
              mpesa_merchant_request_id = $4, provider_response = $5,
              paid_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
        WHERE order_id = $6`,
      [receipt, session.phone_number, checkoutId, payload?.Body?.stkCallback?.MerchantRequestID || null,
       JSON.stringify(payload).slice(0, 12000), orderId],
    );
    await client.query(
      `UPDATE public.mpesa_checkout_sessions
          SET status = 'completed', order_id = $1, receipt_number = $2,
              provider_response = $3, updated_at = CURRENT_TIMESTAMP
        WHERE id = $4`,
      [orderId, receipt, JSON.stringify(payload).slice(0, 12000), session.id],
    );
    await client.query("COMMIT");
    completedOrderId = orderId;
    return { accepted: true, completedOrderId };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

async function getCheckoutSessionStatus(customerId, sessionId) {
  const result = await pool.query(
    `SELECT id, status, order_id, amount FROM public.mpesa_checkout_sessions
      WHERE id = $1 AND customer_id = $2 LIMIT 1`,
    [String(sessionId), String(customerId)],
  );
  if (!result.rows.length) {
    const error = new Error("Checkout session not found.");
    error.statusCode = 404;
    throw error;
  }
  return result.rows[0];
}

module.exports = { startCheckoutSession, processCallback, getCheckoutSessionStatus };
