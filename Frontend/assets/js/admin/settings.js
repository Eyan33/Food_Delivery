
/* =========================================================
   FOOD DELIVERY — ADMIN SETTINGS
   File: Frontend/assets/js/admin/settings.js

   Connected backend endpoints:
   GET  /api/admins/me
   PUT  /api/admins/:id

   Uses the existing FoodDeliveryAuthApi from auth-api.js.

   IMPORTANT:
   General, payment, delivery, notification, and advanced
   security preferences require backend persistence endpoints.
   This file does not falsely report those settings as saved.
========================================================= */

document.addEventListener("DOMContentLoaded", () => {
    "use strict";

    const API = window.FoodDeliveryAuthApi;

    const configuredBaseUrl = document
        .querySelector('meta[name="api-base-url"]')
        ?.content?.trim();

    const API_BASE_URL = (
        configuredBaseUrl || (window.FOOD_DELIVERY_API_BASE || document.querySelector('meta[name="api-base-url"]')?.content?.trim() || "http://localhost:5000/api").replace(/\/+$/, "")
    ).replace(/\/+$/, "");

    const ADMINS_ENDPOINT = `${API_BASE_URL}/admins`;

    const navLinks = document.querySelectorAll(
        ".admin-settings-nav-link"
    );

    const sections = document.querySelectorAll(
        ".admin-settings-section"
    );

    const messageBox = document.getElementById("adminMessage");

    let currentAdmin = null;
    let messageTimeout = null;
    let passwordModal = null;
    let originalValues = new Map();

    /* =====================================================
       MESSAGES
    ===================================================== */

    function showMessage(message, type = "success") {
        if (!messageBox) {
            console[type === "danger" || type === "error"
                ? "error"
                : "log"](message);
            return;
        }

        messageBox.textContent = message;
        messageBox.className = `admin-message ${type} visible`;

        clearTimeout(messageTimeout);

        messageTimeout = setTimeout(() => {
            messageBox.classList.remove("visible");
        }, 5000);

        messageBox.scrollIntoView({
            behavior: "smooth",
            block: "nearest"
        });
    }

    function getErrorMessage(error, fallback) {
        return error?.message || fallback;
    }

    /* =====================================================
       API HELPERS
    ===================================================== */

    async function apiRequest(path, options = {}) {
        if (!API?.request) {
            throw new Error(
                "FoodDeliveryAuthApi is unavailable. " +
                "Load assets/js/auth/auth-api.js before settings.js."
            );
        }

        if (!API.getToken?.()) {
            throw new Error(
                "Your session is missing or expired. Please log in again."
            );
        }

        return API.request(path, {
            ...options,
            authenticated: true
        });
    }

    /* =====================================================
       SECTION NAVIGATION
    ===================================================== */

    navLinks.forEach((link) => {
        link.addEventListener("click", () => {
            const sectionName = link.dataset.settingsSection;
            const targetId = `settings-${sectionName}`;

            navLinks.forEach((item) => {
                item.classList.toggle("active", item === link);
            });

            sections.forEach((section) => {
                section.classList.toggle(
                    "active",
                    section.id === targetId
                );
            });
        });
    });

    /* =====================================================
       VALIDATION
    ===================================================== */

    function isValidEmail(value) {
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
    }

    function markInvalid(field, invalid) {
        if (!field) return;

        field.style.borderColor = invalid ? "#d64545" : "";
        field.setAttribute("aria-invalid", String(invalid));
    }

    function getField(id) {
        return document.getElementById(id);
    }

    function setFieldValue(id, value) {
        const field = getField(id);

        if (field && value !== undefined && value !== null) {
            field.value = value;
        }
    }

    /* =====================================================
       SNAPSHOT / CANCEL HELPERS
    ===================================================== */

    function rememberSectionValues(section) {
        if (!section) return;

        section.querySelectorAll("input, textarea, select").forEach(
            (field) => {
                if (!field.id) return;

                originalValues.set(field.id, {
                    value: field.value,
                    checked: field.type === "checkbox"
                        ? field.checked
                        : undefined
                });
            }
        );
    }

   
function restoreSectionValues(section) {
    if (!section) return;

    section.querySelectorAll("input, textarea, select").forEach((field) => {
        const saved = originalValues.get(field.id);

        if (!saved) return;

        if (field.type === "checkbox") {
            field.checked = saved.checked;
        } else if (!field.disabled) {
            field.value = saved.value;
        }

        markInvalid(field, false);
    });

    showMessage("Unsaved changes were discarded.", "info");
}

    document.querySelectorAll(".admin-settings-section").forEach(
        rememberSectionValues
    );

    /* =====================================================
       ADMIN PROFILE — LOAD
    ===================================================== */

    function renderAdminProfile(admin) {
        if (!admin) return;

        const firstName = admin.first_name || "";
        const lastName = admin.last_name || "";
        const fullName = `${firstName} ${lastName}`.trim();

        setFieldValue("adminName", fullName);
        setFieldValue("adminEmail", admin.email || "");
        setFieldValue("adminPhone", admin.phone || "");
        setFieldValue(
            "adminRole",
            admin.role === "admin" ? "Administrator" : admin.role || ""
        );

        const profileCard = document.querySelector(
            "#settings-account .admin-settings-profile"
        );

        if (profileCard) {
            const avatar = profileCard.querySelector(
                ".admin-settings-large-avatar"
            );

            const strong = profileCard.querySelector("strong");

            if (avatar) {
                avatar.textContent = fullName
                    ? fullName.charAt(0).toUpperCase()
                    : "A";
            }

            if (strong) {
                strong.textContent = fullName || "Administrator";
            }
        }

        // Update the sidebar/topbar labels only if those elements exist.
        document.querySelectorAll(
            ".admin-profile-info strong, " +
            ".admin-topbar-profile-info strong"
        ).forEach((element) => {
            element.textContent = fullName || "Administrator";
        });

        document.querySelectorAll(
            ".admin-profile-info span, " +
            ".admin-topbar-profile-info span"
        ).forEach((element) => {
            if (!element.textContent.trim()) {
                element.textContent = "Administrator";
            }
        });

        rememberSectionValues(
            document.getElementById("settings-account")
        );
    }

    async function loadAdminProfile() {
        try {
            const result = await apiRequest("/admins/me");

            const admin = result?.admin || result?.data?.admin;

            if (!admin || !admin.id) {
                throw new Error(
                    "The API did not return a valid administrator profile."
                );
            }

            currentAdmin = admin;
            renderAdminProfile(admin);
        } catch (error) {
            console.error("Failed to load administrator profile:", error);

            showMessage(
                getErrorMessage(
                    error,
                    "Could not load your administrator profile."
                ),
                "danger"
            );
        }
    }

    /* =====================================================
       ADMIN PROFILE — SAVE
    ===================================================== */

    function splitFullName(fullName) {
        const parts = fullName.trim().split(/\s+/).filter(Boolean);

        if (parts.length < 2) {
            return {
                first_name: "",
                last_name: ""
            };
        }

        return {
            first_name: parts[0],
            last_name: parts.slice(1).join(" ")
        };
    }

    function validateAdminProfile() {
        const nameField = getField("adminName");
        const emailField = getField("adminEmail");
        const phoneField = getField("adminPhone");

        const name = nameField?.value.trim() || "";
        const email = emailField?.value.trim() || "";
        const phone = phoneField?.value.trim() || "";

        const nameParts = splitFullName(name);

        const nameValid =
            nameParts.first_name.length >= 2 &&
            nameParts.last_name.length >= 2;

        const emailValid = isValidEmail(email);

        markInvalid(nameField, !nameValid);
        markInvalid(emailField, !emailValid);
        markInvalid(phoneField, false);

        if (!nameValid) {
            showMessage(
                "Enter your first and last name, with at least 2 characters each.",
                "danger"
            );
            return null;
        }

        if (!emailValid) {
            showMessage(
                "Enter a valid administrator email address.",
                "danger"
            );
            return null;
        }

        return {
            ...nameParts,
            email,
            phone: phone || null
        };
    }

    async function saveAdminProfile(button) {
        if (!currentAdmin?.id) {
            showMessage(
                "Your administrator profile has not loaded. Refresh the page and try again.",
                "danger"
            );
            return;
        }

        const payload = validateAdminProfile();

        if (!payload) return;

        const originalText = button.textContent;

        button.disabled = true;
        button.textContent = "Saving…";

        try {
            const result = await apiRequest(
                `/admins/${encodeURIComponent(currentAdmin.id)}`,
                {
                    method: "PUT",
                    body: payload
                }
            );

            const updatedAdmin =
                result?.admin ||
                result?.data?.admin ||
                result;

            if (
                !updatedAdmin ||
                updatedAdmin.id === undefined
            ) {
                throw new Error(
                    "The server did not return the updated administrator profile."
                );
            }

            currentAdmin = updatedAdmin;
            renderAdminProfile(updatedAdmin);

            showMessage(
                "Administrator account updated successfully.",
                "success"
            );
        } catch (error) {
            console.error("Failed to save administrator profile:", error);

            showMessage(
                getErrorMessage(
                    error,
                    "Could not update your administrator account."
                ),
                "danger"
            );
        } finally {
            button.disabled = false;
            button.textContent = originalText;
        }
    }

    const accountSection = getField("settings-account");

    accountSection
        ?.querySelector(".admin-save-button")
        ?.addEventListener("click", (event) => {
            saveAdminProfile(event.currentTarget);
        });

    /* =====================================================
       GENERAL / PAYMENT / DELIVERY / NOTIFICATION SETTINGS
       
       These features currently have no matching backend
       persistence endpoints in the supplied project.
       Do not show fake success messages.
    ===================================================== */

    const notConnectedSections = [
        {
            id: "settings-general",
            message:
                "General settings are not connected yet. " +
                "A backend settings endpoint and database storage are required."
        },
        {
            id: "settings-payments",
            message:
                "Payment preferences are not saved. " +
                "A backend endpoint is required before payment methods or transaction fees can be changed."
        },
        {
            id: "settings-delivery",
            message:
                "Platform-wide delivery settings are not saved. " +
                "The backend must define how these values affect order calculations."
        },
        {
            id: "settings-notifications",
            message:
                "Notification preferences are not saved. " +
                "A backend endpoint and persistent storage are required."
        }
    ];

    notConnectedSections.forEach(({ id, message }) => {
        const section = getField(id);

        if (!section) return;

        const saveButton = section.querySelector(
            ".admin-save-button"
        );

        if (saveButton) {
            saveButton.addEventListener("click", () => {
                showMessage(message, "info");
            });
        }

        const cancelButton = section.querySelector(
            ".admin-secondary-button"
        );

        if (cancelButton) {
            cancelButton.addEventListener("click", () => {
                restoreSectionValues(section);
            });
        }
    });

    /* =====================================================
       AVATAR PLACEHOLDER
    ===================================================== */

    const avatarButton = accountSection?.querySelector(
        ".admin-secondary-button"
    );

    avatarButton?.addEventListener("click", () => {
        showMessage(
            "Avatar upload is not implemented yet.",
            "info"
        );
    });

    /* =====================================================
       PASSWORD MODAL
       
       No secure current-password verification endpoint
       exists in the supplied backend. Do not send a new
       password to PUT /admins/:id because that endpoint
       does not verify the current password.
    ===================================================== */

    function injectPasswordModalStyles() {
        if (getField("admin-change-password-styles")) return;

        const style = document.createElement("style");
        style.id = "admin-change-password-styles";

        style.textContent = `
            .admin-modal-overlay {
                position: fixed;
                inset: 0;
                background: rgba(15, 15, 20, 0.55);
                display: flex;
                align-items: center;
                justify-content: center;
                z-index: 1000;
                padding: 1rem;
            }

            .admin-modal-overlay.hidden {
                display: none;
            }

            .admin-modal {
                background: var(--admin-card-bg, #fff);
                color: var(--admin-text, #1a1a1a);
                width: 100%;
                max-width: 440px;
                max-height: 90vh;
                overflow-y: auto;
                border-radius: 12px;
                padding: 1.5rem;
                box-shadow: 0 20px 50px rgba(0,0,0,.25);
            }

            .admin-modal-header {
                display: flex;
                align-items: center;
                justify-content: space-between;
                margin-bottom: 1.25rem;
            }

            .admin-modal-header h3 {
                margin: 0;
                font-size: 1.1rem;
            }

            .admin-modal-close {
                background: none;
                border: none;
                font-size: 1.4rem;
                cursor: pointer;
                color: inherit;
            }

            .admin-form-group {
                margin-bottom: 1rem;
                display: flex;
                flex-direction: column;
                gap: .4rem;
            }

            .admin-form-group label {
                font-size: .85rem;
                font-weight: 600;
            }

            .admin-form-group input {
                padding: .6rem .75rem;
                border: 1px solid var(--admin-border, #ddd);
                border-radius: 8px;
                font: inherit;
                background: var(--admin-input-bg, #fff);
                color: inherit;
            }

            .admin-form-error {
                font-size: .78rem;
                color: #d64545;
                display: none;
            }

            .admin-form-error.visible {
                display: block;
            }

            .admin-modal-actions {
                display: flex;
                justify-content: flex-end;
                gap: .75rem;
                margin-top: 1.5rem;
            }
        `;

        document.head.appendChild(style);
    }

    function buildPasswordModal() {
        injectPasswordModalStyles();

        const overlay = document.createElement("div");
        overlay.className = "admin-modal-overlay hidden";
        overlay.id = "adminChangePasswordOverlay";

        overlay.innerHTML = `
            <div
                class="admin-modal"
                role="dialog"
                aria-modal="true"
                aria-labelledby="changePasswordTitle"
            >
                <div class="admin-modal-header">
                    <h3 id="changePasswordTitle">Change Password</h3>
                    <button
                        type="button"
                        class="admin-modal-close"
                        aria-label="Close"
                    >×</button>
                </div>

                <form id="adminChangePasswordForm" novalidate>
                    <div class="admin-form-group">
                        <label for="currentPassword">Current Password</label>
                        <input
                            type="password"
                            id="currentPassword"
                            name="currentPassword"
                            autocomplete="current-password"
                            required
                        />
                        <span class="admin-form-error"
                            data-error-for="currentPassword">
                            Enter your current password.
                        </span>
                    </div>

                    <div class="admin-form-group">
                        <label for="newPassword">New Password</label>
                        <input
                            type="password"
                            id="newPassword"
                            name="newPassword"
                            autocomplete="new-password"
                            minlength="8"
                            required
                        />
                        <span class="admin-form-error"
                            data-error-for="newPassword">
                            Password must contain at least 8 characters.
                        </span>
                    </div>

                    <div class="admin-form-group">
                        <label for="confirmPassword">Confirm New Password</label>
                        <input
                            type="password"
                            id="confirmPassword"
                            name="confirmPassword"
                            autocomplete="new-password"
                            required
                        />
                        <span class="admin-form-error"
                            data-error-for="confirmPassword">
                            Passwords do not match.
                        </span>
                    </div>

                    <p>
                        Password changing will become available after
                        the secure backend endpoint is implemented.
                    </p>

                    <div class="admin-modal-actions">
                        <button
                            type="button"
                            class="admin-secondary-button"
                            id="adminChangePasswordCancel"
                        >Cancel</button>

                        <button
                            type="submit"
                            class="admin-primary-button"
                        >Update Password</button>
                    </div>
                </form>
            </div>
        `;

        document.body.appendChild(overlay);
        return overlay;
    }

    function closePasswordModal() {
        if (!passwordModal) return;

        passwordModal.classList.add("hidden");

        const form = getField("adminChangePasswordForm");
        form?.reset();

        form?.querySelectorAll(".admin-form-error").forEach((error) => {
            error.classList.remove("visible");
        });
    }

    function openPasswordModal() {
        if (!passwordModal) {
            passwordModal = buildPasswordModal();

            passwordModal.querySelector(
                ".admin-modal-close"
            )?.addEventListener("click", closePasswordModal);

            getField("adminChangePasswordCancel")
                ?.addEventListener("click", closePasswordModal);

            passwordModal.addEventListener("click", (event) => {
                if (event.target === passwordModal) {
                    closePasswordModal();
                }
            });

            getField("adminChangePasswordForm")
                ?.addEventListener("submit", (event) => {
                    event.preventDefault();

                    const form = event.currentTarget;
                    const current = form.currentPassword.value;
                    const next = form.newPassword.value;
                    const confirm = form.confirmPassword.value;

                    const errors = {
                        currentPassword: !current.trim(),
                        newPassword: next.length < 8,
                        confirmPassword:
                            !confirm || next !== confirm
                    };

                    Object.entries(errors).forEach(([name, invalid]) => {
                        form.querySelector(
                            `[data-error-for="${name}"]`
                        )?.classList.toggle("visible", invalid);
                    });

                    if (Object.values(errors).some(Boolean)) return;

                    showMessage(
                        "Password change is not connected yet. " +
                        "A secure backend endpoint must verify your current password first.",
                        "info"
                    );
                });
        }

        passwordModal.classList.remove("hidden");

        getField("currentPassword")?.focus();
    }

    document.addEventListener("keydown", (event) => {
        if (
            event.key === "Escape" &&
            passwordModal &&
            !passwordModal.classList.contains("hidden")
        ) {
            closePasswordModal();
        }
    });

    const securitySection = getField("settings-security");

    const changePasswordButton = securitySection?.querySelector(
        ".admin-settings-security-block .admin-save-button"
    );

    changePasswordButton?.addEventListener(
        "click",
        openPasswordModal
    );

    const securitySaveButton = securitySection?.querySelector(
        ".admin-settings-footer .admin-save-button"
    );

    securitySaveButton?.addEventListener("click", () => {
        showMessage(
            "Advanced security preferences are not connected to the backend yet.",
            "info"
        );
    });

    /* =====================================================
       INITIALIZATION
    ===================================================== */

    loadAdminProfile();
});