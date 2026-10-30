(() => {
    "use strict";

    const init = () => {
        const button = document.getElementById("mobileMenuButton");
        const nav = document.getElementById("mobileNavigation");

        if (!button || !nav || button.dataset.drawerReady === "true") return;
        button.dataset.drawerReady = "true";

        const isMobile = () => window.matchMedia("(max-width: 900px)").matches;
        const isOpen = () => nav.classList.contains("open");

        const closeMenu = (returnFocus = false) => {
            nav.classList.remove("open", "active", "show");
            button.classList.remove("open");
            button.textContent = "☰";
            button.setAttribute("aria-label", "Open menu");
            button.setAttribute("aria-expanded", "false");
            nav.setAttribute("aria-hidden", String(isMobile()));
            if (returnFocus) button.focus();
        };

        const openMenu = () => {
            if (!isMobile()) return;
            nav.classList.add("open");
            button.classList.add("open");
            button.textContent = "×";
            button.setAttribute("aria-label", "Close menu");
            button.setAttribute("aria-expanded", "true");
            nav.setAttribute("aria-hidden", "false");
        };

        // Only this script handles the customer menu button.
        button.addEventListener("click", event => {
            event.preventDefault();
            event.stopPropagation();
            if (isOpen()) closeMenu();
            else openMenu();
        });

        nav.addEventListener("click", event => {
            const target = event.target;
            if (target instanceof Element && target.closest("a") && isMobile()) {
                closeMenu();
            }
        });

        document.addEventListener("click", event => {
            const target = event.target;
            if (isOpen() && target instanceof Element &&
                !nav.contains(target) && !button.contains(target)) {
                closeMenu();
            }
        });

        document.addEventListener("keydown", event => {
            if (event.key === "Escape" && isOpen()) closeMenu(true);
        });

        window.addEventListener("resize", () => {
            if (!isMobile()) closeMenu();
            else nav.setAttribute("aria-hidden", String(!isOpen()));
        });

        closeMenu();
    };

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init, { once: true });
    } else {
        init();
    }
})();
