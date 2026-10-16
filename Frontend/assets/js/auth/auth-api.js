(() => {
    const configuredBaseUrl = document
        .querySelector('meta[name="api-base-url"]')
        ?.content
        .trim();
    const apiBaseUrl = (configuredBaseUrl || (window.FOOD_DELIVERY_API_BASE || document.querySelector('meta[name="api-base-url"]')?.content?.trim() || "http://localhost:5000/api").replace(/\/+$/, ""))
        .replace(/\/+$/, "");
    const tokenKey = "foodDeliveryAccessToken";
    const userKey = "foodDeliveryUser";

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
            if (!token) throw new Error("Please log in to continue.");
            headers.Authorization = `Bearer ${token}`;
        }

        let response;
        try {
            response = await fetch(`${apiBaseUrl}${path}`, options);
        } catch (error) {
            if (error instanceof TypeError) {
                throw new Error(`Could not reach the FoodDelivery API at ${apiBaseUrl}. Make sure the backend is running.`);
            }
            throw error;
        }

        const result = await response.json().catch(() => ({}));

        // Handle error responses
        if (!response.ok) {
            const errorMessage = result.error || result.message || `Request failed (${response.status}).`;
            throw new Error(errorMessage);
        }

        // Return the most useful part of the response
        // Priority: data → review → the whole result
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
    }

    function clearSession() {
        localStorage.removeItem(tokenKey);
        localStorage.removeItem(userKey);
        sessionStorage.removeItem(tokenKey);
        sessionStorage.removeItem(userKey);
    }

    function getCurrentUser() {
        const raw = localStorage.getItem(userKey) || sessionStorage.getItem(userKey);
        if (!raw) return null;
        try {
            return JSON.parse(raw);
        } catch {
            return null;
        }
    }

    window.FoodDeliveryAuthApi = {
        request,
        saveSession,
        clearSession,
        getToken,
        getCurrentUser,
    };
})();