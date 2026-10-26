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

async function initiateStkPush({ orderId, customerId, phoneNumber }) {
  const settings = config();
  const phone = normalizePhone(phoneNumber);
  const paymentResult = await pool.query(
    `SELECT p.id, p.order_id, p.amount, p.payment_method, p.payment_status,
            p.mpesa_checkout_request_id, o.customer_id, o.order_number, o.status AS order_status
       FROM public.payments p JOIN public.orders o ON o.id = p.order_id
      WHERE p.order_id = $1 AND o.customer_id = $2 LIMIT 1`,
    [String(orderId), String(customerId)],
  );
  const payment = paymentResult.rows[0];
  if (!payment) {
    const error = new Error("Payment not found for this order.");
    error.statusCode = 404;
    throw error;
  }
  if (payment.payment_method !== "mpesa") {
    const error = new Error("This order was not placed with M-Pesa selected.");
    error.statusCode = 409;
    throw error;
  }
  if (payment.order_status === "cancelled") {
    const error = new Error("A cancelled order cannot be paid.");
    error.statusCode = 409;
    throw error;
  }
  if (payment.payment_status === "completed") {
    return { payment_status: "completed", message: "This order is already paid." };
  }
  if (payment.mpesa_checkout_request_id) {
    return { payment_status: payment.payment_status, message: "An M-Pesa request has already been sent. Check your phone for the PIN prompt." };
  }

  const amount = Math.round(Number(payment.amount));
  if (!Number.isFinite(amount) || amount < 1) {
    const error = new Error("The order total must be at least KSh 1 for M-Pesa.");
    error.statusCode = 400;
    throw error;
  }

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
      Amount: amount,
      PartyA: phone,
      PartyB: settings.shortcode,
      PhoneNumber: phone,
      CallBackURL: settings.callbackUrl,
      AccountReference: String(payment.order_number || ("ORDER-" + payment.order_id)).slice(0, 12),
      TransactionDesc: "Food delivery order " + payment.order_id,
    }),
    signal: AbortSignal.timeout(20000),
  });
  const body = await readJson(response);
  if (String(body.ResponseCode) !== "0" || !body.CheckoutRequestID) {
    await pool.query(
      `UPDATE public.payments SET payment_status = 'failed', provider_response = $1, updated_at = CURRENT_TIMESTAMP
        WHERE id = $2 AND payment_status <> 'completed'`,
      [JSON.stringify(body).slice(0, 8000), payment.id],
    );
    const error = new Error(body.ResponseDescription || body.errorMessage || "M-Pesa could not start the payment request.");
    error.statusCode = 502;
    throw error;
  }

  await pool.query(
    `UPDATE public.payments
        SET payment_status = 'processing', phone_number = $1,
            mpesa_checkout_request_id = $2, mpesa_merchant_request_id = $3,
            provider_response = $4, updated_at = CURRENT_TIMESTAMP
      WHERE id = $5 AND payment_status <> 'completed'`,
    [phone, body.CheckoutRequestID, body.MerchantRequestID || null, JSON.stringify(body).slice(0, 8000), payment.id],
  );
  return { payment_status: "processing", message: "STK Push sent. Check your phone and enter your M-Pesa PIN to complete payment." };
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
      `SELECT id, order_id, payment_status FROM public.payments
        WHERE mpesa_checkout_request_id = $1 FOR UPDATE`,
      [String(checkoutId)],
    );
    if (!found.rows.length) {
      await client.query("ROLLBACK");
      return { accepted: false, reason: "unknown_checkout" };
    }
    const payment = found.rows[0];
    if (payment.payment_status === "completed") {
      await client.query("COMMIT");
      return { accepted: true, duplicate: true };
    }
    const successful = Number(callback.ResultCode) === 0;
    const receipt = metadata.MpesaReceiptNumber ? String(metadata.MpesaReceiptNumber) : null;
    await client.query(
      `UPDATE public.payments
          SET payment_status = $1,
              transaction_reference = CASE WHEN $2::text IS NOT NULL THEN $2 ELSE transaction_reference END,
              provider_response = $3,
              paid_at = CASE WHEN $1 = 'completed' THEN COALESCE(paid_at, CURRENT_TIMESTAMP) ELSE paid_at END,
              updated_at = CURRENT_TIMESTAMP
        WHERE id = $4`,
      [successful ? "completed" : "failed", receipt, JSON.stringify(payload).slice(0, 12000), payment.id],
    );
    await client.query("COMMIT");
    if (successful) completedOrderId = payment.order_id;
    return { accepted: true, completedOrderId };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

module.exports = { initiateStkPush, processCallback };
