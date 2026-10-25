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

module.exports = {
    sendPasswordResetEmail
};
