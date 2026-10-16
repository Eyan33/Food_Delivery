const registerForm = document.getElementById("registerForm");
const firstNameInput = document.getElementById("firstName");
const lastNameInput = document.getElementById("lastName");
const emailInput = document.getElementById("email");
const phoneInput = document.getElementById("phone");
const passwordInput = document.getElementById("password");
const confirmPasswordInput = document.getElementById("confirmPassword");
const registerMessage = document.getElementById("registerMessage");
const registerButton = document.getElementById("registerButton");

function setRegisterMessage(message, type) {
    registerMessage.textContent = message;
    registerMessage.classList.toggle("success", type === "success");
    registerMessage.classList.toggle("error", type === "error");
}

registerForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    setRegisterMessage("", "");

    if (passwordInput.value !== confirmPasswordInput.value) {
        setRegisterMessage("Passwords do not match.", "error");
        confirmPasswordInput.focus();
        return;
    }

    registerButton.disabled = true;
    registerButton.textContent = "Creating account…";

    try {
        const session = await window.FoodDeliveryAuthApi.request("/auth/register", {
            method: "POST",
            body: {
                first_name: firstNameInput.value.trim(),
                last_name: lastNameInput.value.trim(),
                email: emailInput.value.trim(),
                phone: phoneInput.value.trim(),
                password: passwordInput.value,
            },
        });

        window.FoodDeliveryAuthApi.saveSession(session);
        setRegisterMessage("Account created. Taking you to your account…", "success");
        window.setTimeout(() => {
            window.location.href = "../customer/home.html";
        }, 700);
    } catch (error) {
        setRegisterMessage(error.message || "Unable to create your account. Please try again.", "error");
        registerButton.disabled = false;
        registerButton.textContent = "Create Account";
    }
});
