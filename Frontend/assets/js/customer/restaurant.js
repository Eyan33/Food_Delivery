
/* =========================================================
   CUSTOMER RESTAURANT PAGE
   Loads restaurant details and menu from the backend.
   Preserves cart, search, category filters and mobile nav.
   ========================================================= */

document.addEventListener("DOMContentLoaded", () => {
    "use strict";

    const API_BASE = (window.FOOD_DELIVERY_API_BASE || document.querySelector('meta[name="api-base-url"]')?.content?.trim() || "http://localhost:5000/api").replace(/\/+$/, "");
    const FOOD_PLACEHOLDER =
        "../../assets/images/food/food-placeholder.jpg";
    const RESTAURANT_PLACEHOLDER =
        "../../assets/images/restaurants/restaurant-placeholder.jpg";

    // Restaurant elements
    const restaurantName = document.getElementById("restaurantName");
    const restaurantImage = document.getElementById("restaurantImage");
    const restaurantDescription =
        document.getElementById("restaurantDescription");
    const restaurantStatus = document.getElementById("restaurantStatus");
    const restaurantRating = document.getElementById("restaurantRating");

    // Menu elements
    const menuSearchForm = document.getElementById("menuSearchForm");
    const menuSearch = document.getElementById("menuSearch");
    const menuFoodGrid = document.getElementById("menuFoodGrid");
    const menuCategories = document.getElementById("menuCategories");
    const noMenuResults = document.getElementById("noMenuResults");
    const cartCount = document.getElementById("cartCount");

    let restaurant = null;
    let foods = [];
    let cart = [];
    let selectedCategory = "all";

    /* =====================================================
       HELPERS
    ===================================================== */

    function escapeHTML(value) {
        return String(value ?? "").replace(/[&<>"']/g, (character) => ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#39;"
        })[character]);
    }

    function formatPrice(value) {
        const price = Number(value);
        return `KSh ${Number.isFinite(price) ? price.toLocaleString("en-KE", {
            minimumFractionDigits: 0,
            maximumFractionDigits: 2
        }) : "0"}`;
    }

    function getImageUrl(value, fallback) {
        if (typeof value !== "string" || !value.trim()) {
            return fallback;
        }

        const url = value.trim();

        // Support complete URLs and project-relative image paths.
        if (/^(https?:\/\/|data:image\/)/i.test(url)) {
            return url;
        }

        return url;
    }

    function normalizeCategory(value) {
        return String(value || "Other")
            .trim()
            .toLowerCase();
    }

    function getRestaurantId() {
        return new URLSearchParams(window.location.search).get("id");
    }

    async function fetchJSON(url) {
        const response = await fetch(url, {
            method: "GET",
            headers: { Accept: "application/json" }
        });

        const text = await response.text();
        let result;

        try {
            result = JSON.parse(text);
        } catch {
            throw new Error(
                `The server returned an invalid response (HTTP ${response.status}).`
            );
        }

        if (!response.ok || result.success === false) {
            throw new Error(
                result.message || `Request failed (HTTP ${response.status}).`
            );
        }

        return result;
    }

    /* =====================================================
       CART
    ===================================================== */

    try {
        const savedCart = localStorage.getItem("foodDeliveryCart");
        if (savedCart) {
            const parsedCart = JSON.parse(savedCart);
            cart = Array.isArray(parsedCart) ? parsedCart : [];
        }
    } catch (error) {
        console.error("Unable to load saved cart:", error);
        cart = [];
    }

    function updateCartCount() {
        if (!cartCount) return;

        const count = cart.reduce(
            (total, item) => total + Math.max(0, Number(item.quantity) || 0),
            0
        );

        cartCount.textContent = String(count);
    }

    function saveCart() {
        try {
            localStorage.setItem("foodDeliveryCart", JSON.stringify(cart));
        } catch (error) {
            console.error("Unable to save cart:", error);
            alert("Your cart could not be saved in this browser.");
        }
    }

    function addToCart(food, button) {
        if (!restaurant || !food) return;

        if (restaurant.is_open === false) {
            alert("This restaurant is currently closed.");
            return;
        }

        if (food.is_available === false) {
            alert("This food item is currently unavailable.");
            return;
        }

        // Prevent a cart from mixing food from different restaurants.
        const otherRestaurantItem = cart.find(
            item =>
                item.restaurant_id != null &&
                String(item.restaurant_id) !== String(restaurant.id)
        );

        if (otherRestaurantItem) {
            const confirmed = window.confirm(
                "Your cart contains items from another restaurant. " +
                "Clear the existing cart and add this item?"
            );

            if (!confirmed) return;
            cart = [];
        }

        const existingItem = cart.find(
            item =>
                String(item.id) === String(food.id) &&
                String(item.restaurant_id) === String(food.restaurant_id)
        );

        if (existingItem) {
            existingItem.quantity =
                (Number(existingItem.quantity) || 0) + 1;
        } else {
            cart.push({
                id: food.id,
                restaurant_id: food.restaurant_id,
                restaurant_name: restaurant.name,
                name: food.name,
                category: food.category_name || "Other",
                description: food.description || "",
                price: Number(food.price) || 0,
                image: getImageUrl(food.image_url, FOOD_PLACEHOLDER),
                quantity: 1
            });
        }

        saveCart();
        updateCartCount();

        if (button) {
            const originalText = button.textContent;
            button.textContent = "Added";
            button.disabled = true;

            window.setTimeout(() => {
                button.textContent = originalText;
                button.disabled = false;
            }, 800);
        }
    }

    /* =====================================================
       RESTAURANT DETAILS
    ===================================================== */

    function updateRestaurantDetails(data) {
        restaurant = data;

        if (restaurantName) {
            restaurantName.textContent = data.name || "Restaurant";
        }

        if (restaurantDescription) {
            restaurantDescription.textContent =
                data.description || "Explore this restaurant's menu.";
        }

        if (restaurantImage) {
            restaurantImage.src = getImageUrl(
                data.cover_image_url || data.logo_url,
                RESTAURANT_PLACEHOLDER
            );

            restaurantImage.alt = data.name || "Restaurant";

            restaurantImage.onerror = () => {
                restaurantImage.onerror = null;
                restaurantImage.src = RESTAURANT_PLACEHOLDER;
            };
        }

        if (restaurantStatus) {
            const isOpen = data.is_open === true;
            restaurantStatus.textContent = isOpen ? "Open" : "Closed";
            restaurantStatus.classList.toggle("closed", !isOpen);
            restaurantStatus.setAttribute(
                "aria-label",
                isOpen ? "Restaurant is open" : "Restaurant is closed"
            );
        }

        if (restaurantRating) {
            const rating = Number(data.average_rating);
            restaurantRating.textContent =
                Number.isFinite(rating) && rating > 0
                    ? rating.toFixed(1)
                    : "No ratings";
        }

        // Update the restaurant image even if the initial HTML has a placeholder.
        document.title = `${data.name || "Restaurant"} | FoodDelivery`;

        // Update the existing delivery and minimum-order values without
        // requiring changes to the page layout.
        const metaItems = document.querySelectorAll(
            ".restaurant-details-meta .meta-item"
        );

        metaItems.forEach((item) => {
            const label = item.querySelector(".meta-label");
            const value = item.querySelector("strong");

            if (!label || !value) return;

            const key = label.textContent.trim().toLowerCase();

            if (key.includes("delivery") && !key.includes("time")) {
                value.textContent = formatPrice(data.delivery_fee);
            } else if (key.includes("minimum")) {
                value.textContent = formatPrice(data.minimum_order);
            }
        });
    }

    async function loadRestaurant(id) {
        const result = await fetchJSON(
            `${API_BASE}/restaurants/${encodeURIComponent(id)}`
        );

        const data = result.data?.restaurant || result.restaurant;

        if (!data || data.id == null) {
            throw new Error("The API response did not contain restaurant details.");
        }

        updateRestaurantDetails(data);
    }

    /* =====================================================
       MENU CATEGORY BUTTONS
    ===================================================== */

    function buildCategoryButtons() {
        if (!menuCategories) return;

        const categoryNames = [
            ...new Set(
                foods.map(food => String(food.category_name || "").trim())
                    .filter(Boolean)
            )
        ].sort((a, b) => a.localeCompare(b));

        menuCategories.innerHTML = "";

        const allButton = document.createElement("button");
        allButton.type = "button";
        allButton.className = "menu-category active";
        allButton.dataset.category = "all";
        allButton.textContent = "All";
        menuCategories.appendChild(allButton);

        categoryNames.forEach(name => {
            const button = document.createElement("button");
            button.type = "button";
            button.className = "menu-category";
            button.dataset.category = normalizeCategory(name);
            button.textContent = name;
            menuCategories.appendChild(button);
        });
    }

    /* =====================================================
       RENDER MENU
    ===================================================== */

    function renderFoods() {
        if (!menuFoodGrid) return;

        if (foods.length === 0) {
            menuFoodGrid.innerHTML =
                '<p class="home-message">This restaurant has no available menu items right now.</p>';

            if (noMenuResults) noMenuResults.hidden = true;
            return;
        }

        menuFoodGrid.innerHTML = foods.map(food => {
            const name = escapeHTML(food.name || "Food item");
            const description = escapeHTML(food.description || "");
            const categoryName = String(food.category_name || "Other");
            const category = escapeHTML(normalizeCategory(categoryName));
            const price = escapeHTML(formatPrice(food.price));
            const image = escapeHTML(
                getImageUrl(food.image_url, FOOD_PLACEHOLDER)
            );
            const id = escapeHTML(food.id);
            const available = food.is_available !== false;

            return `
                <article
                    class="menu-food-card"
                    data-food-name="${name}"
                    data-category="${category}"
                    data-food-id="${id}"
                >
                    <div class="menu-food-image">
                        <img
                            src="${image}"
                            alt="${name}"
                            loading="lazy"
                            onerror="this.onerror=null;this.src='${FOOD_PLACEHOLDER}'"
                        />
                    </div>

                    <div class="menu-food-info">
                        <h3>${name}</h3>
                        <p>${description}</p>

                        <div class="menu-food-bottom">
                            <strong>${price}</strong>
                            <button
                                type="button"
                                class="add-food-button"
                                data-food-id="${id}"
                                ${available ? "" : "disabled"}
                            >${available ? "Add" : "Unavailable"}</button>
                        </div>
                    </div>
                </article>
            `;
        }).join("");

        filterMenu();
    }

    async function loadFoods(restaurantId) {
        const result = await fetchJSON(`${API_BASE}/foods`);

        const responseData = result.data?.foods ?? result.foods ?? result.data;
        let foodList;

        // Accommodate a plain array or a paginated/list object.
        if (Array.isArray(responseData)) {
            foodList = responseData;
        } else if (Array.isArray(responseData?.foods)) {
            foodList = responseData.foods;
        } else {
            throw new Error("The API response did not contain a food list.");
        }

        foods = foodList.filter(food =>
            food &&
            String(food.restaurant_id) === String(restaurantId) &&
            food.is_available !== false
        );

        buildCategoryButtons();
        renderFoods();
    }

    /* =====================================================
       SEARCH AND FILTERS
    ===================================================== */

    function filterMenu() {
        if (!menuFoodGrid) return;

        const searchTerm = menuSearch
            ? menuSearch.value.trim().toLowerCase()
            : "";

        let visibleCount = 0;

        menuFoodGrid.querySelectorAll(".menu-food-card").forEach(card => {
            const name = (card.dataset.foodName || "").toLowerCase();
            const text = card.textContent.toLowerCase();
            const category = normalizeCategory(card.dataset.category);

            const matchesSearch =
                !searchTerm ||
                name.includes(searchTerm) ||
                text.includes(searchTerm);

            const matchesCategory =
                selectedCategory === "all" ||
                category === selectedCategory;

            const visible = matchesSearch && matchesCategory;
            card.style.display = visible ? "" : "none";

            if (visible) visibleCount++;
        });

        if (noMenuResults) {
            noMenuResults.hidden = visibleCount !== 0;
        }
    }

    if (menuSearchForm) {
        menuSearchForm.addEventListener("submit", event => {
            event.preventDefault();
            filterMenu();
        });
    }

    if (menuSearch) {
        menuSearch.addEventListener("input", filterMenu);
    }

    if (menuCategories) {
        menuCategories.addEventListener("click", event => {
            const button = event.target.closest(".menu-category");
            if (!button) return;

            selectedCategory =
                normalizeCategory(button.dataset.category || "all");

            menuCategories.querySelectorAll(".menu-category")
                .forEach(item => item.classList.remove("active"));

            button.classList.add("active");
            filterMenu();
        });
    }

    /* =====================================================
       ADD-TO-CART EVENTS
       Delegation works for menu cards loaded dynamically.
    ===================================================== */

    if (menuFoodGrid) {
        menuFoodGrid.addEventListener("click", event => {
            const button = event.target.closest(".add-food-button");
            if (!button || button.disabled) return;

            const food = foods.find(
                item => String(item.id) === String(button.dataset.foodId)
            );

            if (!food) {
                console.error("Could not find food item for cart:", button.dataset.foodId);
                return;
            }

            addToCart(food, button);
        });
    }

    /* =====================================================
       MOBILE NAVIGATION
    ===================================================== */

    const mobileMenuButton = document.getElementById("mobileMenuButton");
    const mobileNavigation = document.getElementById("mobileNavigation");

    if (mobileMenuButton && mobileNavigation) {
        mobileMenuButton.addEventListener("click", () => {
            mobileNavigation.classList.toggle("active");

            const isOpen = mobileNavigation.classList.contains("active");
            mobileMenuButton.setAttribute("aria-expanded", String(isOpen));
        });

        mobileNavigation.querySelectorAll("a").forEach(link => {
            link.addEventListener("click", () => {
                mobileNavigation.classList.remove("active");
                mobileMenuButton.setAttribute("aria-expanded", "false");
            });
        });
    }

    /* =====================================================
       INITIALIZE
    ===================================================== */

    async function initializePage() {
        updateCartCount();

        const id = getRestaurantId();

        if (!id || !/^[1-9]\d*$/.test(id)) {
            if (restaurantName) restaurantName.textContent = "Restaurant not found";

            if (menuFoodGrid) {
                menuFoodGrid.innerHTML =
                    '<p class="home-message">Please return to the restaurants page and select a restaurant.</p>';
            }

            console.error("Missing or invalid restaurant ID in page URL.");
            return;
        }

        try {
            await loadRestaurant(id);
            await loadFoods(id);
        } catch (error) {
            console.error("Failed to load restaurant page:", error);

            if (menuFoodGrid) {
                menuFoodGrid.innerHTML =
                    '<p class="home-message">We could not load this restaurant or its menu. Please refresh and try again.</p>';
            }

            if (restaurantName && !restaurant) {
                restaurantName.textContent = "Unable to load restaurant";
            }
        }
    }

    initializePage();
});
