const resetPasswordForm = document.getElementById("resetPasswordForm");
const resetPasswordMessage = document.getElementById("resetPasswordMessage");
const resetPasswordButton = document.getElementById("resetPasswordButton");
const token = new URLSearchParams(window.location.search).get("token");

if (!token) {
    resetPasswordMessage.textContent = "This password-reset link is missing its token. Request a new reset link.";
    resetPasswordMessage.classList.add("error");
    resetPasswordButton.disabled = true;
}

resetPasswordForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const newPassword = document.getElementById("newPassword").value;
    const confirmPassword = document.getElementById("confirmPassword").value;

    resetPasswordMessage.textContent = "";
    resetPasswordMessage.classList.remove("success", "error");

    if (!token) {
        resetPasswordMessage.textContent = "Request a new password-reset link to continue.";
        resetPasswordMessage.classList.add("error");
        return;
    }

    if (newPassword.length < 8) {
        resetPasswordMessage.textContent = "Password must contain at least 8 characters.";
        resetPasswordMessage.classList.add("error");
        return;
    }

    if (newPassword !== confirmPassword) {
        resetPasswordMessage.textContent = "The passwords do not match.";
        resetPasswordMessage.classList.add("error");
        return;
    }

    const originalButtonText = resetPasswordButton.textContent;
    resetPasswordButton.disabled = true;
    resetPasswordButton.textContent = "Resetting...";

    try {
        const apiBase = String(window.FOOD_DELIVERY_API_BASE || "/api").replace(/\/+$/, "");
        const response = await fetch(`${apiBase}/auth/reset-password`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ token, newPassword })
        });

        const result = await response.json().catch(() => ({}));
        if (!response.ok) {
            throw new Error(result.message || "This reset link is invalid or has expired. Request a new one.");
        }

        resetPasswordMessage.textContent = result.message || "Password reset successfully. You can now log in.";
        resetPasswordMessage.classList.add("success");
        resetPasswordForm.reset();
        resetPasswordButton.textContent = "Password Reset";
        window.setTimeout(() => {
            window.location.href = "login.html";
        }, 1800);
    } catch (error) {
        resetPasswordMessage.textContent = error.message || "Unable to reset your password. Please try again.";
        resetPasswordMessage.classList.add("error");
        resetPasswordButton.disabled = false;
        resetPasswordButton.textContent = originalButtonText;
    }
});
