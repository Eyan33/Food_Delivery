// ============================================
//                 ADMIN GLOBAL
// ============================================

const adminSidebar = document.getElementById("adminSidebar");
const adminMenuButton = document.getElementById("adminMenuButton");
const adminCloseMenuButton = document.getElementById(
    "adminCloseMenuButton",
);

if (adminSidebar && adminMenuButton) {
    adminMenuButton.addEventListener("click", () => {
        adminSidebar.classList.toggle("open");

        const isOpen =
            adminSidebar.classList.contains("open");

        adminMenuButton.setAttribute(
            "aria-expanded",
            String(isOpen),
        );
    });
}

if (adminSidebar && adminCloseMenuButton) {
    adminCloseMenuButton.addEventListener("click", () => {
        adminSidebar.classList.remove("open");

        adminMenuButton?.setAttribute(
            "aria-expanded",
            "false",
        );
    });
}


// Close admin sidebar when clicking outside it.

document.addEventListener("click", (event) => {
    if (!adminSidebar || !adminMenuButton) {
        return;
    }

    const target = event.target;

    const clickedInsideSidebar =
        adminSidebar.contains(target);

    const clickedMenuButton =
        adminMenuButton.contains(target);

    const sidebarIsOpen =
        adminSidebar.classList.contains("open");

    if (
        sidebarIsOpen &&
        !clickedInsideSidebar &&
        !clickedMenuButton
    ) {
        adminSidebar.classList.remove("open");

        adminMenuButton.setAttribute(
            "aria-expanded",
            "false",
        );
    }
});


// ============================================
//                CUSTOMER GLOBAL
// ============================================

const mobileMenuButton =
    document.getElementById("mobileMenuButton");

const mobileNavigation =
    document.getElementById("mobileNavigation");

if (mobileMenuButton && mobileNavigation) {
    mobileMenuButton.addEventListener("click", () => {
        mobileNavigation.classList.toggle("open");

        const isOpen =
            mobileNavigation.classList.contains("open");

        mobileMenuButton.textContent =
            isOpen ? "×" : "☰";

        mobileMenuButton.setAttribute(
            "aria-label",
            isOpen ? "Close menu" : "Open menu",
        );

        mobileMenuButton.setAttribute(
            "aria-expanded",
            String(isOpen),
        );
    });
}


// ============================================
//                RIDER GLOBAL
// ============================================

const riderSidebar =
    document.getElementById("riderSidebar");

const riderMenuButton =
    document.getElementById("riderMenuButton");

if (riderMenuButton && riderSidebar) {
    riderMenuButton.addEventListener("click", () => {
        riderSidebar.classList.toggle("open");

        const isOpen =
            riderSidebar.classList.contains("open");

        riderMenuButton.setAttribute(
            "aria-expanded",
            String(isOpen),
        );
    });

    document.addEventListener("click", (event) => {
        const target = event.target;

        const clickedInsideSidebar =
            riderSidebar.contains(target);

        const clickedMenuButton =
            riderMenuButton.contains(target);

        const sidebarIsOpen =
            riderSidebar.classList.contains("open");

        if (
            sidebarIsOpen &&
            !clickedInsideSidebar &&
            !clickedMenuButton
        ) {
            riderSidebar.classList.remove("open");

            riderMenuButton.setAttribute(
                "aria-expanded",
                "false",
            );
        }
    });
}


// ============================================
//              RESTAURANT GLOBAL
// ============================================

const restaurantSidebar =
    document.getElementById("restaurantSidebar");

const restaurantMenuButton =
    document.getElementById(
        "restaurantMenuButton",
    );

if (
    restaurantMenuButton &&
    restaurantSidebar
) {
    restaurantMenuButton.addEventListener(
        "click",
        () => {
            restaurantSidebar.classList.toggle(
                "open",
            );

            const isOpen =
                restaurantSidebar.classList.contains(
                    "open",
                );

            restaurantMenuButton.setAttribute(
                "aria-expanded",
                String(isOpen),
            );
        },
    );

    document.addEventListener("click", (event) => {
        const target = event.target;

        const clickedInsideSidebar =
            restaurantSidebar.contains(target);

        const clickedMenuButton =
            restaurantMenuButton.contains(target);

        const sidebarIsOpen =
            restaurantSidebar.classList.contains(
                "open",
            );

        if (
            sidebarIsOpen &&
            !clickedInsideSidebar &&
            !clickedMenuButton
        ) {
            restaurantSidebar.classList.remove(
                "open",
            );

            restaurantMenuButton.setAttribute(
                "aria-expanded",
                "false",
            );
        }
    });
}

// ============================================
//              ADMIN NOTIFICATIONS
// ============================================

document.addEventListener("DOMContentLoaded", () => {
    const api = window.FoodDeliveryAuthApi;
    const buttons = document.querySelectorAll(".admin-notification-button");
    if (!buttons.length) return;

    const style = document.createElement("style");
    style.textContent = `
        .admin-notification-panel{position:absolute;right:0;top:calc(100% + 8px);z-index:1000;width:min(380px,calc(100vw - 24px));max-height:70vh;overflow:auto;background:#fff;color:#202522;border:1px solid #dce2dd;box-shadow:0 12px 32px #17251c24}
        .admin-notification-panel header{display:flex;justify-content:space-between;align-items:center;padding:12px 14px;border-bottom:1px solid #e6ebe7}
        .admin-notification-panel button{border:0;background:none;color:inherit;cursor:pointer}
        .admin-notification-item{display:block;width:100%;padding:12px 14px;text-align:left;border-bottom:1px solid #eef1ee}
        .admin-notification-item.unread{background:#f0f7f1}
        .admin-notification-item strong,.admin-notification-item span{display:block}
        .admin-notification-item span{margin-top:4px;color:#58645c;font-size:.88rem}
        .admin-notification-empty{padding:18px;color:#58645c}
    `;
    document.head.append(style);

    let panel;
    let notifications = [];
    const request = async (path, options = {}) => api.request(path, { ...options, authenticated: true });

    function renderPanel() {
        if (!panel) return;
        panel.replaceChildren();
        const header = document.createElement("header");
        const title = document.createElement("strong");
        title.textContent = "Notifications";
        const markAll = document.createElement("button");
        markAll.type = "button";
        markAll.textContent = "Mark all read";
        markAll.addEventListener("click", async () => {
            await request("/admins/notifications/read-all", { method: "PATCH" });
            await loadNotifications();
        });
        header.append(title, markAll);
        panel.append(header);

        if (!notifications.length) {
            const empty = document.createElement("p");
            empty.className = "admin-notification-empty";
            empty.textContent = "No notifications to show.";
            panel.append(empty);
            return;
        }

        notifications.forEach((notification) => {
            const item = document.createElement("button");
            item.type = "button";
            item.className = `admin-notification-item${notification.read_at ? "" : " unread"}`;
            const itemTitle = document.createElement("strong");
            itemTitle.textContent = notification.title;
            const message = document.createElement("span");
            message.textContent = notification.message;
            item.append(itemTitle, message);
            item.addEventListener("click", async () => {
                if (!notification.read_at) {
                    await request(`/admins/notifications/${notification.id}/read`, { method: "PATCH" });
                }
                window.location.href = notification.target_url;
            });
            panel.append(item);
        });
    }

    async function loadNotifications() {
        if (!api?.request || !api.getToken?.()) return;
        try {
            const result = await request("/admins/notifications?limit=8");
            notifications = result.notifications || [];
            document.querySelectorAll(".admin-notification-badge").forEach((badge) => {
                const unread = Number(result.unreadCount) || 0;
                badge.textContent = unread > 99 ? "99+" : String(unread);
                badge.hidden = unread === 0;
            });
            if (panel?.dataset.open === "true") renderPanel();
        } catch (error) {
            console.error("Could not load admin notifications:", error.message);
        }
    }

    buttons.forEach((button) => {
        button.setAttribute("aria-expanded", "false");
        button.addEventListener("click", async () => {
            if (!panel) {
                panel = document.createElement("section");
                panel.className = "admin-notification-panel";
                panel.setAttribute("aria-label", "Notifications");
                button.parentElement.style.position = "relative";
                button.parentElement.append(panel);
            }
            const open = panel.dataset.open !== "true";
            panel.dataset.open = String(open);
            panel.hidden = !open;
            button.setAttribute("aria-expanded", String(open));
            if (open) {
                await loadNotifications();
                renderPanel();
            }
        });
    });

    document.querySelectorAll('.admin-sidebar-footer a[href="../../index.html"]').forEach((link) => {
        link.addEventListener("click", () => api?.clearSession?.());
    });

    loadNotifications();
});