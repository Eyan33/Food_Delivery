
document.addEventListener("DOMContentLoaded", () => {
    "use strict";

    const API_BASE_URL = (
        document.querySelector('meta[name="api-base-url"]')?.content?.trim()
        || (window.FOOD_DELIVERY_API_BASE || document.querySelector('meta[name="api-base-url"]')?.content?.trim() || "http://localhost:5000/api").replace(/\/+$/, "")
    ).replace(/\/+$/, "");

    const TOKEN_KEY = "foodDeliveryAccessToken";
    const USER_KEY = "foodDeliveryUser";

    const profileForm = document.getElementById("profileForm");
    const passwordForm = document.getElementById("passwordForm");
    const profileMessage = document.getElementById("profileMessage");
    const passwordMessage = document.getElementById("passwordMessage");
    const contactSupportButton = document.getElementById("contactSupportButton");

    const fullNameInput = document.getElementById("fullName");
    const emailInput = document.getElementById("email");
    const phoneInput = document.getElementById("phone");

    function getToken() {
        return localStorage.getItem(TOKEN_KEY)
            || sessionStorage.getItem(TOKEN_KEY);
    }

    function showMessage(element, message, type = "success") {
        if (!element) return;

        element.textContent = message;
        element.className = `profile-message show ${type}`;
    }

    function clearMessage(element) {
        if (!element) return;

        element.textContent = "";
        element.classList.remove("show", "success", "error");
    }

    async function apiRequest(path, options = {}) {
        const token = getToken();

        if (!token) {
            throw new Error("Please log in to access your profile.");
        }

        const headers = {
            Accept: "application/json",
            Authorization: `Bearer ${token}`
        };

        const requestOptions = {
            method: options.method || "GET",
            headers
        };

        if (options.body !== undefined) {
            headers["Content-Type"] = "application/json";
            requestOptions.body = JSON.stringify(options.body);
        }

        let response;

        try {
            response = await fetch(`${API_BASE_URL}${path}`, requestOptions);
        } catch (error) {
            throw new Error(
                "Unable to connect to the server. Please check that the backend is running."
            );
        }

        const result = await response.json().catch(() => ({}));

        if (!response.ok) {
            if (response.status === 401) {
                throw new Error(
                    "Your session has expired. Please log in again."
                );
            }

            throw new Error(
                result.message || result.error || `Request failed (${response.status}).`
            );
        }

        return result.data !== undefined ? result.data : result;
    }

    function saveCurrentUser(user) {
        if (!user) return;

        const rawUser = localStorage.getItem(USER_KEY)
            || sessionStorage.getItem(USER_KEY);

        let existingUser = {};

        try {
            existingUser = rawUser ? JSON.parse(rawUser) : {};
        } catch {
            existingUser = {};
        }

        const updatedUser = { ...existingUser, ...user };

        // Update whichever storage currently holds the signed-in user.
        if (localStorage.getItem(USER_KEY)) {
            localStorage.setItem(USER_KEY, JSON.stringify(updatedUser));
        } else if (sessionStorage.getItem(USER_KEY)) {
            sessionStorage.setItem(USER_KEY, JSON.stringify(updatedUser));
        }
    }

    function setButtonLoading(form, loading, loadingText, normalText) {
        const button = form?.querySelector('button[type="submit"]');

        if (!button) return;

        if (loading) {
            button.dataset.originalText = button.textContent.trim() || normalText;
            button.disabled = true;
            button.textContent = loadingText;
        } else {
            button.disabled = false;
            button.textContent = button.dataset.originalText || normalText;
        }
    }

    function displayUser(user) {
    if (!user) return;

    const firstName = user.first_name || "";
    const lastName = user.last_name || "";
    const fullName = [firstName, lastName].filter(Boolean).join(" ");

    if (fullNameInput) {
        fullNameInput.value = fullName;
    }

    if (emailInput) {
        emailInput.value = user.email || "";
    }

    if (phoneInput) {
        phoneInput.value = user.phone || "";
    }

    // Update the profile summary card.
    const profileCard = document.querySelector(".profile-summary-card")
        || document.querySelector(".profile-card");

    if (profileCard) {
        const avatar = profileCard.querySelector(".profile-avatar");
        const name = profileCard.querySelector("h2, h3");
        const email = profileCard.querySelector("p");

        if (avatar) {
            avatar.textContent = (firstName.charAt(0) || "U").toUpperCase();
        }

        if (name) {
            name.textContent = fullName || "Customer";
        }

        if (email) {
            email.textContent = user.email || "";
        }
    }

    saveCurrentUser(user);
}

    async function loadProfile() {
        try {
            const data = await apiRequest("/auth/me");
            const user = data.user || data;

            displayUser(user);
        } catch (error) {
            showMessage(profileMessage, error.message, "error");
        }
    }

    // Load the real profile from the backend.
    loadProfile();

    // Save profile information to the database.
    if (profileForm) {
        profileForm.addEventListener("submit", async (event) => {
            event.preventDefault();
            clearMessage(profileMessage);

            const fullName = fullNameInput?.value.trim() || "";
            const email = emailInput?.value.trim() || "";
            const phone = phoneInput?.value.trim() || "";

            if (!fullName || !email || !phone) {
                showMessage(
                    profileMessage,
                    "Please fill in all required fields.",
                    "error"
                );
                return;
            }

            const nameParts = fullName.split(/\s+/);

            if (nameParts.length < 2) {
                showMessage(
                    profileMessage,
                    "Please enter both your first and last name.",
                    "error"
                );
                return;
            }

            if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
                showMessage(
                    profileMessage,
                    "Please enter a valid email address.",
                    "error"
                );
                return;
            }

            if (!/^[0-9+\s()-]{9,20}$/.test(phone)) {
                showMessage(
                    profileMessage,
                    "Please enter a valid phone number.",
                    "error"
                );
                return;
            }

            const body = {
                first_name: nameParts.shift(),
                last_name: nameParts.join(" "),
                email,
                phone
            };

            setButtonLoading(
                profileForm,
                true,
                "Saving...",
                "Save Changes"
            );

            try {
                const data = await apiRequest("/auth/me", {
                    method: "PUT",
                    body
                });

                const user = data.user || data;
                displayUser(user);

                showMessage(
                    profileMessage,
                    data.message || "Your profile has been updated successfully.",
                    "success"
                );
            } catch (error) {
                showMessage(profileMessage, error.message, "error");
            } finally {
                setButtonLoading(
                    profileForm,
                    false,
                    "Saving...",
                    "Save Changes"
                );
            }
        });
    }

    // Change password only after the backend verifies the current password.
    if (passwordForm) {
        passwordForm.addEventListener("submit", async (event) => {
            event.preventDefault();
            clearMessage(passwordMessage);

            const currentPassword =
                document.getElementById("currentPassword")?.value || "";

            const newPassword =
                document.getElementById("newPassword")?.value || "";

            const confirmPassword =
                document.getElementById("confirmPassword")?.value || "";

            if (!currentPassword || !newPassword || !confirmPassword) {
                showMessage(
                    passwordMessage,
                    "Please fill in all password fields.",
                    "error"
                );
                return;
            }

            if (newPassword.length < 8) {
                showMessage(
                    passwordMessage,
                    "Your new password must contain at least 8 characters.",
                    "error"
                );
                return;
            }

            if (newPassword !== confirmPassword) {
                showMessage(
                    passwordMessage,
                    "The new password and confirmation do not match.",
                    "error"
                );
                return;
            }

            if (currentPassword === newPassword) {
                showMessage(
                    passwordMessage,
                    "Your new password must be different from your current password.",
                    "error"
                );
                return;
            }

            setButtonLoading(
                passwordForm,
                true,
                "Updating...",
                "Update Password"
            );

            try {
                const data = await apiRequest("/auth/me/password", {
                    method: "PATCH",
                    body: {
                        currentPassword,
                        newPassword
                    }
                });

                passwordForm.reset();

                showMessage(
                    passwordMessage,
                    data.message || "Your password has been changed successfully.",
                    "success"
                );
            } catch (error) {
                showMessage(passwordMessage, error.message, "error");
            } finally {
                setButtonLoading(
                    passwordForm,
                    false,
                    "Updating...",
                    "Update Password"
                );
            }
        });
    }

    // Keep the existing support button behavior, without falsely claiming
    // that a support ticket has been submitted.
    if (contactSupportButton) {
        contactSupportButton.addEventListener("click", () => {
            showMessage(
                profileMessage,
                "For assistance, please contact the FoodDelivery support team through your available support channel.",
                "success"
            );
        });
    }

    // Clear old messages when the user edits the forms.
    [fullNameInput, emailInput, phoneInput].forEach((input) => {
        input?.addEventListener("input", () => {
            clearMessage(profileMessage);
        });
    });

    [
        document.getElementById("currentPassword"),
        document.getElementById("newPassword"),
        document.getElementById("confirmPassword")
    ].forEach((input) => {
        input?.addEventListener("input", () => {
            clearMessage(passwordMessage);
        });
    });
});
