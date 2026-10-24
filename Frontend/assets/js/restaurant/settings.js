document.addEventListener("DOMContentLoaded", () => {

    /* =========================================================
       ELEMENTS
    ========================================================== */

    const sidebar =
        document.getElementById("restaurantSidebar");

    const menuButton =
        document.getElementById("restaurantMenuButton");

    const restaurantStatusButton =
        document.getElementById("restaurantStatusButton");

    const restaurantStatusText =
        document.getElementById("restaurantStatusText");

    const settingsNavItems =
        document.querySelectorAll(".settings-nav-item");

    const settingsSections =
        document.querySelectorAll(".settings-section");

    const settingsMessage = document.getElementById("settingsMessage");
    const API_BASE = (window.FOOD_DELIVERY_API_BASE || "http://localhost:5000/api").replace(/\/+$/, "");
    const TOKEN_KEY = "foodDeliveryAccessToken";
    let restaurantRecord = null;
    let ownerRecord = null;

    async function apiRequest(path, options = {}) {
        const token = localStorage.getItem(TOKEN_KEY) || sessionStorage.getItem(TOKEN_KEY);
        if (!token) throw new Error("Your session has expired. Please log in again.");
        const response = await fetch(API_BASE + path, {
            ...options,
            headers: { Accept: "application/json", Authorization: "Bearer " + token,
                ...(options.body ? { "Content-Type": "application/json" } : {}), ...(options.headers || {}) }
        });
        let result;
        try { result = await response.json(); } catch { throw new Error("The server returned an invalid response."); }
        if (!response.ok || result.success === false) throw new Error(result.message || "Request failed (" + response.status + ").");
        return result;
    }
    function setField(id, value) { const el = document.getElementById(id); if (el) el.value = value == null ? "" : String(value); }
    function paintStatus(isOpen) {
        if (restaurantStatusButton) {
            restaurantStatusButton.disabled = false;
            restaurantStatusButton.classList.toggle("open", isOpen);
            restaurantStatusButton.classList.toggle("closed", !isOpen);
            restaurantStatusButton.setAttribute("aria-pressed", String(isOpen));
        }
        if (restaurantStatusText) restaurantStatusText.textContent = isOpen ? "Restaurant Open" : "Restaurant Closed";
    }
    function paintIdentity() {
        const name = restaurantRecord?.name || "Restaurant";
        const owner = [ownerRecord?.first_name, ownerRecord?.last_name].filter(Boolean).join(" ") || "Restaurant account";
        ["sidebarRestaurantName", "topbarRestaurantName"].forEach(id => { const el = document.getElementById(id); if (el) el.textContent = name; });
        ["accountDisplayName", "topbarOwnerName"].forEach(id => { const el = document.getElementById(id); if (el) el.textContent = owner; });
        const initials = owner.split(/\s+/).map(part => part[0]).join("").slice(0, 2).toUpperCase() || "R";
        document.querySelectorAll(".restaurant-avatar, .restaurant-topbar-avatar, .settings-profile-avatar").forEach(el => el.textContent = initials);
    }
    async function loadServerSettings() {
        const [rr, ur] = await Promise.all([apiRequest("/restaurants/owner/me"), apiRequest("/auth/me")]);
        restaurantRecord = rr.data?.restaurant;
        ownerRecord = ur.data?.user;
        if (!restaurantRecord || !ownerRecord) throw new Error("Your restaurant or account profile was not returned.");
        setField("restaurantName", restaurantRecord.name);
        setField("restaurantEmail", restaurantRecord.email);
        setField("restaurantPhone", restaurantRecord.phone);
        setField("restaurantAddress", restaurantRecord.address);
        setField("adminFirstName", ownerRecord.first_name);
        setField("adminLastName", ownerRecord.last_name);
        setField("adminEmail", ownerRecord.email);
        paintStatus(restaurantRecord.is_open === true);
        paintIdentity();
    }


    /* =========================================================
       GENERAL SETTINGS
    ========================================================== */

    const restaurantName =
        document.getElementById("restaurantName");

    const restaurantEmail =
        document.getElementById("restaurantEmail");

    const restaurantPhone =
        document.getElementById("restaurantPhone");

    const restaurantAddress =
        document.getElementById("restaurantAddress");

    const restaurantCurrency =
        document.getElementById("restaurantCurrency");

    const restaurantTimezone =
        document.getElementById("restaurantTimezone");

    const autoAcceptOrders =
        document.getElementById("autoAcceptOrders");

    const showRestaurantOpen =
        document.getElementById("showRestaurantOpen");

    const saveGeneralButton =
        document.getElementById("saveGeneralButton");

    const resetGeneralButton =
        document.getElementById("resetGeneralButton");


    /* =========================================================
       ACCOUNT SETTINGS
    ========================================================== */

    const adminFirstName =
        document.getElementById("adminFirstName");

    const adminLastName =
        document.getElementById("adminLastName");

    const adminEmail =
        document.getElementById("adminEmail");

    const saveAccountButton =
        document.getElementById("saveAccountButton");


    /* =========================================================
       NOTIFICATION SETTINGS
    ========================================================== */

    const newOrderNotifications =
        document.getElementById("newOrderNotifications");

    const orderUpdateNotifications =
        document.getElementById("orderUpdateNotifications");

    const promotionNotifications =
        document.getElementById("promotionNotifications");

    const emailNotifications =
        document.getElementById("emailNotifications");

    const saveNotificationButton =
        document.getElementById("saveNotificationButton");


    /* =========================================================
       SECURITY SETTINGS
    ========================================================== */

    const currentPassword =
        document.getElementById("currentPassword");

    const newPassword =
        document.getElementById("newPassword");

    const confirmPassword =
        document.getElementById("confirmPassword");

    const loginNotifications =
        document.getElementById("loginNotifications");

    const changePasswordButton =
        document.getElementById("changePasswordButton");


    /* =========================================================
       ORDER SETTINGS
    ========================================================== */

    const defaultPreparationTime =
        document.getElementById("defaultPreparationTime");

    const maximumOrders =
        document.getElementById("maximumOrders");

    const orderSound =
        document.getElementById("orderSound");

    const browserNotifications =
        document.getElementById("browserNotifications");

    const newOrdersTop =
        document.getElementById("newOrdersTop");

    const saveOrderSettingsButton =
        document.getElementById("saveOrderSettingsButton");


    /* =========================================================
       SIDEBAR
    ========================================================== */

    if (menuButton && sidebar) {

        menuButton.addEventListener("click", (event) => {

            event.stopPropagation();

            sidebar.classList.toggle("active");

        });

    }


    /* =========================================================
       CLOSE SIDEBAR WHEN CLICKING OUTSIDE
    ========================================================== */

    document.addEventListener("click", (event) => {

        if (!sidebar || !menuButton) {
            return;
        }

        if (
            sidebar.classList.contains("active") &&
            !sidebar.contains(event.target) &&
            !menuButton.contains(event.target)
        ) {

            sidebar.classList.remove("active");

        }

    });


    /* =========================================================
       RESTAURANT OPEN / CLOSED STATUS
    ========================================================== */

    let restaurantOpen = false;

    function updateRestaurantStatus() {

        if (
            !restaurantStatusButton ||
            !restaurantStatusText
        ) {
            return;
        }

        if (restaurantOpen) {

            restaurantStatusText.textContent =
                "Restaurant Open";

            restaurantStatusButton.classList.add("open");

            restaurantStatusButton.classList.remove("closed");

        } else {

            restaurantStatusText.textContent =
                "Restaurant Closed";

            restaurantStatusButton.classList.add("closed");

            restaurantStatusButton.classList.remove("open");

        }

    }


    if (restaurantStatusButton) {

        restaurantStatusButton.addEventListener("click", async () => {
            if (!restaurantRecord) return showMessage("Restaurant details have not loaded yet.", "error");
            restaurantStatusButton.disabled = true;
            try {
                const result = await apiRequest("/restaurants/owner/status", {
                    method: "PATCH",
                    body: JSON.stringify({ is_open: restaurantRecord.is_open !== true })
                });
                restaurantRecord = result.data?.restaurant || { ...restaurantRecord, is_open: restaurantRecord.is_open !== true };
                restaurantOpen = restaurantRecord.is_open === true;
            } catch (error) {
                showMessage(error.message, "error");
            } finally {
                restaurantStatusButton.disabled = false;
            }

            updateRestaurantStatus();
            showMessage(restaurantOpen ? "Restaurant is now open." : "Restaurant is now closed.");

        });

    }


    /* =========================================================
       SETTINGS NAVIGATION
    ========================================================== */

    function showSettingsSection(sectionName) {

        settingsNavItems.forEach((item) => {

            item.classList.toggle(
                "active",
                item.dataset.section === sectionName
            );

        });


        settingsSections.forEach((section) => {

            section.classList.toggle(
                "active",
                section.dataset.settingsSection === sectionName
            );

        });

    }


    settingsNavItems.forEach((item) => {

        item.addEventListener("click", () => {

            const section =
                item.dataset.section;

            if (!section) {
                return;
            }

            showSettingsSection(section);

        });

    });


    /* =========================================================
       MESSAGE
    ========================================================== */

    let messageTimeout;

    function showMessage(message, type = "success") {

        if (!settingsMessage) {
            return;
        }

        clearTimeout(messageTimeout);

        settingsMessage.textContent =
            message;

        settingsMessage.classList.remove(
            "success",
            "error",
            "warning"
        );

        settingsMessage.classList.add(type);

        settingsMessage.hidden = false;

        messageTimeout = setTimeout(() => {

            settingsMessage.hidden = true;

        }, 3500);

    }


    /* =========================================================
       GENERAL SETTINGS - SAVE
    ========================================================== */

    if (saveGeneralButton) {

        saveGeneralButton.addEventListener("click", async () => {

            const name =
                restaurantName
                    ? restaurantName.value.trim()
                    : "";

            const email =
                restaurantEmail
                    ? restaurantEmail.value.trim()
                    : "";

            const phone =
                restaurantPhone
                    ? restaurantPhone.value.trim()
                    : "";

            const address =
                restaurantAddress
                    ? restaurantAddress.value.trim()
                    : "";

            if (!name) {

                showMessage(
                    "Restaurant name is required.",
                    "error"
                );

                restaurantName?.focus();

                return;

            }


            if (!email) {

                showMessage(
                    "Restaurant email is required.",
                    "error"
                );

                restaurantEmail?.focus();

                return;

            }


            if (!isValidEmail(email)) {

                showMessage(
                    "Please enter a valid restaurant email.",
                    "error"
                );

                restaurantEmail?.focus();

                return;

            }


            if (!phone) {

                showMessage(
                    "Phone number is required.",
                    "error"
                );

                restaurantPhone?.focus();

                return;

            }


            if (!address) {

                showMessage(
                    "Restaurant address is required.",
                    "error"
                );

                restaurantAddress?.focus();

                return;

            }


            const generalSettings = {

                restaurantName: name,

                restaurantEmail: email,

                restaurantPhone: phone,

                restaurantAddress: address,

                restaurantCurrency:
                    restaurantCurrency
                        ? restaurantCurrency.value
                        : "KES",

                restaurantTimezone:
                    restaurantTimezone
                        ? restaurantTimezone.value
                        : "Africa/Nairobi",

                autoAcceptOrders:
                    autoAcceptOrders
                        ? autoAcceptOrders.checked
                        : false,

                showRestaurantOpen:
                    showRestaurantOpen
                        ? showRestaurantOpen.checked
                        : false

            };


            try {
                const result = await apiRequest("/restaurants/owner/me", {
                    method: "PUT",
                    body: JSON.stringify({ name, email: email || null, phone: phone || null, address })
                });
                restaurantRecord = result.data?.restaurant || { ...restaurantRecord, name, email, phone, address };
                paintIdentity();
            } catch (error) {
                showMessage(error.message, "error");
                return;
            }


            showMessage("Restaurant details saved to your account.");

        });

    }


    /* =========================================================
       GENERAL SETTINGS - RESET
    ========================================================== */

    if (resetGeneralButton) {

        resetGeneralButton.addEventListener("click", () => {

            const confirmed =
                window.confirm(
                    "Reset general settings to their default values?"
                );

            if (!confirmed) {
                return;
            }


            // Reset unsaved edits by reloading the saved restaurant record.







            if (restaurantCurrency) {
                restaurantCurrency.value =
                    "KES";
            }

            if (restaurantTimezone) {
                restaurantTimezone.value =
                    "Africa/Nairobi";
            }

            if (autoAcceptOrders) {
                autoAcceptOrders.checked =
                    true;
            }

            if (showRestaurantOpen) {
                showRestaurantOpen.checked =
                    true;
            }


            restaurantOpen = true;

            updateRestaurantStatus();


            loadServerSettings().catch(error => showMessage(error.message, "error"));


            showMessage("Restaurant details reloaded from the server.");

        });

    }


    /* =========================================================
       ACCOUNT SETTINGS - SAVE
    ========================================================== */

    if (saveAccountButton) {

        saveAccountButton.addEventListener("click", async () => {

            const firstName =
                adminFirstName
                    ? adminFirstName.value.trim()
                    : "";

            const lastName =
                adminLastName
                    ? adminLastName.value.trim()
                    : "";

            const email =
                adminEmail
                    ? adminEmail.value.trim()
                    : "";


            if (!firstName) {

                showMessage(
                    "First name is required.",
                    "error"
                );

                adminFirstName?.focus();

                return;

            }


            if (!lastName) {

                showMessage(
                    "Last name is required.",
                    "error"
                );

                adminLastName?.focus();

                return;

            }


            if (!email || !isValidEmail(email)) {

                showMessage(
                    "Please enter a valid account email.",
                    "error"
                );

                adminEmail?.focus();

                return;

            }


            const accountSettings = {

                firstName,

                lastName,

                email

            };


            try {
                const result = await apiRequest("/auth/me", {
                    method: "PUT",
                    body: JSON.stringify({ first_name: firstName, last_name: lastName, email })
                });
                ownerRecord = result.data?.user || { ...ownerRecord, first_name: firstName, last_name: lastName, email };
                paintIdentity();
            } catch (error) {
                showMessage(error.message, "error");
                return;
            }


            showMessage("Account information saved to your account.");

        });

    }


    /* =========================================================
       NOTIFICATION SETTINGS - SAVE
    ========================================================== */

    if (saveNotificationButton) {

        saveNotificationButton.addEventListener("click", () => {

            const notificationSettings = {

                newOrders:
                    newOrderNotifications
                        ? newOrderNotifications.checked
                        : false,

                orderUpdates:
                    orderUpdateNotifications
                        ? orderUpdateNotifications.checked
                        : false,

                promotions:
                    promotionNotifications
                        ? promotionNotifications.checked
                        : false,

                email:
                    emailNotifications
                        ? emailNotifications.checked
                        : false

            };


            localStorage.setItem(
                "restaurantNotificationSettings",
                JSON.stringify(notificationSettings)
            );


            showMessage("Preferences saved in this browser only; server-side and email notifications are not configured.");

        });

    }


    /* =========================================================
       SECURITY - CHANGE PASSWORD
    ========================================================== */

    if (changePasswordButton) {

        changePasswordButton.addEventListener("click", async () => {

            const current =
                currentPassword
                    ? currentPassword.value
                    : "";

            const newPass =
                newPassword
                    ? newPassword.value
                    : "";

            const confirmPass =
                confirmPassword
                    ? confirmPassword.value
                    : "";


            if (!current) {

                showMessage(
                    "Enter your current password.",
                    "error"
                );

                currentPassword?.focus();

                return;

            }


            if (!newPass) {

                showMessage(
                    "Enter a new password.",
                    "error"
                );

                newPassword?.focus();

                return;

            }


            if (newPass.length < 8) {

                showMessage(
                    "New password must contain at least 8 characters.",
                    "error"
                );

                newPassword?.focus();

                return;

            }


            if (!confirmPass) {

                showMessage(
                    "Confirm your new password.",
                    "error"
                );

                confirmPassword?.focus();

                return;

            }


            if (newPass !== confirmPass) {

                showMessage(
                    "New passwords do not match.",
                    "error"
                );

                confirmPassword?.focus();

                return;

            }


            if (current === newPass) {

                showMessage(
                    "New password must be different from your current password.",
                    "error"
                );

                newPassword?.focus();

                return;

            }


            try {
                await apiRequest("/auth/me/password", {
                    method: "PATCH",
                    body: JSON.stringify({ currentPassword: current, newPassword: newPass })
                });
            } catch (error) {
                showMessage(error.message, "error");
                return;
            }


            currentPassword.value = "";
            newPassword.value = "";
            confirmPassword.value = "";


            showMessage(
                "Password updated successfully."
            );

        });

    }


    /* =========================================================
       LOGIN NOTIFICATIONS
    ========================================================== */

    if (loginNotifications) {

        loginNotifications.addEventListener("change", () => {

            localStorage.setItem(
                "restaurantLoginNotifications",
                loginNotifications.checked
            );

        });

    }


    /* =========================================================
       ORDER SETTINGS - SAVE
    ========================================================== */

    if (saveOrderSettingsButton) {
        saveOrderSettingsButton.addEventListener("click", () => {
            const orderSettings = {
                orderSound: orderSound ? orderSound.value : "default",
                browserNotifications: browserNotifications ? browserNotifications.checked : false,
                newOrdersTop: newOrdersTop ? newOrdersTop.checked : false
            };
            localStorage.setItem("restaurantOrderSettings", JSON.stringify(orderSettings));
            showMessage("Order display preferences saved in this browser only; they do not change server-side order processing.");
        });
    }


    /* =========================================================
       BROWSER NOTIFICATION PERMISSION
    ========================================================== */

    if (browserNotifications) {

        browserNotifications.addEventListener("change", async () => {

            if (
                browserNotifications.checked &&
                "Notification" in window
            ) {

                if (
                    Notification.permission === "default"
                ) {

                    try {

                        const permission =
                            await Notification.requestPermission();

                        if (permission !== "granted") {

                            browserNotifications.checked =
                                false;

                            showMessage(
                                "Browser notification permission was not granted.",
                                "warning"
                            );

                            return;

                        }

                    } catch (error) {

                        console.error(
                            "Notification permission error:",
                            error
                        );

                    }

                }

            }

        });

    }


    /* =========================================================
       LOAD SAVED SETTINGS
    ========================================================== */

    function loadSavedSettings() {

        /* -------------------------
           GENERAL
        ------------------------- */

        const savedGeneral =
            localStorage.getItem(
                "restaurantGeneralSettings"
            );

        if (savedGeneral) {

            try {

                const settings =
                    JSON.parse(savedGeneral);


                if (restaurantName && settings.restaurantName) {
                    restaurantName.value =
                        settings.restaurantName;
                }

                if (restaurantEmail && settings.restaurantEmail) {
                    restaurantEmail.value =
                        settings.restaurantEmail;
                }

                if (restaurantPhone && settings.restaurantPhone) {
                    restaurantPhone.value =
                        settings.restaurantPhone;
                }

                if (restaurantAddress && settings.restaurantAddress) {
                    restaurantAddress.value =
                        settings.restaurantAddress;
                }

                if (
                    restaurantCurrency &&
                    settings.restaurantCurrency
                ) {

                    restaurantCurrency.value =
                        settings.restaurantCurrency;

                }

                if (
                    restaurantTimezone &&
                    settings.restaurantTimezone
                ) {

                    restaurantTimezone.value =
                        settings.restaurantTimezone;

                }

                if (
                    autoAcceptOrders &&
                    typeof settings.autoAcceptOrders === "boolean"
                ) {

                    autoAcceptOrders.checked =
                        settings.autoAcceptOrders;

                }

                if (
                    showRestaurantOpen &&
                    typeof settings.showRestaurantOpen === "boolean"
                ) {

                    showRestaurantOpen.checked =
                        settings.showRestaurantOpen;

                    restaurantOpen =
                        settings.showRestaurantOpen;

                }

            } catch (error) {

                console.error(
                    "Could not load general settings:",
                    error
                );

            }

        }


        /* -------------------------
           ACCOUNT
        ------------------------- */

        const savedAccount =
            localStorage.getItem(
                "restaurantAccountSettings"
            );

        if (savedAccount) {

            try {

                const settings =
                    JSON.parse(savedAccount);


                if (
                    adminFirstName &&
                    settings.firstName
                ) {

                    adminFirstName.value =
                        settings.firstName;

                }

                if (
                    adminLastName &&
                    settings.lastName
                ) {

                    adminLastName.value =
                        settings.lastName;

                }

                if (
                    adminEmail &&
                    settings.email
                ) {

                    adminEmail.value =
                        settings.email;

                }

            } catch (error) {

                console.error(
                    "Could not load account settings:",
                    error
                );

            }

        }


        /* -------------------------
           NOTIFICATIONS
        ------------------------- */

        const savedNotifications =
            localStorage.getItem(
                "restaurantNotificationSettings"
            );

        if (savedNotifications) {

            try {

                const settings =
                    JSON.parse(savedNotifications);


                if (
                    newOrderNotifications &&
                    typeof settings.newOrders === "boolean"
                ) {

                    newOrderNotifications.checked =
                        settings.newOrders;

                }

                if (
                    orderUpdateNotifications &&
                    typeof settings.orderUpdates === "boolean"
                ) {

                    orderUpdateNotifications.checked =
                        settings.orderUpdates;

                }

                if (
                    promotionNotifications &&
                    typeof settings.promotions === "boolean"
                ) {

                    promotionNotifications.checked =
                        settings.promotions;

                }

                if (
                    emailNotifications &&
                    typeof settings.email === "boolean"
                ) {

                    emailNotifications.checked =
                        settings.email;

                }

            } catch (error) {

                console.error(
                    "Could not load notification settings:",
                    error
                );

            }

        }


        /* -------------------------
           ORDER SETTINGS
        ------------------------- */

        const savedOrderSettings =
            localStorage.getItem(
                "restaurantOrderSettings"
            );

        if (savedOrderSettings) {

            try {

                const settings =
                    JSON.parse(savedOrderSettings);


                if (
                    defaultPreparationTime &&
                    settings.preparationTime
                ) {

                    defaultPreparationTime.value =
                        settings.preparationTime;

                }

                if (
                    maximumOrders &&
                    settings.maximumOrders
                ) {

                    maximumOrders.value =
                        settings.maximumOrders;

                }

                if (
                    orderSound &&
                    settings.orderSound
                ) {

                    orderSound.value =
                        settings.orderSound;

                }

                if (
                    browserNotifications &&
                    typeof settings.browserNotifications === "boolean"
                ) {

                    browserNotifications.checked =
                        settings.browserNotifications;

                }

                if (
                    newOrdersTop &&
                    typeof settings.newOrdersTop === "boolean"
                ) {

                    newOrdersTop.checked =
                        settings.newOrdersTop;

                }

            } catch (error) {

                console.error(
                    "Could not load order settings:",
                    error
                );

            }

        }


        /* -------------------------
           LOGIN NOTIFICATIONS
        ------------------------- */

        const savedLoginNotifications =
            localStorage.getItem(
                "restaurantLoginNotifications"
            );

        if (
            loginNotifications &&
            savedLoginNotifications !== null
        ) {

            loginNotifications.checked =
                savedLoginNotifications === "true";

        }


        updateRestaurantStatus();

    }


    /* =========================================================
       EMAIL VALIDATION
    ========================================================== */

    function isValidEmail(email) {

        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
            email
        );

    }


    /* =========================================================
       ENTER KEY SUPPORT
    ========================================================== */

    document.addEventListener("keydown", (event) => {

        if (event.key !== "Enter") {
            return;
        }

        const activeElement =
            document.activeElement;

        if (
            activeElement &&
            activeElement.tagName === "INPUT" &&
            activeElement.type !== "checkbox"
        ) {

            /*
             * Don't submit/change anything automatically
             * while typing in a field.
             */

            return;

        }

    });


    /* =========================================================
       ESCAPE KEY
    ========================================================== */

    document.addEventListener("keydown", (event) => {

        if (event.key !== "Escape") {
            return;
        }

        if (sidebar) {

            sidebar.classList.remove("active");

        }

    });


    /* =========================================================
       INITIALIZE
    ========================================================== */

    loadSavedSettings();
    loadServerSettings().catch(error => {
        console.error("Could not load settings from the server:", error);
        showMessage(error.message, "error");
        if (restaurantStatusButton) restaurantStatusButton.disabled = true;
    });

    showSettingsSection("general");

});
