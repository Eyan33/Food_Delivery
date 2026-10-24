
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
            phone: phoneInput?.value.trim() || "",
            address: addressInput?.value.trim() || "",
            city: cityInput?.value.trim() || "",
            postal_code: postalCodeInput?.value.trim() || ""
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

    function initialsFor(firstName = "", lastName = "") {
        return `${String(firstName || "").trim().charAt(0)}${String(lastName || "").trim().charAt(0)}`.toUpperCase() || "—";
    }

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
        if (profile.address != null && addressInput) addressInput.value = profile.address;
        if (profile.city != null && cityInput) cityInput.value = profile.city;
        if ((profile.postal_code ?? profile.postalCode) != null && postalCodeInput) {
            postalCodeInput.value = profile.postal_code ?? profile.postalCode;
        }

        const setText = (selector, value, fallback = "—") => {
            const element = document.querySelector(selector);
            if (element) element.textContent = value == null || value === "" ? fallback : String(value);
        };
        const riderId = profile.id ?? profile.user_id;
        setText("#profileRiderId", riderId ? `RID-${riderId}` : "—");
        setText("#riderInfoId", riderId ? `RID-${riderId}` : "—");
        setText("#profileDeliveries", Number(profile.deliveries || 0).toLocaleString());
        setText("#profileRating", profile.rating == null ? "Not rated" : Number(profile.rating).toFixed(1));
        setText("#profileRatingStat", profile.rating == null ? "Not rated" : Number(profile.rating).toFixed(1));
        setText("#profileRatingCount", `(${Number(profile.rating_count || 0)} ratings)`);
        setText("#riderVehicleType", profile.vehicle_type ? String(profile.vehicle_type).replaceAll("_", " ").replace(/^./, s => s.toUpperCase()) : "Not provided");
        setText("#riderVehiclePlate", profile.vehicle_plate || "Not provided");
        setText("#riderJoinedDate", profile.created_at ? new Date(profile.created_at).toLocaleDateString(undefined, {year:"numeric",month:"long",day:"numeric"}) : "Unavailable");
        const joined = profile.created_at ? new Date(profile.created_at) : null;
        setText("#profileExperience", joined && !Number.isNaN(joined.getTime()) ? (() => { const months = Math.max(0, (new Date().getFullYear()-joined.getFullYear())*12 + new Date().getMonth()-joined.getMonth()); return months < 1 ? "<1 mo." : months < 12 ? `${months} mo.` : `${Math.floor(months/12)} yr.`; })() : "Unavailable");
        const statusText = profile.is_active === false ? "Inactive" : (profile.approval_status || "pending").replace(/^./, s => s.toUpperCase());
        setText("#profileAccountStatus", statusText);
        setText("#riderInfoStatus", statusText);
        const availability = profile.availability || "offline";
        const availabilityEl = document.querySelector("#riderAvailabilityStatus");
        if (availabilityEl) {
            availabilityEl.classList.toggle("online", availability === "available" || availability === "on_delivery");
            availabilityEl.replaceChildren();
            const dot = document.createElement("span"); dot.className = "status-dot";
            const label = document.createElement("span");
            label.textContent = availability === "available" ? "Available" : availability === "on_delivery" ? "On delivery" : "Offline";
            availabilityEl.append(dot, label);
        }
        const avatarUrl = profile.avatar_url || profile.avatarUrl;
        const avatar = document.querySelector("#profileAvatar");
        if (avatar) {
            avatar.textContent = "";
            if (avatarUrl) {
                const img = document.createElement("img");
                img.src = avatarUrl; img.alt = "Rider profile photo"; img.referrerPolicy = "no-referrer";
                img.onerror = () => { avatar.textContent = initialsFor(firstNameInput?.value, lastNameInput?.value); };
                avatar.appendChild(img);
            } else avatar.textContent = initialsFor(firstNameInput?.value, lastNameInput?.value);
        }
        if (profile.emergency_contact_name != null && emergencyName) emergencyName.value = profile.emergency_contact_name;
        if (profile.emergency_contact_phone != null && emergencyPhone) emergencyPhone.value = profile.emergency_contact_phone;
        if (profile.emergency_contact_relationship != null && emergencyRelation) emergencyRelation.value = profile.emergency_contact_relationship;
        const passwordChanged = document.querySelector("#passwordChangedAt");
        if (passwordChanged) passwordChanged.textContent = profile.password_changed_at ? `Last changed ${new Date(profile.password_changed_at).toLocaleDateString()}` : "Change history unavailable";

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

            document.querySelectorAll(".profile-form input").forEach(input => { input.value = ""; });
            document.querySelectorAll(".profile-overview-content h2").forEach(el => { el.textContent = "Profile unavailable"; });
            const status = document.querySelector("#profileAccountStatus");
            if (status) status.textContent = "Could not load account";
            showMessage(error.message || "Could not load your profile. Please refresh or log in again.", "error");
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

    avatarEditButton?.addEventListener("click", async () => {
        const current = document.querySelector("#profileAvatar")?.querySelector("img")?.src || "";
        const url = window.prompt("Enter a publicly accessible HTTPS image URL for your profile photo. Uploading a file is not supported yet.", current);
        if (url === null) return;
        if (url && !/^https:\/\//i.test(url)) {
            showMessage("Use an HTTPS image URL.", "error"); return;
        }
        avatarEditButton.disabled = true;
        try {
            const result = await apiRequest("/riders/me", { method:"PATCH", body:JSON.stringify({avatar_url:url}) });
            const profile = result?.rider || result?.profile || result?.user || result;
            if (profile && typeof profile === "object") applyProfileData(profile);
            else await loadProfile();
            showMessage("Profile photo URL saved.", "success");
        } catch (error) {
            showMessage(error.message || "Could not save profile photo URL.", "error");
        } finally { avatarEditButton.disabled = false; }
    });

    /* =====================================================
       EMERGENCY CONTACT
       No emergency-contact API endpoint is wired here yet.
    ====================================================== */

    emergencySaveButton?.addEventListener("click", async () => {
        const name = emergencyName?.value.trim() || "";
        const phone = emergencyPhone?.value.trim() || "";
        const relation = emergencyRelation?.value || "";
        emergencyInputs.forEach(input => input.classList.remove("input-error"));
        if (name && name.length < 2) { emergencyName?.classList.add("input-error"); showMessage("Enter a contact name with at least 2 characters.", "error"); return; }
        if (phone && !/^[+0-9() .-]{7,25}$/.test(phone)) { emergencyPhone?.classList.add("input-error"); showMessage("Enter a valid emergency contact phone number.", "error"); return; }
        if (relation && !["Spouse","Parent","Sibling","Friend","Other"].includes(relation)) { showMessage("Select a valid relationship.", "error"); return; }
        emergencySaveButton.disabled = true;
        const oldText = emergencySaveButton.textContent;
        emergencySaveButton.textContent = "Saving...";
        try {
            await apiRequest("/riders/me", {method:"PATCH", body:JSON.stringify({
                emergency_contact_name:name, emergency_contact_phone:phone, emergency_contact_relationship:relation
            })});
            showMessage("Emergency contact saved.", "success");
        } catch (error) {
            showMessage(error.message || "Could not save emergency contact.", "error");
        } finally { emergencySaveButton.disabled = false; emergencySaveButton.textContent = oldText; }
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
