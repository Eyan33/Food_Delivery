document.addEventListener("DOMContentLoaded", () => {
    "use strict";

    const api = window.FoodDeliveryAuthApi;
    const button = document.querySelector(".restaurant-notification-button");
    if (!button || button.dataset.notificationsReady === "true") return;
    button.dataset.notificationsReady = "true";
    button.setAttribute("aria-haspopup", "dialog");
    button.setAttribute("aria-expanded", "false");

    const style = document.createElement("style");
    style.textContent = `
      .restaurant-notification-wrap{position:relative}
      .restaurant-notification-panel{position:absolute;right:0;top:calc(100% + 10px);width:min(360px,calc(100vw - 32px));max-height:420px;overflow:auto;background:#fff;border:1px solid #e5e7eb;border-radius:12px;box-shadow:0 12px 32px rgba(0,0,0,.14);z-index:1000;color:#1f2937}
      .restaurant-notification-panel[hidden]{display:none}
      .restaurant-notification-head{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:14px 16px;border-bottom:1px solid #e5e7eb}
      .restaurant-notification-head strong{font-size:15px}
      .restaurant-notification-head button{border:0;background:transparent;color:#f05a24;cursor:pointer;font:inherit}
      .restaurant-notification-item{display:block;width:100%;padding:13px 16px;text-align:left;border:0;border-bottom:1px solid #f1f2f4;background:#fff;cursor:pointer;color:inherit}
      .restaurant-notification-item.unread{background:#fff7f2}
      .restaurant-notification-item strong{display:block;font-size:13px;margin-bottom:4px}
      .restaurant-notification-item span{display:block;font-size:12px;line-height:1.45;color:#4b5563}
      .restaurant-notification-item small{display:block;margin-top:6px;color:#6b7280;font-size:11px}
      .restaurant-notification-empty{padding:22px 16px;color:#6b7280;font-size:13px;text-align:center}
    `;
    document.head.appendChild(style);

    const wrap = document.createElement("div");
    wrap.className = "restaurant-notification-wrap";
    button.parentNode.insertBefore(wrap, button);
    wrap.appendChild(button);
    const panel = document.createElement("section");
    panel.className = "restaurant-notification-panel";
    panel.hidden = true;
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-label", "Restaurant notifications");
    panel.innerHTML = '<div class="restaurant-notification-head"><strong>Notifications</strong><button type="button" data-mark-all>Mark all read</button></div><div data-notification-list><div class="restaurant-notification-empty">Loading notifications…</div></div>';
    wrap.appendChild(panel);

    const badge = button.querySelector(".notification-badge");
    const list = panel.querySelector("[data-notification-list]");
    let notifications = [];
    let loading = false;

    async function request(path, options = {}) {
        if (!api || typeof api.request !== "function" || !api.getToken || !api.getToken()) {
            throw new Error("Your session has expired. Please sign in again.");
        }
        const user = api.getCurrentUser ? api.getCurrentUser() : null;
        if (user && user.role && user.role !== "restaurant") throw new Error("Restaurant access required.");
        return api.request(path, { ...options, authenticated: true });
    }

    function showBadge(count) {
        if (!badge) return;
        const n = Number(count) || 0;
        badge.textContent = n > 99 ? "99+" : String(n);
        badge.hidden = n <= 0;
        button.setAttribute("aria-label", n ? `Notifications, ${n} unread` : "Notifications");
    }

    function safeDate(value) {
        const date = new Date(value);
        return Number.isNaN(date.getTime()) ? "" : date.toLocaleString();
    }

    function render() {
        list.replaceChildren();
        if (!notifications.length) {
            const empty = document.createElement("div");
            empty.className = "restaurant-notification-empty";
            empty.textContent = "You're all caught up. No notifications yet.";
            list.appendChild(empty);
            return;
        }
        notifications.forEach(item => {
            const entry = document.createElement("button");
            entry.type = "button";
            entry.className = "restaurant-notification-item" + (item.read_at ? "" : " unread");
            const title = document.createElement("strong");
            title.textContent = item.title || "Restaurant update";
            const message = document.createElement("span");
            message.textContent = item.message || "";
            const time = document.createElement("small");
            time.textContent = safeDate(item.created_at);
            entry.append(title, message, time);
            entry.addEventListener("click", async () => {
                if (!item.read_at) {
                    try {
                        await request(`/restaurants/notifications/${encodeURIComponent(item.id)}/read`, { method: "PATCH" });
                        item.read_at = new Date().toISOString();
                        showBadge(notifications.filter(n => !n.read_at).length);
                        render();
                    } catch (error) {
                        console.error("[restaurant-notifications] mark read failed:", error);
                        if (!panel.hidden) {
                            const notice = document.createElement("div");
                            notice.className = "restaurant-notification-empty";
                            notice.setAttribute("role", "alert");
                            notice.textContent = "Could not mark this notification as read. Please try again.";
                            list.prepend(notice);
                        }
                        return;
                    }
                }
                const destination = item.target_url || (item.order_id ? "orders.html" : "");
                if (destination) {
                    try {
                        const url = new URL(destination, window.location.href);
                        if (url.origin === window.location.origin && url.pathname.includes("/pages/restaurant/")) {
                            window.location.assign(url.href);
                        } else {
                            console.warn("[restaurant-notifications] blocked unsafe target URL:", destination);
                        }
                    } catch (_) {
                        console.warn("[restaurant-notifications] invalid target URL:", destination);
                    }
                }
            });
            list.appendChild(entry);
        });
    }

    async function load() {
        if (loading) return;
        loading = true;
        try {
            const response = await request("/restaurants/notifications");
            const data = response && response.data ? response.data : response;
            notifications = Array.isArray(data.notifications) ? data.notifications : [];
            showBadge(data.unread_count ?? notifications.filter(item => !item.read_at).length);
            if (!panel.hidden) render();
        } catch (error) {
            if (!panel.hidden) {
                list.replaceChildren();
                const empty = document.createElement("div");
                empty.className = "restaurant-notification-empty";
                empty.textContent = error.message || "Notifications are temporarily unavailable.";
                list.appendChild(empty);
            }
            console.warn("[restaurant-notifications]", error.message);
        } finally {
            loading = false;
        }
    }

    button.addEventListener("click", async () => {
        const open = panel.hidden;
        panel.hidden = !open;
        button.setAttribute("aria-expanded", String(open));
        if (open) await load();
    });
    panel.querySelector("[data-mark-all]").addEventListener("click", async event => {
        const markAllButton = event.currentTarget;
        markAllButton.disabled = true;
        try {
            await request("/restaurants/notifications/read-all", { method: "PATCH" });
            notifications.forEach(item => { item.read_at = item.read_at || new Date().toISOString(); });
            showBadge(0);
            render();
        } catch (error) {
            console.error("[restaurant-notifications] mark all read failed:", error);
            const notice = document.createElement("div");
            notice.className = "restaurant-notification-empty";
            notice.setAttribute("role", "alert");
            notice.textContent = "Could not mark notifications as read. Please try again.";
            list.prepend(notice);
        } finally {
            markAllButton.disabled = false;
        }
    });
    document.addEventListener("click", event => {
        if (!wrap.contains(event.target)) {
            panel.hidden = true;
            button.setAttribute("aria-expanded", "false");
        }
    });
    load();
    window.setInterval(load, 30000);
});
