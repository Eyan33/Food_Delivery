const forgotPasswordForm = document.getElementById("forgotPasswordForm");
const forgotPasswordMessage = document.getElementById("forgotPasswordMessage");
const forgotPasswordButton = document.getElementById("forgotPasswordButton");

forgotPasswordForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const email = document.getElementById("email").value.trim();
    const originalButtonText = forgotPasswordButton.textContent;

    forgotPasswordMessage.textContent = "";
    forgotPasswordMessage.classList.remove("success", "error");
    forgotPasswordButton.disabled = true;
    forgotPasswordButton.textContent = "Sending...";

    try {
        const apiBase = String(window.FOOD_DELIVERY_API_BASE || "/api").replace(/\/+$/, "");
        const response = await fetch(`${apiBase}/auth/forgot-password`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email })
        });

        const result = await response.json().catch(() => ({}));

        if (!response.ok) {
            throw new Error(result.message || "We could not process your request. Please try again.");
        }

        forgotPasswordMessage.textContent =
            result.message || "If an active account exists for that email, password-reset instructions will be sent.";
            result.message || "If an account exists for that email, password-reset instructions will be sent.";
        forgotPasswordMessage.classList.add("success");
    } catch (error) {
        forgotPasswordMessage.textContent =
            error.message || "Unable to contact the server. Please try again.";
        forgotPasswordMessage.classList.add("error");
    } finally {
        forgotPasswordButton.disabled = false;
        forgotPasswordButton.textContent = originalButtonText;
    }
});
