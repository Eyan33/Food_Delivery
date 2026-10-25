/* Shared, database-backed admin notification dropdown. */
(() => {
  "use strict";
  document.addEventListener("DOMContentLoaded", () => {
    const api = window.FoodDeliveryAuthApi;
    const button = document.querySelector(".admin-notification-button");
    const badge = document.querySelector(".admin-notification-badge");
    if (!button || !badge || !api?.request) return;

    const style = document.createElement("style");
    style.textContent = `
      .admin-notification-wrap{position:relative}
      .admin-notification-panel{position:absolute;right:0;top:calc(100% + 10px);width:min(370px,calc(100vw - 32px));max-height:430px;overflow:auto;background:#fff;border:1px solid #e5e7eb;border-radius:12px;box-shadow:0 16px 40px rgba(0,0,0,.16);z-index:2000;color:#171717}
      .admin-notification-panel[hidden]{display:none}
      .admin-notification-panel-head{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:14px 16px;border-bottom:1px solid #eee}
      .admin-notification-panel-head strong{font-size:14px}
      .admin-notification-read-all{border:0;background:transparent;color:#ff5a1f;font-size:12px;font-weight:600;cursor:pointer}
      .admin-notification-item{display:block;width:100%;text-align:left;padding:13px 16px;border:0;border-bottom:1px solid #f1f1f1;background:#fff;color:#222;text-decoration:none;cursor:pointer}
      .admin-notification-item:hover{background:#fff7f3}
      .admin-notification-item.unread{background:#fff8f4}
      .admin-notification-item strong{display:block;font-size:13px;margin-bottom:4px}
      .admin-notification-item p{font-size:12px;line-height:1.45;margin:0 0 6px;color:#555;white-space:normal}
      .admin-notification-item small{font-size:10px;color:#777}
      .admin-notification-empty,.admin-notification-error{padding:22px 16px;text-align:center;font-size:12px;color:#666}
      .admin-notification-error{color:#b91c1c}
      .admin-notification-button{flex-shrink:0}
    `;
    document.head.appendChild(style);

    const wrap = document.createElement("div");
    wrap.className = "admin-notification-wrap";
    button.parentNode.insertBefore(wrap, button);
    wrap.append(button);
    const panel = document.createElement("section");
    panel.className = "admin-notification-panel";
    panel.hidden = true;
    panel.setAttribute("aria-label", "Notifications");
    panel.innerHTML = '<div class="admin-notification-panel-head"><strong>Notifications</strong><button type="button" class="admin-notification-read-all">Mark all read</button></div><div class="admin-notification-list" aria-live="polite"><div class="admin-notification-empty">Loading notifications…</div></div>';
    wrap.append(panel);
    button.setAttribute("aria-expanded", "false");
    button.setAttribute("aria-haspopup", "true");
    const list = panel.querySelector(".admin-notification-list");
    const readAllButton = panel.querySelector(".admin-notification-read-all");
    let loading = false;

    const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, ch => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]));
    const formatDate = (value) => {
      if (!value) return "";
      const date = new Date(value);
      return Number.isNaN(date.getTime()) ? "" : date.toLocaleString(undefined, {dateStyle:"medium",timeStyle:"short"});
    };
    function setCount(value) {
      const count = Math.max(0, Number(value) || 0);
      badge.textContent = count > 99 ? "99+" : String(count);
      badge.hidden = count === 0;
      button.setAttribute("aria-label", count ? `Notifications, ${count} unread` : "Notifications");
    }
    function showError(message) {
      list.innerHTML = '<div class="admin-notification-error">' + escapeHtml(message) + '</div>';
    }
    async function loadNotifications() {
      if (loading) return;
      loading = true;
      try {
        const response = await api.request("/admins/notifications?limit=20", {authenticated:true});
        const data = response?.data || response;
        const notifications = Array.isArray(data?.notifications) ? data.notifications : [];
        setCount(data?.unreadCount ?? notifications.filter(n => !n.read_at).length);
        if (!notifications.length) {
          list.innerHTML = '<div class="admin-notification-empty">You’re all caught up. No notifications.</div>';
          return;
        }
        list.innerHTML = notifications.map(n => {
          const id = escapeHtml(n.id);
          const url = String(n.target_url || "").startsWith("/") ? n.target_url : "/pages/admin/dashboard.html";
          const href = url.startsWith("/pages/admin/") ? "../../pages/admin/" + url.slice("/pages/admin/".length) : url;
          return '<a class="admin-notification-item ' + (n.read_at ? "" : "unread") + '" href="' + escapeHtml(href) + '" data-notification-id="' + id + '" data-unread="' + (n.read_at ? "false" : "true") + '"><strong>' + escapeHtml(n.title || "Notification") + '</strong><p>' + escapeHtml(n.message || "") + '</p><small>' + escapeHtml(formatDate(n.created_at)) + (n.read_at ? "" : " · Unread") + '</small></a>';
        }).join("");
      } catch (error) {
        console.error("Could not load admin notifications:", error);
        showError("Notifications could not be loaded. Check your admin session and try again.");
      } finally {
        loading = false;
      }
    }
    async function markRead(id) {
      return api.request("/admins/notifications/" + encodeURIComponent(id) + "/read", {method:"PATCH",authenticated:true});
    }
    button.addEventListener("click", async event => {
      event.preventDefault();
      const opening = panel.hidden;
      panel.hidden = !opening;
      button.setAttribute("aria-expanded", String(opening));
      if (opening) await loadNotifications();
    });
    list.addEventListener("click", async event => {
      const item = event.target.closest("a[data-notification-id]");
      if (!item || item.dataset.unread !== "true") return;
      event.preventDefault();
      try {
        await markRead(item.dataset.notificationId);
        item.classList.remove("unread");
        item.dataset.unread = "false";
        const small = item.querySelector("small");
        if (small) small.textContent = small.textContent.replace(" · Unread", "");
        const remaining = Math.max(0, (Number.parseInt(badge.textContent, 10) || 0) - 1);
        setCount(remaining);
        window.location.href = item.href;
      } catch (error) {
        console.error("Could not mark notification as read:", error);
        window.location.href = item.href;
      }
    });
    readAllButton.addEventListener("click", async () => {
      readAllButton.disabled = true;
      try {
        await api.request("/admins/notifications/read-all", {method:"PATCH",authenticated:true});
        list.querySelectorAll(".admin-notification-item").forEach(item => {
          item.classList.remove("unread");
          item.dataset.unread = "false";
          const small = item.querySelector("small");
          if (small) small.textContent = small.textContent.replace(" · Unread", "");
        });
        setCount(0);
      } catch (error) {
        console.error("Could not mark all notifications read:", error);
        showError("Could not mark notifications as read. Please try again.");
      } finally {
        readAllButton.disabled = false;
      }
    });
    document.addEventListener("click", event => {
      if (!wrap.contains(event.target)) {
        panel.hidden = true;
        button.setAttribute("aria-expanded", "false");
      }
    });
    document.addEventListener("keydown", event => {
      if (event.key === "Escape" && !panel.hidden) {
        panel.hidden = true;
        button.setAttribute("aria-expanded", "false");
        button.focus();
      }
    });
    loadNotifications();
    window.setInterval(loadNotifications, 60000);
  });
})();
