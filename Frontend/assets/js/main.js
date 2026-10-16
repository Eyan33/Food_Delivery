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