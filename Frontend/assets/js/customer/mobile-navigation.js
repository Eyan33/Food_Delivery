(() => {
    "use strict";

    const isMobile = () => window.matchMedia("(max-width: 900px)").matches;

    const init = () => {
        const button = document.getElementById("mobileMenuButton");
        const nav = document.getElementById("mobileNavigation");
        if (!button || !nav) return;

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

        // Capture the click before other page scripts can cancel or duplicate it.
        document.addEventListener("click", event => {
            const target = event.target;
            if (!(target instanceof Element)) return;

            const clickedButton = target.closest("#mobileMenuButton");
            if (clickedButton) {
                event.preventDefault();
                event.stopPropagation();
                event.stopImmediatePropagation();
                if (isOpen()) closeMenu();
                else openMenu();
                return;
            }

            if (!isOpen()) return;
            if (target.closest("#mobileNavigation a")) {
                closeMenu();
                return;
            }
            if (!nav.contains(target)) closeMenu();
        }, true);

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
