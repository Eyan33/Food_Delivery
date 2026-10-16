const loginForm = document.getElementById("loginForm");
const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");
const rememberMeInput = document.getElementById("rememberMe");
const loginMessage = document.getElementById("loginMessage");
const loginButton = document.getElementById("loginButton");

function setLoginMessage(message, type) {
    loginMessage.textContent = message;
    loginMessage.classList.toggle("success", type === "success");
    loginMessage.classList.toggle("error", type === "error");
}

function destinationForRole(role) {
    const destinations = {
        customer: "../customer/home.html",
        restaurant: "../restaurant/dashboard.html",
        rider: "../rider/dashboard.html",
        admin: "../admin/dashboard.html",
    };

    return destinations[String(role || "").toLowerCase()] || "../../index.html";
}

loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    setLoginMessage("", "");
    loginButton.disabled = true;
    loginButton.textContent = "Signing in…";

    try {
        const session = await window.FoodDeliveryAuthApi.request("/auth/login", {
            method: "POST",
            body: {
                email: emailInput.value.trim(),
                password: passwordInput.value,
            },
        });

        window.FoodDeliveryAuthApi.saveSession(session, rememberMeInput.checked);
        setLoginMessage("Login successful. Redirecting…", "success");
        window.setTimeout(() => {
            window.location.href = destinationForRole(session.user.role);
        }, 500);
    } catch (error) {
        setLoginMessage(error.message || "Unable to log in. Please try again.", "error");
        loginButton.disabled = false;
        loginButton.textContent = "Login";
    }
});
