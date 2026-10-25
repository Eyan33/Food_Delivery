"use strict";

const nodemailer = require("nodemailer");

let transporter;

function getTransporter() {
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;

    if (!user || !pass) {
        throw new Error(
            "Email service is not configured. Check SMTP_USER and SMTP_PASS."
        );
    }

    if (!transporter) {
        const port = Number(process.env.SMTP_PORT || 587);

        transporter = nodemailer.createTransport({
            host: process.env.SMTP_HOST || "smtp-relay.brevo.com",
            port,
            secure: port === 465,
            auth: {
                user,
                pass
            }
        });
    }

    return transporter;
}

async function sendPasswordResetEmail({ to, resetUrl }) {
    const from = process.env.EMAIL_FROM;

    if (!from) {
        throw new Error("EMAIL_FROM is not configured.");
    }

    return getTransporter().sendMail({
        from: {
            name: process.env.EMAIL_FROM_NAME || "Food Delivery",
            address: from
        },
        to,
        subject: "Reset your Food Delivery password",

        text: [
            "We received a request to reset your Food Delivery password.",
            "",
            "Open the link below to choose a new password:",
            resetUrl,
            "",
            "This link expires in one hour and can only be used once.",
            "If you did not request this, ignore this email."
        ].join("\n"),

        html: `
            <div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;padding:24px">
                <h1 style="color:#FF5A1F">Reset your password</h1>

                <p>
                    We received a request to reset your
                    Food Delivery account password.
                </p>

                <p>
                    <a
                        href="${resetUrl}"
                        style="display:inline-block;background:#FF5A1F;color:white;padding:12px 20px;text-decoration:none;border-radius:6px"
                    >
                        Choose a new password
                    </a>
                </p>

                <p>
                    This link expires in one hour and can only be used once.
                    If you did not request this, ignore this email.
                </p>
            </div>
        `
    });
}

module.exports = {
    sendPasswordResetEmail
};