/*
 * FoodDelivery API configuration.
 * Local development defaults to the Express server on port 5000.
 * Production defaults to /api (same-origin reverse proxy).
 * For a separately hosted API, change productionApiBase below to
 * "https://YOUR-BACKEND-DOMAIN/api" before deployment.
 */
(() => {
    const hostname = window.location.hostname;
    const isLocalDevelopment = ["localhost", "127.0.0.1", "::1"].includes(hostname);
    const productionApiBase = "/api";

    window.FOOD_DELIVERY_API_BASE =
        window.FOOD_DELIVERY_API_BASE ||
        (isLocalDevelopment ? "http://localhost:5000/api" : productionApiBase);
})();
