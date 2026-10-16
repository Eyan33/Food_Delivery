document.addEventListener("DOMContentLoaded", () => {
    "use strict";

    const API_BASE = (window.FOOD_DELIVERY_API_BASE || document.querySelector('meta[name="api-base-url"]')?.content?.trim() || "http://localhost:5000/api").replace(/\/+$/, "");

    const $ = (id) => document.getElementById(id);

    const menuGrid = $("restaurantMenuGrid");
    const menuForm = $("menuForm");
    const menuModal = $("menuModal");
    const deleteModal = $("deleteMenuModal");

    const searchInput = $("menuSearch");
    const categoryFilter = $("menuCategoryFilter");
    const availabilityFilter = $("menuAvailabilityFilter");
    const sortSelect = $("menuSort");

    const menuItemCount = $("menuItemCount");
    const totalMenuItems = $("totalMenuItems");
    const availableMenuItems = $("availableMenuItems");
    const unavailableMenuItems = $("unavailableMenuItems");
    const featuredMenuItems = $("featuredMenuItems");
    const noResults = $("menuNoResults");
    const menuMessage = $("menuMessage");

    const menuModalTitle = $("menuModalTitle");
    const menuItemName = $("menuItemName");
    const menuItemCategory = $("menuItemCategory");
    const menuItemPrice = $("menuItemPrice");
    const menuItemDescription = $("menuItemDescription");
    const menuItemAvailable = $("menuItemAvailable");
    const menuItemFeatured = $("menuItemFeatured");

    const menuFormMessage = $("menuFormMessage");
    const saveMenuButton = $("saveMenuButton");
    const deleteMenuItemName = $("deleteMenuItemName");
    const deleteMenuMessage = $("deleteMenuMessage");

    let foods = [];
    let categories = [];
    let editingFoodId = null;
    let deletingFoodId = null;
    let activeCategory = "all";
    let saving = false;

    /*
    |--------------------------------------------------------------------------
    | API REQUEST HELPER
    |--------------------------------------------------------------------------
    */

    async function apiRequest(path, options = {}) {
        const token =
            localStorage.getItem("foodDeliveryAccessToken") ||
            sessionStorage.getItem("foodDeliveryAccessToken");

        if (!token) {
            throw new Error("Your session has expired. Please log in again.");
        }

        const headers = {
            Authorization: `Bearer ${token}`,
            ...(options.body ? { "Content-Type": "application/json" } : {}),
            ...(options.headers || {})
        };

        const response = await fetch(`${API_BASE}${path}`, {
            ...options,
            headers
        });

        let result;

        try {
            result = await response.json();
        } catch {
            throw new Error("The server returned an invalid response.");
        }

        if (!response.ok || result.success === false) {
            throw new Error(
                result.message || `Request failed (${response.status}).`
            );
        }

        return result;
    }

    /*
    |--------------------------------------------------------------------------
    | INITIAL LOAD
    |--------------------------------------------------------------------------
    */

    async function initializeMenu() {
        if (!menuGrid) return;

        menuGrid.innerHTML = `
            <div class="restaurant-page-message">
                Loading your menu...
            </div>
        `;

        try {
            const [foodResult, categoryResult] = await Promise.all([
                apiRequest("/foods/restaurant/my"),
                apiRequest("/foods/categories/my")
            ]);

            foods = Array.isArray(foodResult.data?.foods)
                ? foodResult.data.foods
                : [];

            categories = Array.isArray(categoryResult.data?.categories)
                ? categoryResult.data.categories
                : [];

            populateCategoryControls();
            renderMenu();
            updateStatistics();
            filterMenu();
        } catch (error) {
            console.error("Menu loading error:", error);

            menuGrid.innerHTML = `
                <div class="restaurant-page-message">
                    ${escapeHtml(error.message)}
                </div>
            `;

            showMessage(error.message);
        }
    }

    /*
    |--------------------------------------------------------------------------
    | CATEGORY CONTROLS
    |--------------------------------------------------------------------------
    */

    function populateCategoryControls() {
        if (menuItemCategory) {
            const selectedValue = menuItemCategory.value;

            menuItemCategory.innerHTML = `
                <option value="">Select category</option>
            `;

            categories.forEach((category) => {
                const option = document.createElement("option");
                option.value = String(category.id);
                option.textContent = category.name;
                menuItemCategory.appendChild(option);
            });

            if (selectedValue) {
                menuItemCategory.value = selectedValue;
            }
        }

        if (categoryFilter) {
            const selectedValue = categoryFilter.value;

            categoryFilter.innerHTML = `
                <option value="all">All Categories</option>
            `;

            categories.forEach((category) => {
                const option = document.createElement("option");
                option.value = String(category.id);
                option.textContent = category.name;
                categoryFilter.appendChild(option);
            });

            if (
                selectedValue === "all" ||
                categories.some((category) =>
                    String(category.id) === selectedValue
                )
            ) {
                categoryFilter.value = selectedValue || "all";
            } else {
                categoryFilter.value = "all";
            }
        }

        renderCategoryTabs();
    }

    function renderCategoryTabs() {
        const container = document.querySelector(".menu-category-tabs");
        if (!container) return;

        container.innerHTML = "";

        const allTab = document.createElement("button");
        allTab.type = "button";
        allTab.className = "menu-category-tab";
        allTab.dataset.category = "all";
        allTab.innerHTML = `All Items <span>0</span>`;
        container.appendChild(allTab);

        categories.forEach((category) => {
            const tab = document.createElement("button");
            tab.type = "button";
            tab.className = "menu-category-tab";
            tab.dataset.category = String(category.id);
            tab.innerHTML = `
                ${escapeHtml(category.name)}
                <span>0</span>
            `;
            container.appendChild(tab);
        });

        container.querySelectorAll(".menu-category-tab").forEach((tab) => {
            tab.addEventListener("click", () => {
                activeCategory = tab.dataset.category || "all";

                if (categoryFilter) {
                    categoryFilter.value = activeCategory;
                }

                updateActiveCategoryTab();
                filterMenu();
            });
        });

        updateActiveCategoryTab();
    }

    function categoryIdOf(food) {
        return food.category_id == null ? "" : String(food.category_id);
    }

    function categoryNameOf(food) {
        if (food.category_name) return food.category_name;

        const category = categories.find(
            (item) => String(item.id) === categoryIdOf(food)
        );

        return category ? category.name : "Uncategorized";
    }

    /*
    |--------------------------------------------------------------------------
    | RENDER MENU CARDS
    |--------------------------------------------------------------------------
    */

    function renderMenu() {
        if (!menuGrid) return;

        menuGrid.innerHTML = "";

        foods.forEach((food) => {
            const card = document.createElement("article");

            card.className = "restaurant-menu-item-card";
            card.dataset.menuId = String(food.id);
            card.dataset.category = categoryIdOf(food);
            card.dataset.available = String(food.is_available === true);
            card.dataset.featured = String(food.is_featured === true);
            card.dataset.name = food.name || "";
            card.dataset.price = String(food.price ?? 0);

            const imageUrl = food.image_url;
            const imageMarkup = imageUrl
                ? `<img src="${escapeHtml(imageUrl)}"
                         alt="${escapeHtml(food.name || "Food item")}"
                         loading="lazy"
                         style="width:100%;height:100%;object-fit:cover;">`
                : `<div class="menu-item-image-placeholder">🍽️</div>`;

            card.innerHTML = `
                <div class="menu-item-image">
                    ${imageMarkup}

                    <span class="menu-item-availability ${
                        food.is_available === true ? "available" : "unavailable"
                    }">
                        ${food.is_available === true ? "Available" : "Unavailable"}
                    </span>

                    ${
                        food.is_featured === true
                            ? `<span class="menu-item-featured">★ Featured</span>`
                            : ""
                    }
                </div>

                <div class="menu-item-content">
                    <div class="menu-item-top">
                        <div>
                            <span class="menu-item-category">
                                ${escapeHtml(categoryNameOf(food))}
                            </span>
                            <h4>${escapeHtml(food.name || "")}</h4>
                        </div>

                        <strong class="menu-item-price">
                            KSh ${formatPrice(food.price)}
                        </strong>
                    </div>

                    <p class="menu-item-description">
                        ${escapeHtml(food.description || "No description provided.")}
                    </p>

                    <div class="menu-item-footer">
                        <span class="menu-item-sales">
                            ${
                                food.preparation_time
                                    ? `${escapeHtml(food.preparation_time)} min preparation`
                                    : "Menu item"
                            }
                        </span>

                        <div class="menu-item-actions">
                            <button type="button"
                                class="menu-action-button"
                                data-menu-action="availability"
                                data-menu-id="${food.id}">
                                ${food.is_available === true ? "Mark Unavailable" : "Mark Available"}
                            </button>

                            <button type="button"
                                class="menu-action-button"
                                data-menu-action="featured"
                                data-menu-id="${food.id}">
                                ${food.is_featured === true ? "Unfeature" : "Feature"}
                            </button>

                            <button type="button"
                                class="menu-action-button edit"
                                data-menu-action="edit"
                                data-menu-id="${food.id}">
                                Edit
                            </button>

                            <button type="button"
                                class="menu-action-button delete"
                                data-menu-action="delete"
                                data-menu-id="${food.id}">
                                Delete
                            </button>
                        </div>
                    </div>
                </div>
            `;

            menuGrid.appendChild(card);
        });
    }

    /*
    |--------------------------------------------------------------------------
    | SEARCH, FILTERS, SORTING
    |--------------------------------------------------------------------------
    */

    function filterMenu() {
        const search = (searchInput?.value || "").trim().toLowerCase();
        const selectedCategory = categoryFilter?.value || "all";
        const availability = availabilityFilter?.value || "all";

        const cards = Array.from(
            menuGrid.querySelectorAll(".restaurant-menu-item-card")
        );

        let visibleCount = 0;

        cards.forEach((card) => {
            const food = getFood(card.dataset.menuId);
            if (!food) return;

            const description = (food.description || "").toLowerCase();

            const matchesSearch =
                !search ||
                (food.name || "").toLowerCase().includes(search) ||
                description.includes(search);

            const matchesFilter =
                selectedCategory === "all" ||
                categoryIdOf(food) === selectedCategory;

            const matchesTab =
                activeCategory === "all" ||
                categoryIdOf(food) === activeCategory;

            const isAvailable = food.is_available === true;

            const matchesAvailability =
                availability === "all" ||
                (availability === "available" && isAvailable) ||
                (availability === "unavailable" && !isAvailable);

            const visible =
                matchesSearch &&
                matchesFilter &&
                matchesTab &&
                matchesAvailability;

            card.style.display = visible ? "" : "none";

            if (visible) visibleCount++;
        });

        sortVisibleCards();

        if (menuItemCount) menuItemCount.textContent = visibleCount;
        if (noResults) noResults.hidden = visibleCount !== 0;
    }

    function sortVisibleCards() {
        if (!menuGrid) return;

        const sortValue = sortSelect?.value || "default";
        const cards = Array.from(
            menuGrid.querySelectorAll(".restaurant-menu-item-card")
        );

        cards.sort((a, b) => {
            const foodA = getFood(a.dataset.menuId);
            const foodB = getFood(b.dataset.menuId);

            if (!foodA || !foodB) return 0;

            switch (sortValue) {
                case "name-asc":
                case "name":
                    return (foodA.name || "").localeCompare(foodB.name || "");

                case "name-desc":
                    return (foodB.name || "").localeCompare(foodA.name || "");

                case "price-low":
                case "price-asc":
                    return Number(foodA.price) - Number(foodB.price);

                case "price-high":
                case "price-desc":
                    return Number(foodB.price) - Number(foodA.price);

                case "newest":
                    return new Date(foodB.created_at || 0) -
                        new Date(foodA.created_at || 0);

                default:
                    return 0;
            }
        });

        cards.forEach((card) => menuGrid.appendChild(card));
    }

    function updateActiveCategoryTab() {
        document.querySelectorAll(".menu-category-tab").forEach((tab) => {
            tab.classList.toggle(
                "active",
                (tab.dataset.category || "all") === activeCategory
            );
        });
    }

    function updateStatistics() {
        const total = foods.length;
        const available = foods.filter((food) => food.is_available === true).length;
        const unavailable = total - available;
        const featured = foods.filter((food) => food.is_featured === true).length;

        if (totalMenuItems) totalMenuItems.textContent = total;
        if (availableMenuItems) availableMenuItems.textContent = available;
        if (unavailableMenuItems) unavailableMenuItems.textContent = unavailable;
        if (featuredMenuItems) featuredMenuItems.textContent = featured;

        document.querySelectorAll(".menu-category-tab").forEach((tab) => {
            const categoryId = tab.dataset.category || "all";
            const count = categoryId === "all"
                ? total
                : foods.filter((food) => categoryIdOf(food) === categoryId).length;

            const span = tab.querySelector("span");
            if (span) span.textContent = count;
        });
    }

    /*
    |--------------------------------------------------------------------------
    | ADD MENU ITEM
    |--------------------------------------------------------------------------
    */

    $("addMenuItemButton")?.addEventListener("click", () => {
        editingFoodId = null;

        menuForm?.reset();

        if (menuModalTitle) menuModalTitle.textContent = "Add Menu Item";
        if (saveMenuButton) saveMenuButton.textContent = "Save Menu Item";
        if (menuItemAvailable) menuItemAvailable.checked = true;
        if (menuItemFeatured) menuItemFeatured.checked = false;

        clearFormMessage();
        openModal(menuModal);
    });

    /*
    |--------------------------------------------------------------------------
    | EDIT / DELETE / TOGGLE ACTIONS
    |--------------------------------------------------------------------------
    */

    menuGrid?.addEventListener("click", async (event) => {
        const button = event.target.closest("[data-menu-action]");
        if (!button) return;

        const foodId = button.dataset.menuId;
        const action = button.dataset.menuAction;
        const food = getFood(foodId);

        if (!food) {
            showMessage("Menu item could not be found.");
            return;
        }

        if (action === "edit") {
            openEditModal(food);
            return;
        }

        if (action === "delete") {
            deletingFoodId = String(food.id);

            if (deleteMenuItemName) {
                deleteMenuItemName.textContent = food.name;
            }

            if (deleteMenuMessage) {
                deleteMenuMessage.textContent = "";
            }

            openModal(deleteModal);
            return;
        }

        if (action === "availability") {
            await toggleFoodValue(
                food,
                "availability",
                !food.is_available
            );
            return;
        }

        if (action === "featured") {
            await toggleFoodValue(
                food,
                "featured",
                !food.is_featured
            );
        }
    });

    function openEditModal(food) {
        editingFoodId = String(food.id);

        if (menuModalTitle) menuModalTitle.textContent = "Edit Menu Item";
        if (saveMenuButton) saveMenuButton.textContent = "Update Menu Item";

        if (menuItemName) menuItemName.value = food.name || "";
        if (menuItemCategory) {
            menuItemCategory.value = food.category_id == null
                ? ""
                : String(food.category_id);
        }
        if (menuItemPrice) menuItemPrice.value = food.price ?? "";
        if (menuItemDescription) {
            menuItemDescription.value = food.description || "";
        }
        if (menuItemAvailable) {
            menuItemAvailable.checked = food.is_available === true;
        }
        if (menuItemFeatured) {
            menuItemFeatured.checked = food.is_featured === true;
        }

        clearFormMessage();
        openModal(menuModal);
    }

    /*
    |--------------------------------------------------------------------------
    | SAVE MENU ITEM
    |--------------------------------------------------------------------------
    */

    menuForm?.addEventListener("submit", async (event) => {
        event.preventDefault();

        if (saving) return;

        const name = menuItemName?.value.trim() || "";
        const categoryId = menuItemCategory?.value || "";
        const price = Number(menuItemPrice?.value);
        const description = menuItemDescription?.value.trim() || "";

        if (!name) {
            showFormMessage("Please enter the item name.");
            return;
        }

        if (!categoryId) {
            showFormMessage("Please select a category.");
            return;
        }

        if (!Number.isFinite(price) || price < 0) {
            showFormMessage("Please enter a valid price.");
            return;
        }

        const payload = {
            name,
            category_id: Number(categoryId),
            price,
            description,
            is_available: menuItemAvailable?.checked === true,
            is_featured: menuItemFeatured?.checked === true
        };

        saving = true;
        if (saveMenuButton) {
            saveMenuButton.disabled = true;
            saveMenuButton.textContent = "Saving...";
        }

        try {
            if (editingFoodId) {
                await apiRequest(`/foods/${encodeURIComponent(editingFoodId)}`, {
                    method: "PUT",
                    body: JSON.stringify(payload)
                });

                showMessage(`${name} was updated successfully.`);
            } else {
                await apiRequest("/foods", {
                    method: "POST",
                    body: JSON.stringify(payload)
                });

                showMessage(`${name} was added to your menu.`);
            }

            closeModal(menuModal);
            await initializeMenu();
        } catch (error) {
            console.error("Saving menu item failed:", error);
            showFormMessage(error.message);
        } finally {
            saving = false;

            if (saveMenuButton) {
                saveMenuButton.disabled = false;
                saveMenuButton.textContent = editingFoodId
                    ? "Update Menu Item"
                    : "Save Menu Item";
            }
        }
    });

    /*
    |--------------------------------------------------------------------------
    | DELETE MENU ITEM
    |--------------------------------------------------------------------------
    */

    $("confirmDeleteMenuButton")?.addEventListener("click", async () => {
        if (!deletingFoodId) return;

        const button = $("confirmDeleteMenuButton");
        if (button) {
            button.disabled = true;
            button.textContent = "Deleting...";
        }

        try {
            await apiRequest(
                `/foods/${encodeURIComponent(deletingFoodId)}`,
                { method: "DELETE" }
            );

            closeModal(deleteModal);
            showMessage("Menu item deleted successfully.");
            deletingFoodId = null;

            await initializeMenu();
        } catch (error) {
            console.error("Deleting menu item failed:", error);

            if (deleteMenuMessage) {
                deleteMenuMessage.textContent = error.message;
            }
        } finally {
            if (button) {
                button.disabled = false;
                button.textContent = "Delete Item";
            }
        }
    });

    /*
    |--------------------------------------------------------------------------
    | AVAILABILITY / FEATURED STATUS
    |--------------------------------------------------------------------------
    */

    async function toggleFoodValue(food, type, newValue) {
        const isAvailability = type === "availability";

        const endpoint = isAvailability
            ? `/foods/${food.id}/availability`
            : `/foods/${food.id}/featured`;

        const payload = isAvailability
            ? { is_available: newValue }
            : { is_featured: newValue };

        try {
            await apiRequest(endpoint, {
                method: "PATCH",
                body: JSON.stringify(payload)
            });

            showMessage(
                isAvailability
                    ? `${food.name} is now ${newValue ? "available" : "unavailable"}.`
                    : `${food.name} ${newValue ? "is now featured." : "is no longer featured."}`
            );

            await initializeMenu();
        } catch (error) {
            console.error("Updating menu item status failed:", error);
            showMessage(error.message);
        }
    }

    /*
    |--------------------------------------------------------------------------
    | FILTER EVENT LISTENERS
    |--------------------------------------------------------------------------
    */

    searchInput?.addEventListener("input", filterMenu);

    categoryFilter?.addEventListener("change", () => {
        activeCategory = categoryFilter.value || "all";
        updateActiveCategoryTab();
        filterMenu();
    });

    availabilityFilter?.addEventListener("change", filterMenu);

    sortSelect?.addEventListener("change", () => {
        sortVisibleCards();
        filterMenu();
    });

    $("clearMenuFiltersButton")?.addEventListener("click", () => {
        if (searchInput) searchInput.value = "";
        if (categoryFilter) categoryFilter.value = "all";
        if (availabilityFilter) availabilityFilter.value = "all";

        activeCategory = "all";
        updateActiveCategoryTab();
        filterMenu();
    });

    /*
    |--------------------------------------------------------------------------
    | MODALS
    |--------------------------------------------------------------------------
    */

    function openModal(modal) {
        if (!modal) return;

        modal.hidden = false;
        document.body.classList.add("modal-open");
    }

    function closeModal(modal) {
        if (!modal) return;

        modal.hidden = true;

        if (
            (!menuModal || menuModal.hidden) &&
            (!deleteModal || deleteModal.hidden)
        ) {
            document.body.classList.remove("modal-open");
        }
    }

    $("closeMenuModal")?.addEventListener("click", () => {
        closeModal(menuModal);
    });

    $("cancelMenuButton")?.addEventListener("click", () => {
        closeModal(menuModal);
    });

    $("menuModalOverlay")?.addEventListener("click", () => {
        closeModal(menuModal);
    });

    $("cancelDeleteMenuButton")?.addEventListener("click", () => {
        closeModal(deleteModal);
    });

    $("deleteMenuModalOverlay")?.addEventListener("click", () => {
        closeModal(deleteModal);
    });

    document.addEventListener("keydown", (event) => {
        if (event.key === "Escape") {
            closeModal(menuModal);
            closeModal(deleteModal);
        }

        if (
            event.key === "/" &&
            !["INPUT", "TEXTAREA", "SELECT"].includes(
                document.activeElement?.tagName
            )
        ) {
            event.preventDefault();
            searchInput?.focus();
        }
    });

    /*
    |--------------------------------------------------------------------------
    | HELPERS
    |--------------------------------------------------------------------------
    */

    function getFood(id) {
        return foods.find((food) => String(food.id) === String(id));
    }

    function formatPrice(value) {
        return Number(value || 0).toLocaleString("en-KE", {
            maximumFractionDigits: 2
        });
    }

    function escapeHtml(value) {
        return String(value ?? "").replace(/[&<>"']/g, (character) => ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#039;"
        })[character]);
    }

    function showMessage(message) {
        if (!menuMessage) {
            console.info(message);
            return;
        }

        menuMessage.textContent = message;
        menuMessage.hidden = false;

        clearTimeout(showMessage.timeout);

        showMessage.timeout = setTimeout(() => {
            menuMessage.hidden = true;
        }, 4000);
    }

    function showFormMessage(message) {
        if (!menuFormMessage) return;

        menuFormMessage.textContent = message;
        menuFormMessage.hidden = false;
    }

    function clearFormMessage() {
        if (!menuFormMessage) return;

        menuFormMessage.textContent = "";
        menuFormMessage.hidden = true;
    }

    /*
    |--------------------------------------------------------------------------
    | SIDEBAR
    |--------------------------------------------------------------------------
    */

    $("restaurantMenuButton")?.addEventListener("click", () => {
        $("restaurantSidebar")?.classList.toggle("active");
    });

    document.addEventListener("click", (event) => {
        const sidebar = $("restaurantSidebar");
        const button = $("restaurantMenuButton");

        if (
            sidebar &&
            button &&
            !sidebar.contains(event.target) &&
            !button.contains(event.target)
        ) {
            sidebar.classList.remove("active");
        }
    });

    /*
    |--------------------------------------------------------------------------
    | START
    |--------------------------------------------------------------------------
    */

    initializeMenu();
});