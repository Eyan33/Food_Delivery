const forgotPasswordForm = document.getElementById("forgotPasswordForm");
const forgotPasswordMessage = document.getElementById("forgotPasswordMessage");

/*
 * Password reset by email is not implemented on the backend yet (there is
 * no reset endpoint and no email service). Until it is, do not tell users a
 * reset link was sent: say plainly what to do instead.
 */
forgotPasswordForm.addEventListener("submit", (event) => {
    event.preventDefault();

    forgotPasswordMessage.textContent =
        "Password reset by email is not available yet. Please contact support to reset your password.";
    forgotPasswordMessage.classList.remove("success");
    forgotPasswordMessage.classList.add("error");
});
