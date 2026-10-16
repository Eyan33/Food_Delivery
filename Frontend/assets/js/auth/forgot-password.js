const forgotPasswordForm = document.getElementById("forgotPasswordForm");
const emailInput = document.getElementById("email");
const forgotPasswordMessage = document.getElementById("forgotPasswordMessage");

forgotPasswordForm.addEventListener("submit", (event) => {
    event.preventDefault(); // Stops the page from refreshing

    const resetData = {
        email: emailInput.value.trim(),
    };

    console.log("Password reset information:", resetData);

    forgotPasswordMessage.textContent =
        "Reset-link request collected successfully.";
    forgotPasswordMessage.classList.remove("error");
    forgotPasswordMessage.classList.add("success");
});
