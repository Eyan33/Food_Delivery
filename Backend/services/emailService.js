"use strict";

const BREVO_API_URL = "https://api.brevo.com/v3/smtp/email";
const EMAIL_TIMEOUT_MS = 10000;

async function sendPasswordResetEmail({ to, resetUrl }) {
    const apiKey = process.env.BREVO_API_KEY;
    const from = process.env.EMAIL_FROM;
    const senderName = process.env.EMAIL_FROM_NAME || "Food Delivery";

    if (!apiKey) {
        throw new Error("BREVO_API_KEY is not configured.");
    }

    if (!from) {
        throw new Error("EMAIL_FROM is not configured.");
    }

    if (!to || !resetUrl) {
        throw new Error("Recipient email and reset URL are required.");
    }

    const controller = new AbortController();
    const timeout = setTimeout(
        () => controller.abort(),
        EMAIL_TIMEOUT_MS
    );

    try {
        const response = await fetch(BREVO_API_URL, {
            method: "POST",
            headers: {
                "accept": "application/json",
                "api-key": apiKey,
                "content-type": "application/json"
            },
            body: JSON.stringify({
                sender: {
                    name: senderName,
                    email: from
                },
                to: [
                    {
                        email: to
                    }
                ],
                subject: "Reset your Food Delivery password",
                textContent: [
                    "We received a request to reset your Food Delivery password.",
                    "",
                    "Open this link to choose a new password:",
                    resetUrl,
                    "",
                    "This link expires in one hour and can only be used once.",
                    "If you did not request this, ignore this email."
                ].join("\n"),
                htmlContent: `
                    <div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;padding:24px">
                        <h1 style="color:#FF5A1F">Reset your password</h1>

                        <p>
                            We received a request to reset your
                            Food Delivery account password.
                        </p>

                        <p>
                            <a href="${resetUrl}"
                               style="display:inline-block;background:#FF5A1F;color:white;padding:12px 20px;text-decoration:none;border-radius:6px">
                                Choose a new password
                            </a>
                        </p>

                        <p>
                            This link expires in one hour and can only
                            be used once. If you did not request this,
                            ignore this email.
                        </p>
                    </div>
                `
            }),
            signal: controller.signal
        });

        const responseText = await response.text();

        if (!response.ok) {
            // Avoid logging API credentials or sensitive reset tokens.
            throw new Error(
                `Brevo API returned HTTP ${response.status}: ` +
                responseText.slice(0, 500)
            );
        }

        let result = {};

        if (responseText) {
            try {
                result = JSON.parse(responseText);
            } catch {
                result = {};
            }
        }

        console.log("Password reset email accepted by Brevo.");

        return result;
    } catch (error) {
        if (error.name === "AbortError") {
            throw new Error(
                "Brevo email request timed out after 10 seconds."
            );
        }

        throw error;
    } finally {
        clearTimeout(timeout);
    }
}


async function sendOrderUpdateEmail({
    to,
    orderNumber,
    restaurantName,
    status,
    subtotal,
    deliveryFee,
    totalAmount
}) {
    const apiKey = process.env.BREVO_API_KEY;
    const from = process.env.EMAIL_FROM;
    const senderName = process.env.EMAIL_FROM_NAME || "Food Delivery";

    if (!apiKey) throw new Error("BREVO_API_KEY is not configured.");
    if (!from) throw new Error("EMAIL_FROM is not configured.");
    if (!to) throw new Error("Recipient email is required.");

    const statusLabels = {
        pending: "Order received",
        confirmed: "Order confirmed by the restaurant",
        preparing: "Your food is being prepared",
        ready: "Your order is ready for pickup",
        out_for_delivery: "Your order is out for delivery",
        delivered: "Your order has been delivered",
        cancelled: "Your order has been cancelled"
    };
    const label = statusLabels[status] || `Order status updated: ${status}`;
    const safe = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[char]));
    const money = (value) => `KSh ${(Number(value) || 0).toLocaleString("en-KE", {
        minimumFractionDigits: 2, maximumFractionDigits: 2
    })}`;
    const number = orderNumber || "your order";
    const restaurant = restaurantName || "Food Delivery restaurant";
    const statusText = String(status || "").replaceAll("_", " ");
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), EMAIL_TIMEOUT_MS);

    try {
        const response = await fetch(BREVO_API_URL, {
            method: "POST",
            headers: {
                "accept": "application/json",
                "api-key": apiKey,
                "content-type": "application/json"
            },
            body: JSON.stringify({
                sender: { name: senderName, email: from },
                to: [{ email: to }],
                subject: `Food Delivery order #${number}: ${label}`,
                textContent: [
                    "Hello,",
                    `There is an update for your Food Delivery order #${number}.`,
                    `Restaurant: ${restaurant}`,
                    `Status: ${label}`,
                    `Food subtotal: ${money(subtotal)}`,
                    `Delivery fee: ${money(deliveryFee)}`,
                    `Order total: ${money(totalAmount)}`,
                    "",
                    "Thank you for ordering with Food Delivery."
                ].join("\n"),
                htmlContent: `
                    <div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;padding:24px;color:#222">
                      <h1 style="color:#FF5A1F;margin-bottom:8px">Food Delivery order update</h1>
                      <p>There is an update for your order <strong>#${safe(number)}</strong>.</p>
                      <div style="padding:16px;background:#fff4ef;border-radius:8px;margin:20px 0">
                        <h2 style="margin:0 0 8px;color:#FF5A1F">${safe(label)}</h2>
                        <p style="margin:0">Restaurant: <strong>${safe(restaurant)}</strong></p>
                        <p style="margin:8px 0 0">Current status: <strong>${safe(statusText)}</strong></p>
                      </div>
                      <table style="width:100%;border-collapse:collapse">
                        <tr><td style="padding:8px 0;border-bottom:1px solid #eee">Food subtotal</td><td style="padding:8px 0;text-align:right;border-bottom:1px solid #eee">${safe(money(subtotal))}</td></tr>
                        <tr><td style="padding:8px 0;border-bottom:1px solid #eee">Delivery fee</td><td style="padding:8px 0;text-align:right;border-bottom:1px solid #eee">${safe(money(deliveryFee))}</td></tr>
                        <tr><td style="padding:8px 0;font-weight:bold">Order total</td><td style="padding:8px 0;text-align:right;font-weight:bold">${safe(money(totalAmount))}</td></tr>
                      </table>
                      <p style="margin-top:24px">Thank you for ordering with Food Delivery.</p>
                    </div>
                `
            }),
            signal: controller.signal
        });

        const responseText = await response.text();
        if (!response.ok) {
            throw new Error(`Brevo API returned HTTP ${response.status}: ${responseText.slice(0, 300)}`);
        }
        console.log(`Order update email accepted by Brevo for order #${String(number)}.`);
        try { return responseText ? JSON.parse(responseText) : {}; } catch { return {}; }
    } catch (error) {
        if (error.name === "AbortError") {
            throw new Error("Brevo order email request timed out after 10 seconds.");
        }
        throw error;
    } finally {
        clearTimeout(timeout);
    }
}

module.exports = {
    sendPasswordResetEmail,
    sendOrderUpdateEmail
};
