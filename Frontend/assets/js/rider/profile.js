
document.addEventListener("DOMContentLoaded", () => {
    "use strict";

    /* =====================================================
       API CONFIGURATION
    ====================================================== */

    const configuredBaseUrl = document
        .querySelector('meta[name="api-base-url"]')
        ?.content?.trim();

    const API_BASE_URL = (
        configuredBaseUrl || (window.FOOD_DELIVERY_API_BASE || document.querySelector('meta[name="api-base-url"]')?.content?.trim() || "http://localhost:5000/api").replace(/\/+$/, "")
    ).replace(/\/+$/, "");

    const TOKEN_KEY = "foodDeliveryAccessToken";
    const USER_KEY = "foodDeliveryUser";

    async function apiRequest(path, options = {}) {
        const token =
            localStorage.getItem(TOKEN_KEY) ||
            sessionStorage.getItem(TOKEN_KEY);

        if (!token) {
            throw new Error("Please log in to continue.");
        }

        const headers = {
            Accept: "application/json",
            Authorization: `Bearer ${token}`,
            ...(options.body !== undefined
                ? { "Content-Type": "application/json" }
                : {}),
            ...options.headers
        };

        let response;

        try {
            response = await fetch(`${API_BASE_URL}${path}`, {
                ...options,
                headers
            });
        } catch (error) {
            if (error instanceof TypeError) {
                throw new Error(
                    "Cannot connect to the server. Check that the backend is running."
                );
            }
            throw error;
        }

        const result = await response.json().catch(() => ({}));

        if (!response.ok) {
            throw new Error(
                result.error ||
                result.message ||
                `Request failed (${response.status}).`
            );
        }

        return result.data !== undefined ? result.data : result;
    }

    /* =====================================================
       DOM ELEMENTS
    ====================================================== */

    const profileForm = document.querySelector(".profile-form");
    const editProfileButton = document.querySelector(".edit-profile-btn");
    const cancelButton = document.querySelector(".cancel-btn");
    const avatarEditButton = document.querySelector(".avatar-edit-btn");

    const emergencySaveButton = document.querySelector(
        ".emergency-actions .save-btn"
    );

    const changePasswordButton = document.querySelector(".security-btn");

    const firstNameInput = document.getElementById("first-name");
    const lastNameInput = document.getElementById("last-name");
    const emailInput = document.getElementById("email");
    const phoneInput = document.getElementById("phone");
    const addressInput = document.getElementById("address");
    const cityInput = document.getElementById("city");
    const postalCodeInput = document.getElementById("postal-code");

    const emergencyName = document.getElementById("emergency-name");
    const emergencyPhone = document.getElementById("emergency-phone");
    const emergencyRelation = document.getElementById("emergency-relation");

    const profileInputs = [
        firstNameInput,
        lastNameInput,
        emailInput,
        phoneInput,
        addressInput,
        cityInput,
        postalCodeInput
    ].filter(Boolean);

    const emergencyInputs = [
        emergencyName,
        emergencyPhone,
        emergencyRelation
    ].filter(Boolean);

    let originalProfileData = {};
    let profileIsSaving = false;

    /* =====================================================
       MESSAGE SYSTEM
    ====================================================== */

    function showMessage(message, type = "info") {
        let messageElement = document.querySelector(
            ".rider-profile-message"
        );

        if (!messageElement) {
            messageElement = document.createElement("div");
            messageElement.className = "rider-profile-message";
            messageElement.setAttribute("role", "status");
            messageElement.setAttribute("aria-live", "polite");
            document.body.appendChild(messageElement);
        }

        messageElement.textContent = message;

        messageElement.classList.remove(
            "success",
            "error",
            "info"
        );

        messageElement.classList.add(type, "show");

        if (messageElement.hideTimer) {
            clearTimeout(messageElement.hideTimer);
        }

        messageElement.hideTimer = setTimeout(() => {
            messageElement.classList.remove("show");
        }, 4000);
    }

    /* =====================================================
       PROFILE DATA HELPERS
    ====================================================== */

    function saveOriginalProfileData() {
        originalProfileData = {};

        profileInputs.forEach(input => {
            originalProfileData[input.id] = input.value;
        });
    }

    function restoreOriginalProfileData() {
        profileInputs.forEach(input => {
            if (originalProfileData[input.id] !== undefined) {
                input.value = originalProfileData[input.id];
            }
        });
    }

    function getProfilePayload() {
        return {
            first_name: firstNameInput?.value.trim() || "",
            last_name: lastNameInput?.value.trim() || "",
            email: emailInput?.value.trim() || "",
            phone: phoneInput?.value.trim() || ""
        };
    }

    function isValidEmail(email) {
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    }

    function setProfileSaving(isSaving) {
        profileIsSaving = isSaving;

        if (editProfileButton) {
            editProfileButton.disabled = isSaving;
        }

        const submitButton = profileForm?.querySelector(
            'button[type="submit"]'
        );

        if (submitButton) {
            submitButton.disabled = isSaving;
        }
    }

    /* =====================================================
       PROFILE DISPLAY
    ====================================================== */

    function updateProfileDisplay(firstName, lastName) {
        const fullName = `${firstName} ${lastName}`.trim();

        const profileName = document.querySelector(
            ".profile-overview-content h2"
        );

        const sidebarName = document.querySelector(
            ".rider-profile-info strong"
        );

        const topbarName = document.querySelector(
            ".rider-topbar-profile-info strong"
        );

        if (profileName) profileName.textContent = fullName;
        if (sidebarName) sidebarName.textContent = fullName;
        if (topbarName) topbarName.textContent = fullName;

        const firstInitial = firstName.charAt(0).toUpperCase();
        const initials =
            `${firstInitial}${lastName.charAt(0).toUpperCase()}`;

        const profileAvatar = document.querySelector(".profile-avatar");
        const sidebarAvatar = document.querySelector(".rider-profile-avatar");
        const topbarAvatar = document.querySelector(".rider-topbar-avatar");

        if (profileAvatar) profileAvatar.textContent = initials;
        if (sidebarAvatar) sidebarAvatar.textContent = firstInitial;
        if (topbarAvatar) topbarAvatar.textContent = firstInitial;
    }

    function applyProfileData(profile) {
        if (!profile || typeof profile !== "object") return;

        const firstName =
            profile.first_name ?? profile.firstName;

        const lastName =
            profile.last_name ?? profile.lastName;

        if (firstName != null && firstNameInput) {
            firstNameInput.value = firstName;
        }

        if (lastName != null && lastNameInput) {
            lastNameInput.value = lastName;
        }

        if (profile.email != null && emailInput) {
            emailInput.value = profile.email;
        }

        if (profile.phone != null && phoneInput) {
            phoneInput.value = profile.phone;
        }

        if (profile.address != null && addressInput) {
            addressInput.value = profile.address;
        }

        if (profile.city != null && cityInput) {
            cityInput.value = profile.city;
        }

        if (
            (profile.postal_code ?? profile.postalCode) != null &&
            postalCodeInput
        ) {
            postalCodeInput.value =
                profile.postal_code ?? profile.postalCode;
        }

        if (firstNameInput && lastNameInput) {
            updateProfileDisplay(
                firstNameInput.value.trim(),
                lastNameInput.value.trim()
            );
        }

        saveOriginalProfileData();

        try {
            const rawUser =
                localStorage.getItem(USER_KEY) ||
                sessionStorage.getItem(USER_KEY);

            const user = rawUser ? JSON.parse(rawUser) : {};

            const updatedUser = {
                ...user,
                first_name: firstNameInput?.value.trim() || "",
                last_name: lastNameInput?.value.trim() || "",
                email: emailInput?.value.trim() || "",
                phone: phoneInput?.value.trim() || ""
            };

            if (localStorage.getItem(USER_KEY)) {
                localStorage.setItem(
                    USER_KEY,
                    JSON.stringify(updatedUser)
                );
            } else if (sessionStorage.getItem(USER_KEY)) {
                sessionStorage.setItem(
                    USER_KEY,
                    JSON.stringify(updatedUser)
                );
            }
        } catch (error) {
            console.warn("Could not update cached profile:", error);
        }
    }

    /* =====================================================
       ENABLE / DISABLE PROFILE FORM
    ====================================================== */

    function disableProfileForm() {
        profileInputs.forEach(input => {
            input.disabled = true;
        });

        if (cancelButton) {
            cancelButton.style.display = "none";
        }

        if (editProfileButton) {
            editProfileButton.textContent = "Edit Profile";
        }
    }

    function enableProfileForm() {
        profileInputs.forEach(input => {
            input.disabled = false;
        });

        if (cancelButton) {
            cancelButton.style.display = "inline-flex";
        }

        if (editProfileButton) {
            editProfileButton.textContent = "Editing Profile";
        }

        firstNameInput?.focus();
    }

    disableProfileForm();
    saveOriginalProfileData();

    /* =====================================================
       LOAD CURRENT RIDER PROFILE
    ====================================================== */

    async function loadProfile() {
        try {
            const result = await apiRequest("/riders/me");

            const profile =
                result?.rider ||
                result?.profile ||
                result?.user ||
                result;

            applyProfileData(profile);
            disableProfileForm();
        } catch (error) {
            console.error("Could not load rider profile:", error);

            // Keep the existing page values if the API cannot load.
            if (
                error.message.toLowerCase().includes("log in") ||
                error.message.toLowerCase().includes("token")
            ) {
                showMessage(error.message, "error");
            }
        }
    }

    /* =====================================================
       EDIT PROFILE
    ====================================================== */

    editProfileButton?.addEventListener("click", () => {
        if (profileIsSaving) return;

        const isEditing = profileInputs.some(input => !input.disabled);

        if (!isEditing) {
            enableProfileForm();
        }
    });

    /* =====================================================
       CANCEL PROFILE EDIT
    ====================================================== */

    cancelButton?.addEventListener("click", () => {
        if (profileIsSaving) return;

        restoreOriginalProfileData();
        disableProfileForm();

        showMessage("Profile changes were cancelled.", "info");
    });

    /* =====================================================
       SAVE PROFILE TO BACKEND
    ====================================================== */

    profileForm?.addEventListener("submit", async event => {
        event.preventDefault();

        if (profileIsSaving) return;

        const payload = getProfilePayload();

        if (!payload.first_name || !payload.last_name) {
            showMessage(
                "First name and last name are required.",
                "error"
            );
            return;
        }

        if (!payload.email || !isValidEmail(payload.email)) {
            showMessage("Please enter a valid email address.", "error");
            emailInput?.focus();
            return;
        }

        if (!payload.phone) {
            showMessage("Please enter your phone number.", "error");
            phoneInput?.focus();
            return;
        }

        setProfileSaving(true);

        const submitButton = profileForm.querySelector(
            'button[type="submit"]'
        );
        const originalButtonText = submitButton?.textContent;

        if (submitButton) {
            submitButton.textContent = "Saving...";
        }

        try {
            const result = await apiRequest("/riders/me", {
                method: "PATCH",
                body: JSON.stringify(payload)
            });

            const savedProfile =
                result?.rider ||
                result?.profile ||
                result?.user ||
                result;

            applyProfileData({
                ...payload,
                ...(savedProfile && typeof savedProfile === "object"
                    ? savedProfile
                    : {})
            });

            disableProfileForm();

            showMessage("Profile updated successfully.", "success");
        } catch (error) {
            console.error("Failed to update rider profile:", error);
            showMessage(
                error.message || "Failed to update your profile.",
                "error"
            );
        } finally {
            setProfileSaving(false);

            if (submitButton && originalButtonText !== undefined) {
                submitButton.textContent = originalButtonText;
            }
        }
    });

    /* =====================================================
       AVATAR EDIT
    ====================================================== */

    avatarEditButton?.addEventListener("click", () => {
        showMessage(
            "Profile photo upload is not connected to the backend yet.",
            "info"
        );
    });

    /* =====================================================
       EMERGENCY CONTACT
       No emergency-contact API endpoint is wired here yet.
    ====================================================== */

    emergencySaveButton?.addEventListener("click", () => {
        const name = emergencyName?.value.trim();
        const phone = emergencyPhone?.value.trim();
        const relation = emergencyRelation?.value;

        emergencyInputs.forEach(input => {
            input.classList.remove("input-error");
        });

        if (!name) {
            emergencyName?.classList.add("input-error");
            showMessage("Please enter the emergency contact name.", "error");
            emergencyName?.focus();
            return;
        }

        if (!phone) {
            emergencyPhone?.classList.add("input-error");
            showMessage(
                "Please enter the emergency contact phone number.",
                "error"
            );
            emergencyPhone?.focus();
            return;
        }

        if (!relation) {
            emergencyRelation?.classList.add("input-error");
            showMessage(
                "Please select an emergency contact relationship.",
                "error"
            );
            emergencyRelation?.focus();
            return;
        }

        showMessage(
            "Emergency contact validation passed, but saving is not connected to the backend yet.",
            "info"
        );
    });

    emergencyInputs.forEach(input => {
        input.addEventListener("input", () => {
            input.classList.remove("input-error");
        });

        input.addEventListener("change", () => {
            input.classList.remove("input-error");
        });
    });

    /* =====================================================
       PASSWORD CHANGE FORM
       Create the form if profile.html does not contain it.
    ====================================================== */

    let changePasswordForm = document.getElementById(
        "change-password-form"
    );

    if (changePasswordButton && !changePasswordForm) {
        changePasswordForm = document.createElement("form");
        changePasswordForm.id = "change-password-form";
        changePasswordForm.hidden = true;

        changePasswordForm.innerHTML = `
            <div class="form-group">
                <label for="current-password">Current Password</label>
                <input
                    type="password"
                    id="current-password"
                    name="currentPassword"
                    autocomplete="current-password"
                    required
                >
            </div>

            <div class="form-group">
                <label for="new-password">New Password</label>
                <input
                    type="password"
                    id="new-password"
                    name="newPassword"
                    autocomplete="new-password"
                    minlength="8"
                    required
                >
            </div>

            <div class="form-group">
                <label for="confirm-password">Confirm New Password</label>
                <input
                    type="password"
                    id="confirm-password"
                    name="confirmPassword"
                    autocomplete="new-password"
                    minlength="8"
                    required
                >
            </div>

            <div class="form-actions">
                <button type="button" id="cancel-password-change">
                    Cancel
                </button>
                <button type="submit" id="save-password-change">
                    Update Password
                </button>
            </div>
        `;

        const securityRow = changePasswordButton.closest(".security-row");

        if (securityRow) {
            securityRow.insertAdjacentElement("afterend", changePasswordForm);
        } else {
            changePasswordButton.insertAdjacentElement(
                "afterend",
                changePasswordForm
            );
        }
    }

    const currentPasswordInput = document.getElementById(
        "current-password"
    );
    const newPasswordInput = document.getElementById("new-password");
    const confirmPasswordInput = document.getElementById("confirm-password");
    const cancelPasswordButton = document.getElementById(
        "cancel-password-change"
    );
    const savePasswordButton = document.getElementById(
        "save-password-change"
    );

    changePasswordButton?.addEventListener("click", () => {
        if (!changePasswordForm) return;

        changePasswordForm.hidden = !changePasswordForm.hidden;

        if (!changePasswordForm.hidden) {
            currentPasswordInput?.focus();
        }
    });

    cancelPasswordButton?.addEventListener("click", () => {
        changePasswordForm?.reset();

        if (changePasswordForm) {
            changePasswordForm.hidden = true;
        }
    });

    changePasswordForm?.addEventListener("submit", async event => {
        event.preventDefault();

        const currentPassword = currentPasswordInput?.value || "";
        const newPassword = newPasswordInput?.value || "";
        const confirmPassword = confirmPasswordInput?.value || "";

        if (!currentPassword || !newPassword || !confirmPassword) {
            showMessage("Complete all password fields.", "error");
            return;
        }

        if (newPassword.length < 8) {
            showMessage(
                "Your new password must contain at least 8 characters.",
                "error"
            );
            newPasswordInput?.focus();
            return;
        }

        if (newPassword !== confirmPassword) {
            showMessage("The new passwords do not match.", "error");
            confirmPasswordInput?.focus();
            return;
        }

        if (currentPassword === newPassword) {
            showMessage(
                "Your new password must differ from your current password.",
                "error"
            );
            newPasswordInput?.focus();
            return;
        }

        if (savePasswordButton) {
            savePasswordButton.disabled = true;
            savePasswordButton.textContent = "Updating...";
        }

        try {
            await apiRequest("/auth/me/password", {
                method: "PATCH",
                body: JSON.stringify({
                    currentPassword,
                    newPassword
                })
            });

            changePasswordForm.reset();
            changePasswordForm.hidden = true;

            showMessage("Password changed successfully.", "success");
        } catch (error) {
            console.error("Failed to change password:", error);

            showMessage(
                error.message || "Failed to change your password.",
                "error"
            );
        } finally {
            if (savePasswordButton) {
                savePasswordButton.disabled = false;
                savePasswordButton.textContent = "Update Password";
            }
        }
    });

    /* =====================================================
       PHONE NUMBER INPUT FILTERING
    ====================================================== */

    function filterPhoneInput(input) {
        input.addEventListener("input", () => {
            input.value = input.value.replace(/[^0-9+\s()-]/g, "");
        });
    }

    if (phoneInput) filterPhoneInput(phoneInput);
    if (emergencyPhone) filterPhoneInput(emergencyPhone);

    /* =====================================================
       PROFILE CHANGE DETECTION
    ====================================================== */

    profileInputs.forEach(input => {
        input.addEventListener("input", () => {
            const hasChanges = profileInputs.some(field =>
                field.value !== originalProfileData[field.id]
            );

            if (editProfileButton && hasChanges) {
                editProfileButton.textContent = "Editing Profile";
            }
        });
    });

    /* =====================================================
       PREVENT ACCIDENTAL PAGE LEAVE
    ====================================================== */

    window.addEventListener("beforeunload", event => {
        const hasUnsavedChanges = profileInputs.some(input =>
            !input.disabled &&
            input.value !== originalProfileData[input.id]
        );

        if (hasUnsavedChanges) {
            event.preventDefault();
            event.returnValue = "";
        }
    });

    /* =====================================================
       INITIALIZE
    ====================================================== */

    loadProfile();
});
