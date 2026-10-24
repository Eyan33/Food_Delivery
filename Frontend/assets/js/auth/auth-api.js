(() => {
    const normalizeBaseUrl = (value) =>
        String(value || "").trim().replace(/\/+$/, "");

    const configuredBaseUrl = document
        .querySelector('meta[name="api-base-url"]')
        ?.content
        .trim();

    const baseUrl = normalizeBaseUrl(
        window.FOOD_DELIVERY_API_BASE || configuredBaseUrl || "http://localhost:5000/api"
    );
    const apiBaseUrl = baseUrl || "http://localhost:5000/api";
    const tokenKey = "foodDeliveryAccessToken";
    const userKey = "foodDeliveryUser";
    const loginPagePath = "/pages/auth/login.html";
    const EXPIRY_CHECK_INTERVAL_MS = 60 * 1000;
    let expiryTimer = null;
    let expiryRedirecting = false;

    function showGlobalMessage(message, type = "error") {
        const messageBox = document.getElementById("adminMessage");

        if (!messageBox) {
            return false;
        }

        messageBox.textContent = message;
        messageBox.className = `admin-message show ${type}`;
        messageBox.setAttribute("role", "alert");
        messageBox.setAttribute("aria-live", "polite");

        return true;
    }

    function clearSession() {
        localStorage.removeItem(tokenKey);
        localStorage.removeItem(userKey);
        sessionStorage.removeItem(tokenKey);
        sessionStorage.removeItem(userKey);
        if (expiryTimer !== null) {
            window.clearTimeout(expiryTimer);
            expiryTimer = null;
        }
    }

    function getTokenExpiryMs(token) {
        try {
            const parts = String(token || "").split(".");
            if (parts.length !== 3) return null;
            const payload = parts[1].replace(/-/g, "+").replace(/_/g, "/");
            const decoded = atob(payload.padEnd(payload.length + ((4 - payload.length % 4) % 4), "="));
            const claims = JSON.parse(decoded);
            return Number.isFinite(Number(claims.exp)) ? Number(claims.exp) * 1000 : null;
        } catch {
            return null;
        }
    }

    function expireSession() {
        if (expiryRedirecting) return;
        expiryRedirecting = true;
        clearSession();
        window.alert("Your session has expired. Please log in again.");
        redirectToLogin();
    }

    function scheduleSessionExpiryCheck() {
        if (expiryTimer !== null) {
            window.clearTimeout(expiryTimer);
            expiryTimer = null;
        }

        const token = getToken();
        if (!token) return;

        const expiryMs = getTokenExpiryMs(token);
        // The server remains authoritative for tokens without a readable JWT expiry.
        if (expiryMs === null) return;

        const remaining = expiryMs - Date.now();
        if (remaining <= 0) {
            expireSession();
            return;
        }

        expiryTimer = window.setTimeout(
            scheduleSessionExpiryCheck,
            Math.min(remaining, EXPIRY_CHECK_INTERVAL_MS)
        );
    }

    function redirectToLogin() {
        const currentPath = window.location.pathname || "/";

        if (
            currentPath.endsWith("/login.html") ||
            currentPath.endsWith("/register.html")
        ) {
            return;
        }

        window.location.href = loginPagePath;
    }

    function getToken() {
        return localStorage.getItem(tokenKey) || sessionStorage.getItem(tokenKey);
    }

    async function request(path, { method = "GET", body, authenticated = false } = {}) {
        const headers = { Accept: "application/json" };
        const options = { method, headers };

        if (body !== undefined) {
            headers["Content-Type"] = "application/json";
            options.body = JSON.stringify(body);
        }

        if (authenticated) {
            const token = getToken();

            if (!token) {
                redirectToLogin();
                throw new Error("Please log in to continue.");
            }

            const expiryMs = getTokenExpiryMs(token);
            if (expiryMs !== null && expiryMs <= Date.now()) {
                expireSession();
                throw new Error("Your session has expired. Please log in again.");
            }

            headers.Authorization = `Bearer ${token}`;
        }

        let response;

        try {
            response = await fetch(`${apiBaseUrl}${path}`, options);
        } catch (error) {
            if (error instanceof TypeError) {
                const friendly = "Could not reach the FoodDelivery API. Please check your connection and try again.";
                showGlobalMessage(friendly, "error");
                throw new Error(friendly);
            }

            throw error;
        }

        let result = {};

        try {
            result = await response.json();
        } catch {
            result = {};
        }

        if (!response.ok) {
            const errorMessage =
                result.error || result.message || `Request failed (${response.status}).`;

            if (response.status === 401) {
                clearSession();
                showGlobalMessage("Your session has expired. Please log in again.", "error");
                redirectToLogin();
                throw new Error("Your session has expired. Please log in again.");
            }

            if (response.status === 403) {
                clearSession();
                showGlobalMessage("You do not have permission to access this page.", "error");
                redirectToLogin();
                throw new Error("You do not have permission to access this page.");
            }

            showGlobalMessage(errorMessage, "error");
            throw new Error(errorMessage);
        }

        if (result.data !== undefined) return result.data;
        if (result.review !== undefined) return result.review;
        return result;
    }

    function saveSession(session, rememberMe = false) {
        if (!session?.token || !session?.user) {
            throw new Error("The server did not return a valid login session.");
        }

        localStorage.removeItem(tokenKey);
        localStorage.removeItem(userKey);
        sessionStorage.removeItem(tokenKey);
        sessionStorage.removeItem(userKey);

        const storage = rememberMe ? localStorage : sessionStorage;
        storage.setItem(tokenKey, session.token);
        storage.setItem(userKey, JSON.stringify(session.user));
        expiryRedirecting = false;
        scheduleSessionExpiryCheck();
    }

    function getCurrentUser() {
        const raw = localStorage.getItem(userKey) || sessionStorage.getItem(userKey);

        if (!raw) {
            return null;
        }

        try {
            return JSON.parse(raw);
        } catch {
            return null;
        }
    }

    window.addEventListener("storage", (event) => {
        if (event.key === tokenKey || event.key === null) {
            expiryRedirecting = false;
            scheduleSessionExpiryCheck();
        }
    });

    scheduleSessionExpiryCheck();

    window.FoodDeliveryAuthApi = {
        request,
        saveSession,
        clearSession,
        getToken,
        getCurrentUser,
        showGlobalMessage,
    };
})();
