/* =========================================================
   RESTAURANT PROFILE
   FoodDelivery — Backend Integration
   ========================================================= */

document.addEventListener("DOMContentLoaded", () => {
    "use strict";

    const API_BASE = (window.FOOD_DELIVERY_API_BASE || document.querySelector('meta[name="api-base-url"]')?.content?.trim() || "http://localhost:5000/api").replace(/\/+$/, "");

    const $ = (id) => document.getElementById(id);

    const profileForm = $("restaurantProfileForm");
    const locationForm = $("restaurantLocationForm");

    const restaurantNameInput = $("restaurantName");
    const restaurantDescriptionInput = $("restaurantDescription");
    const restaurantPhoneInput = $("restaurantPhone");
    const restaurantEmailInput = $("restaurantEmail");

    const restaurantLocationNameInput = $("restaurantLocationName");
    const restaurantCoordinatesInput = $("restaurantCoordinates");

    const restaurantOpeningTimeInput = $("restaurantOpeningTime");
    const restaurantClosingTimeInput = $("restaurantClosingTime");

    const restaurantStatusButton = $("restaurantStatusButton");
    const restaurantStatusText = $("restaurantStatusText");

    const saveHoursButton = $("saveHoursButton");

    const profileMessage = $("profileMessage");

    const profileAvatar = document.querySelector(".profile-large-avatar");
    const topbarAvatar = document.querySelector(".topbar-avatar");

    const profileFields = [
        restaurantNameInput,
        restaurantDescriptionInput,
        restaurantPhoneInput,
        restaurantEmailInput,
        restaurantOpeningTimeInput,
        restaurantClosingTimeInput
    ].filter(Boolean);

    let restaurant = null;
    let restaurantIsOpen = false;
    let saving = false;
    let originalValues = {};

    /*
    |--------------------------------------------------------------------------
    | AUTHENTICATED API REQUEST
    |--------------------------------------------------------------------------
    */

    async function apiRequest(path, options = {}) {
        const token =
            localStorage.getItem("foodDeliveryAccessToken") ||
            sessionStorage.getItem("foodDeliveryAccessToken");

        if (!token) {
            throw new Error("Your session has expired. Please log in again.");
        }

        const headers = {
            Authorization: `Bearer ${token}`,
            Accept: "application/json",
            ...(options.body ? { "Content-Type": "application/json" } : {}),
            ...(options.headers || {})
        };

        const response = await fetch(`${API_BASE}${path}`, {
            ...options,
            headers
        });

        let result;

        try {
            result = await response.json();
        } catch {
            throw new Error("The server returned an invalid response.");
        }

        if (!response.ok || result.success === false) {
            throw new Error(
                result.message || `Request failed (${response.status}).`
            );
        }

        return result;
    }

    /*
    |--------------------------------------------------------------------------
    | LOAD RESTAURANT PROFILE
    |--------------------------------------------------------------------------
    */

    async function loadProfile() {
        showMessage("Loading your restaurant profile...", "info");

        try {
            const result = await apiRequest("/restaurants/owner/me");

            restaurant = result.data?.restaurant;

            if (!restaurant) {
                throw new Error("The restaurant profile was not returned.");
            }

            populateProfile(restaurant);
            storeOriginalValues();
            updateRestaurantStatusUI();

            hideMessage();
        } catch (error) {
            console.error("Loading restaurant profile failed:", error);
            showMessage(error.message, "error");
        }
    }

    function populateProfile(data) {
        setValue(restaurantNameInput, data.name);
        setValue(restaurantDescriptionInput, data.description);
        setValue(restaurantPhoneInput, data.phone);
        setValue(restaurantEmailInput, data.email);

        const firstName = String(data.name || "Restaurant").trim().split(/\s+/)[0] || "Restaurant";
        setValue(restaurantLocationNameInput, data.location_name || `${firstName} Location`);
        const hasCoordinates = data.latitude !== null && data.latitude !== undefined && data.longitude !== null && data.longitude !== undefined;
        setValue(restaurantCoordinatesInput, hasCoordinates ? `${Number(data.latitude).toFixed(6)}, ${Number(data.longitude).toFixed(6)}` : "Live location not set");

        setTimeValue(restaurantOpeningTimeInput, data.opening_time);
        setTimeValue(restaurantClosingTimeInput, data.closing_time);

        restaurantIsOpen = data.is_open === true;

        updateRestaurantName(data.name);
        updateRestaurantSummary(data);
        updateRestaurantStatusUI();
    }

    function setValue(element, value) {
        if (!element) return;

        element.value = value === null || value === undefined
            ? ""
            : String(value);
    }

    function setTimeValue(element, value) {
        if (!element || !value) return;

        // PostgreSQL TIME values may be returned as HH:MM:SS.
        element.value = String(value).slice(0, 5);
    }

    function storeOriginalValues() {
        originalValues = {};

        profileFields.forEach((field) => {
            originalValues[field.id] = field.value;
        });
    }

    function restoreOriginalValues() {
        profileFields.forEach((field) => {
            if (Object.prototype.hasOwnProperty.call(
                originalValues,
                field.id
            )) {
                field.value = originalValues[field.id];
            }
        });
    }

    /*
    |--------------------------------------------------------------------------
    | SAVE RESTAURANT INFORMATION
    |--------------------------------------------------------------------------
    */

    profileForm?.addEventListener("submit", async (event) => {
        event.preventDefault();

        if (!validateContactInformation()) return;

        await saveRestaurant({
            name: getValue(restaurantNameInput),
            description: getValue(restaurantDescriptionInput),
            phone: getValue(restaurantPhoneInput),
            email: getValue(restaurantEmailInput)
        }, "Restaurant information saved successfully.");
    });

    /*
    |--------------------------------------------------------------------------
    | SAVE LOCATION
    |--------------------------------------------------------------------------
    */

    // Contact and location fields are read-only in the restaurant portal.
    // Their values are loaded from the API, but cannot be submitted from this page.

    /*
    |--------------------------------------------------------------------------
    | SAVE OPERATING HOURS
    |--------------------------------------------------------------------------
    |
    | The backend currently stores one opening_time and closing_time pair,
    | not a separate schedule for each day of the week.
    |
    | Save the two supported time inputs if they exist on this page.
    |--------------------------------------------------------------------------
    */

    saveHoursButton?.addEventListener("click", async () => {
        if (!restaurantOpeningTimeInput || !restaurantClosingTimeInput) {
            showMessage(
                "The page does not have the opening and closing time fields required by the backend.",
                "error"
            );
            return;
        }

        const openingTime = restaurantOpeningTimeInput.value;
        const closingTime = restaurantClosingTimeInput.value;

        if (!openingTime || !closingTime) {
            showMessage("Please select both opening and closing times.", "error");
            return;
        }

        if (openingTime === closingTime) {
            showMessage(
                "Opening and closing times cannot be identical.",
                "error"
            );
            return;
        }

        await saveRestaurant({
            opening_time: openingTime,
            closing_time: closingTime
        }, "Operating hours saved successfully.");
    });

    /*
    |--------------------------------------------------------------------------
    | COMMON SAVE FUNCTION
    |--------------------------------------------------------------------------
    */

    async function saveRestaurant(payload, successMessage) {
        if (saving) return;

        saving = true;

        const buttons = [
            ...document.querySelectorAll(
                "#restaurantProfileForm button, " +
                "#restaurantLocationForm button, " +
                "#saveHoursButton"
            )
        ];

        const previousDisabledStates = buttons.map(
            (button) => button.disabled
        );

        buttons.forEach((button) => {
            button.disabled = true;
        });

        try {
            const result = await apiRequest("/restaurants/owner/me", {
                method: "PUT",
                body: JSON.stringify(payload)
            });

            restaurant = result.data?.restaurant || {
                ...(restaurant || {}),
                ...payload
            };

            /*
             * Reload from the backend after saving so that the page
             * reflects the persisted database values.
             */
            const reloadResult = await apiRequest("/restaurants/owner/me");

            if (reloadResult.data?.restaurant) {
                restaurant = reloadResult.data.restaurant;
            }

            populateProfile(restaurant);
            storeOriginalValues();

            showMessage(successMessage, "success");
        } catch (error) {
            console.error("Saving restaurant profile failed:", error);
            showMessage(error.message, "error");
        } finally {
            saving = false;

            buttons.forEach((button, index) => {
                button.disabled = previousDisabledStates[index];
            });
        }
    }

    /*
    |--------------------------------------------------------------------------
    | VALIDATION
    |--------------------------------------------------------------------------
    */

    function validateContactInformation() {
        const name = getValue(restaurantNameInput);
        const email = getValue(restaurantEmailInput);
        const phone = getValue(restaurantPhoneInput);

        if (name.length < 2) {
            showMessage(
                "Restaurant name must contain at least 2 characters.",
                "error"
            );
            restaurantNameInput?.focus();
            return false;
        }

        if (email && !isValidEmail(email)) {
            showMessage("Please enter a valid email address.", "error");
            restaurantEmailInput?.focus();
            return false;
        }

        if (phone && phone.replace(/\D/g, "").length < 9) {
            showMessage("Please enter a valid phone number.", "error");
            restaurantPhoneInput?.focus();
            return false;
        }

        return true;
    }

    /*
    |--------------------------------------------------------------------------
    | OPEN / CLOSED STATUS
    |--------------------------------------------------------------------------
    */

    restaurantStatusButton?.addEventListener("click", async () => {
        if (!restaurant) {
            showMessage("Load your restaurant profile before changing status.", "error");
            return;
        }

        const newStatus = !restaurantIsOpen;

        restaurantStatusButton.disabled = true;

        try {
            const result = await apiRequest("/restaurants/owner/status", {
                method: "PATCH",
                body: JSON.stringify({
                    is_open: newStatus
                })
            });

            if (result.data?.restaurant) {
                restaurant = {
                    ...restaurant,
                    ...result.data.restaurant
                };
            }

            restaurantIsOpen = restaurant?.is_open === true;
            updateRestaurantStatusUI();

            showMessage(
                newStatus
                    ? "Your restaurant is now open."
                    : "Your restaurant is now closed.",
                "success"
            );
        } catch (error) {
            console.error("Updating restaurant status failed:", error);
            showMessage(error.message, "error");
        } finally {
            restaurantStatusButton.disabled = false;
        }
    });

    function updateRestaurantStatusUI() {
        if (!restaurantStatusButton) return;

        const statusDot = restaurantStatusButton.querySelector(".status-dot");

        restaurantStatusButton.classList.toggle("open", restaurantIsOpen);
        restaurantStatusButton.classList.toggle("closed", !restaurantIsOpen);

        statusDot?.classList.toggle("open", restaurantIsOpen);
        statusDot?.classList.toggle("closed", !restaurantIsOpen);

        if (restaurantStatusText) {
            restaurantStatusText.textContent = restaurantIsOpen
                ? "Open"
                : "Closed";
        }

        const hoursStatus = document.querySelector(".profile-hours-status");

        if (hoursStatus) {
            hoursStatus.textContent = restaurantIsOpen
                ? "Order acceptance: Open"
                : "Order acceptance: Closed";
        }
    }

    /*
    |--------------------------------------------------------------------------
    | UPDATE RESTAURANT NAME AND AVATAR
    |--------------------------------------------------------------------------
    */

    function updateRestaurantName(name) {
        if (!name) return;

        document.querySelectorAll(
            ".restaurant-profile-info strong, " +
            ".topbar-profile-text strong, " +
            ".profile-overview-info h2"
        ).forEach((element) => {
            element.textContent = name;
        });

        const initials = getInitials(name);

        if (profileAvatar) profileAvatar.textContent = initials;
        if (topbarAvatar) topbarAvatar.textContent = initials;
    }

    function updateRestaurantSummary(data) {
        const idElement = $("restaurantIdText");
        const sinceElement = $("memberSinceText");
        const ordersElement = $("totalOrdersText");
        const activeStatus = document.querySelector(".profile-active-status");

        if (idElement) {
            idElement.textContent = data.id ? `Restaurant ID: REST-${String(data.id).padStart(4, "0")}` : "Restaurant ID: —";
        }

        if (sinceElement) {
            if (data.created_at) {
                const date = new Date(data.created_at);
                sinceElement.textContent = Number.isNaN(date.getTime())
                    ? "—"
                    : date.toLocaleDateString(undefined, {
                        year: "numeric",
                        month: "long",
                        day: "2-digit"
                    });
            } else {
                sinceElement.textContent = "—";
            }
        }

        if (ordersElement) {
            const count = Number(data.total_orders);
            ordersElement.textContent = Number.isFinite(count) ? String(count) : "0";
        }

        if (activeStatus) {
            const approvedAndActive = data.is_active === true && data.approval_status === "approved";
            activeStatus.textContent = approvedAndActive
                ? "Active Restaurant"
                : (data.approval_status === "pending"
                    ? "Awaiting Approval"
                    : (data.approval_status === "rejected"
                        ? "Approval Rejected"
                        : "Inactive Restaurant"));
            activeStatus.classList.toggle("inactive", !approvedAndActive);
        }
    }

    /*
    |--------------------------------------------------------------------------
    | CANCEL BUTTONS
    |--------------------------------------------------------------------------
    */

    profileForm?.querySelector('button[type="reset"]')
        ?.addEventListener("click", (event) => {
            event.preventDefault();
            restoreOriginalValues();
            hideMessage();
        });

    locationForm?.querySelector('button[type="reset"]')
        ?.addEventListener("click", (event) => {
            event.preventDefault();
            restoreOriginalValues();
            hideMessage();
        });

    /*
    |--------------------------------------------------------------------------
    | SIDEBAR
    |--------------------------------------------------------------------------
    */

    $("restaurantMenuButton")?.addEventListener("click", () => {
        $("restaurantSidebar")?.classList.toggle("active");
    });

    document.addEventListener("click", (event) => {
        const sidebar = $("restaurantSidebar");
        const menuButton = $("restaurantMenuButton");

        if (
            sidebar &&
            menuButton &&
            !sidebar.contains(event.target) &&
            !menuButton.contains(event.target)
        ) {
            sidebar.classList.remove("active");
        }
    });

    /*
    |--------------------------------------------------------------------------
    | HELPERS
    |--------------------------------------------------------------------------
    */

    function getValue(element) {
        return element ? element.value.trim() : "";
    }

    function isValidEmail(email) {
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    }

    function getInitials(name) {
        const words = String(name || "").trim().split(/\s+/).filter(Boolean);

        if (words.length === 0) return "R";

        if (words.length === 1) {
            return words[0].slice(0, 2).toUpperCase();
        }

        return (words[0][0] + words[1][0]).toUpperCase();
    }

    function showMessage(message, type = "info") {
        if (!profileMessage) {
            console.info(message);
            return;
        }

        profileMessage.textContent = message;
        profileMessage.className = `profile-message show ${type}`;

        clearTimeout(showMessage.timer);

        showMessage.timer = setTimeout(() => {
            hideMessage();
        }, 5000);
    }

    function hideMessage() {
        if (!profileMessage) return;

        profileMessage.className = "profile-message";
        profileMessage.textContent = "";
    }

    /*
    |--------------------------------------------------------------------------
    | START
    |--------------------------------------------------------------------------
    */

    loadProfile();
});