/*
 * FoodDelivery API configuration.
 * Local development defaults to the Express server on port 5000.
 * Production (Render) and any page served by Express use /api on the same
 * origin: Express serves the Frontend folder and the API together.
 * For a separately hosted API, change productionApiBase below to
 * "https://YOUR-BACKEND-DOMAIN/api" and set CORS_ORIGINS on the backend.
 */
(() => {
    const hostname = window.location.hostname;
    const isLocalDevelopment = ["localhost", "127.0.0.1", "::1"].includes(hostname);
    const productionApiBase = "https://food-delivery-ljy7.onrender.com/api";

    // Page served by Express itself (port 5000): same origin, so a relative URL is right.
    // Page served by another local dev server (Live Server on 5500, ...): call Express on 5000.
    const servedByExpress = window.location.port === "5000";

    window.FOOD_DELIVERY_API_BASE =
        window.FOOD_DELIVERY_API_BASE ||
        (isLocalDevelopment && !servedByExpress
            ? "http://localhost:5000/api"
            : productionApiBase);
})();

/*
 * Image fallback. The Content-Security-Policy blocks inline event
 * handlers, so <img data-fallback="/path/to/placeholder.jpg"> is handled
 * here instead of with an inline onerror attribute. 'error' does not
 * bubble, hence the capture phase. Each image falls back at most once.
 */
document.addEventListener(
    "error",
    (event) => {
        const element = event.target;

        if (!(element instanceof HTMLImageElement)) {
            return;
        }

        const fallback = element.getAttribute("data-fallback");

        if (!fallback || element.dataset.fallbackApplied === "true") {
            return;
        }

        element.dataset.fallbackApplied = "true";
        element.src = fallback;
    },
    true
);
