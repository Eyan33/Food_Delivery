document.addEventListener("DOMContentLoaded", () => {
    "use strict";
    const api = window.FoodDeliveryAuthApi;
    const button = document.querySelector(".rider-notification-button");
    if (!button || button.dataset.notificationsReady === "true") return;
    button.dataset.notificationsReady = "true";
    button.hidden = false;
    button.removeAttribute("disabled");
    button.removeAttribute("aria-hidden");
    button.setAttribute("aria-haspopup", "dialog");
    button.setAttribute("aria-expanded", "false");

    const style = document.createElement("style");
    style.textContent = `
      .rider-notification-wrap{position:relative}
      .rider-notification-panel{position:absolute;right:0;top:calc(100% + 10px);width:min(360px,calc(100vw - 32px));max-height:420px;overflow:auto;background:#fff;border:1px solid #e5e7eb;border-radius:12px;box-shadow:0 12px 32px rgba(0,0,0,.14);z-index:1000;color:#1f2937}
      .rider-notification-panel[hidden]{display:none}
      .rider-notification-head{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:14px 16px;border-bottom:1px solid #e5e7eb}
      .rider-notification-head strong{font-size:15px}
      .rider-notification-head button{border:0;background:transparent;color:#f05a24;cursor:pointer;font:inherit}
      .rider-notification-item{display:block;width:100%;padding:13px 16px;text-align:left;border:0;border-bottom:1px solid #f1f2f4;background:#fff;cursor:pointer;color:inherit}
      .rider-notification-item.unread{background:#fff7f2}
      .rider-notification-item strong{display:block;font-size:13px;margin-bottom:4px}
      .rider-notification-item span{display:block;font-size:12px;line-height:1.45;color:#4b5563}
      .rider-notification-item small{display:block;margin-top:6px;color:#6b7280;font-size:11px}
      .rider-notification-empty{padding:22px 16px;color:#6b7280;font-size:13px;text-align:center}
    `;
    document.head.appendChild(style);

    const wrap = document.createElement("div");
    wrap.className = "rider-notification-wrap";
    button.parentNode.insertBefore(wrap, button);
    wrap.appendChild(button);
    const panel = document.createElement("section");
    panel.className = "rider-notification-panel";
    panel.hidden = true;
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-label", "Rider notifications");
    panel.innerHTML = '<div class="rider-notification-head"><strong>Notifications</strong><button type="button" data-mark-all>Mark all read</button></div><div data-notification-list><div class="rider-notification-empty">Loading notifications…</div></div>';
    wrap.appendChild(panel);

    let notifications = [];
    let loading = false;
    const badge = button.querySelector(".notification-badge");
    const list = panel.querySelector("[data-notification-list]");
    async function request(path, options = {}) {
        if (!api || typeof api.request !== "function" || !api.getToken || !api.getToken()) {
            throw new Error("Your session has expired. Please sign in again.");
        }
        const user = api.getCurrentUser ? api.getCurrentUser() : null;
        if (user?.role && user.role !== "rider") throw new Error("Rider access required.");
        return api.request(path, { ...options, authenticated: true });
    }
    function setBadge(count) {
        const n = Math.max(0, Number(count) || 0);
        if (badge) {
            badge.textContent = n > 99 ? "99+" : String(n);
            badge.hidden = n === 0;
        }
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
            empty.className = "rider-notification-empty";
            empty.textContent = "You're all caught up. No notifications yet.";
            list.appendChild(empty);
            return;
        }
        notifications.forEach(item => {
            const entry = document.createElement("button");
            entry.type = "button";
            entry.className = "rider-notification-item" + (item.read_at ? "" : " unread");
            const title = document.createElement("strong");
            title.textContent = item.title || "Delivery update";
            const message = document.createElement("span");
            message.textContent = item.message || "";
            const time = document.createElement("small");
            time.textContent = safeDate(item.created_at);
            entry.append(title, message, time);
            entry.addEventListener("click", async () => {
                if (!item.read_at) {
                    try {
                        await request(`/riders/notifications/${encodeURIComponent(item.id)}/read`, { method: "PATCH" });
                        item.read_at = new Date().toISOString();
                        setBadge(notifications.filter(n => !n.read_at).length);
                        render();
                    } catch (error) {
                        console.error("[rider-notifications] mark read failed:", error);
                        showError("Could not mark this notification as read. Please try again.");
                        return;
                    }
                }
                const destination = item.target_url || (item.order_id ? "deliveries.html" : "");
                if (destination) {
                    try {
                        const url = new URL(destination, window.location.href);
                        if (url.origin === window.location.origin && url.pathname.includes("/pages/rider/")) window.location.assign(url.href);
                        else console.warn("[rider-notifications] blocked unsafe target URL:", destination);
                    } catch (_) { console.warn("[rider-notifications] invalid target URL:", destination); }
                }
            });
            list.appendChild(entry);
        });
    }
    function showError(message) {
        const node = document.createElement("div");
        node.className = "rider-notification-empty";
        node.setAttribute("role", "alert");
        node.textContent = message;
        list.prepend(node);
    }
    async function load() {
        if (loading) return;
        loading = true;
        try {
            const response = await request("/riders/notifications");
            const data = response?.data || response;
            notifications = Array.isArray(data?.notifications) ? data.notifications : [];
            setBadge(data?.unread_count ?? notifications.filter(n => !n.read_at).length);
            if (!panel.hidden) render();
        } catch (error) {
            if (!panel.hidden) {
                list.replaceChildren();
                showError(error.message || "Notifications are temporarily unavailable.");
            }
            console.warn("[rider-notifications]", error.message);
        } finally { loading = false; }
    }
    button.addEventListener("click", async () => {
        const opening = panel.hidden;
        panel.hidden = !opening;
        button.setAttribute("aria-expanded", String(opening));
        if (opening) { await load(); render(); }
    });
    panel.querySelector("[data-mark-all]").addEventListener("click", async event => {
        const markAll = event.currentTarget;
        markAll.disabled = true;
        try {
            await request("/riders/notifications/read-all", { method: "PATCH" });
            notifications.forEach(n => { n.read_at = n.read_at || new Date().toISOString(); });
            setBadge(0);
            render();
        } catch (error) {
            console.error("[rider-notifications] mark all read failed:", error);
            showError("Could not mark notifications as read. Please try again.");
        } finally { markAll.disabled = false; }
    });
    document.addEventListener("click", event => {
        if (!wrap.contains(event.target)) { panel.hidden = true; button.setAttribute("aria-expanded", "false"); }
    });
    document.addEventListener("keydown", event => {
        if (event.key === "Escape" && !panel.hidden) { panel.hidden = true; button.setAttribute("aria-expanded", "false"); button.focus(); }
    });
    load();
    window.setInterval(load, 30000);
});
