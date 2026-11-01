(() => {
  "use strict";
  document.documentElement.style.visibility = "hidden";
  document.addEventListener("DOMContentLoaded", async () => {
    const api = window.FoodDeliveryAuthApi;
    if (!api || !api.getToken()) {
      window.location.replace("../../pages/auth/login.html");
      return;
    }
    try {
      const response = await api.request("/auth/me", { authenticated: true });
      const user = (response.data && response.data.user) || response.user || {};
      if (user.role !== "super_admin") {
        window.location.replace(user.role === "admin" ? "dashboard.html" : "../../pages/auth/login.html");
        return;
      }
      document.documentElement.style.visibility = "visible";
      ["admin-header.js", "admin-notifications.js", "dashboard.js"].forEach(file => {
        const script = document.createElement("script");
        script.src = "../../assets/js/admin/" + file;
        document.body.appendChild(script);
      });
    } catch (_) {
      window.location.replace("../../pages/auth/login.html");
    }
  });
})();