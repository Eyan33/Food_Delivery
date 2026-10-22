
document.addEventListener("DOMContentLoaded", () => {
    const API = window.FoodDeliveryAuthApi;
    const byId = (id) => document.getElementById(id);
    const message = byId("operationsMessage");

    if (!API?.request) return;

    const request = (path, options = {}) =>
        API.request(path, { ...options, authenticated: true });

    const showMessage = (text, error = false) => {
        message.textContent = text;
        message.classList.toggle("error", error);
        message.classList.toggle("success", Boolean(text) && !error);
    };

    const listFrom = (data, name) =>
        data?.[name] || data?.data?.[name] || [];

    const money = (value) =>
        `KSh ${Number(value || 0).toLocaleString("en-KE")}`;

    let catalogCache = {
        foods: [],
        categories: [],
        restaurants: [],
    };

    let selectedRestaurantId = null;
    let currentAdminId = null;
    let foodSearchTimer = null;
    let reviewSearchTimer = null;

    const listPages = { admins: 1, reviews: 1, audit: 1 };
    const listPagination = { admins: null, reviews: null, audit: null };

    function cell(row, text) {
        const element = document.createElement("td");
        element.textContent = text == null || text === "" ? "—" : String(text);
        row.append(element);
        return element;
    }

    function button(label, action, secondary = false) {
        const element = document.createElement("button");
        element.type = "button";
        element.textContent = label;
        element.className = secondary
            ? "admin-secondary-button"
            : "admin-primary-button";
        element.addEventListener("click", action);
        return element;
    }

    function sameId(a, b) {
        return String(a ?? "") === String(b ?? "");
    }

    function restaurantName(restaurantId) {
        const restaurant = catalogCache.restaurants.find(
            (item) => sameId(item.id, restaurantId)
        );

        return restaurant?.name || `Restaurant ${restaurantId ?? ""}`;
    }

    function restaurantFoods(restaurantId) {
        return catalogCache.foods.filter(
            (food) => sameId(food.restaurant_id, restaurantId)
        );
    }

    function restaurantCategories(restaurantId) {
        return catalogCache.categories.filter(
            (category) => sameId(category.restaurant_id, restaurantId)
        );
    }

    function setRestaurantSelects(restaurantId) {
        byId("foodRestaurant").value = String(restaurantId ?? "");
        byId("categoryRestaurant").value = String(restaurantId ?? "");
        refreshFoodCategories();
    }

    // -------------------------------------------------------
    // Restaurant cards
    // -------------------------------------------------------

    function renderRestaurantCards() {
        const host = byId("restaurantCards");
        host.replaceChildren();

        if (!catalogCache.restaurants.length) {
            const empty = document.createElement("div");
            empty.className = "restaurant-cards-empty";
            empty.textContent =
                "No restaurants were found. Add or activate a restaurant first.";
            host.append(empty);
            return;
        }

        catalogCache.restaurants.forEach((restaurant) => {
            const foods = restaurantFoods(restaurant.id);
            const categories = restaurantCategories(restaurant.id);

            const card = document.createElement("button");
            card.type = "button";
            card.className = "restaurant-card";
            card.setAttribute(
                "aria-label",
                `Manage catalog for ${restaurant.name}`
            );

            const icon = document.createElement("span");
            icon.className = "restaurant-card-icon";
            icon.setAttribute("aria-hidden", "true");
            icon.textContent = "▦";

            const name = document.createElement("h4");
            name.textContent = restaurant.name || "Unnamed restaurant";

            const description = document.createElement("p");
            description.className = "restaurant-card-description";
            description.textContent =
                restaurant.address || "Manage foods and categories";

            const stats = document.createElement("div");
            stats.className = "restaurant-card-stats";

            const foodCount = document.createElement("span");
            foodCount.textContent =
                `${foods.length} ${foods.length === 1 ? "food item" : "food items"}`;

            const categoryCount = document.createElement("span");
            categoryCount.textContent =
                `${categories.length} ${categories.length === 1 ? "category" : "categories"}`;

            stats.append(foodCount, categoryCount);

            const action = document.createElement("span");
            action.className = "restaurant-card-action";
            action.textContent = "Manage catalog →";

            card.append(icon, name, description, stats, action);

            card.addEventListener("click", () => {
                selectedRestaurantId = restaurant.id;

                byId("restaurantCards").hidden = true;
                byId("restaurantCatalogWorkspace").hidden = false;

                byId("selectedRestaurantName").textContent = restaurant.name;
                byId("selectedRestaurantSummary").textContent =
                    "Manage food items, prices, availability, and categories for this restaurant.";

                setRestaurantSelects(restaurant.id);
                byId("foodSearch").value = "";

                renderSelectedCatalog();
                showMessage("");
            });

            host.append(card);
        });
    }

    // -------------------------------------------------------
    // Food and category tables for the selected restaurant
    // -------------------------------------------------------

    function renderSelectedCatalog() {
        if (selectedRestaurantId == null) return;

        const restaurantId = selectedRestaurantId;
        const foodsBody = byId("foodsBody");
        const categoriesBody = byId("categoriesBody");

        const search = byId("foodSearch").value.trim().toLowerCase();

        const foods = restaurantFoods(restaurantId).filter((food) =>
            String(food.name || "").toLowerCase().includes(search)
        );

        foodsBody.replaceChildren();

        foods.forEach((food) => {
            const row = document.createElement("tr");

            cell(row, food.name);
            cell(row, restaurantName(food.restaurant_id));
            cell(row, money(food.price));
            cell(row, food.is_available ? "Available" : "Unavailable");

            const actions = document.createElement("td");

            actions.append(button("Edit", async () => {
                const name = window.prompt("Food name:", food.name);
                if (name === null) return;

                const price = window.prompt("Price in KSh:", String(food.price));
                if (price === null) return;

                const amount = Number(price);

                if (
                    !name.trim() ||
                    !Number.isFinite(amount) ||
                    amount < 0
                ) {
                    showMessage(
                        "Enter a food name and a valid non-negative price.",
                        true
                    );
                    return;
                }

                try {
                    await request(`/foods/admin/${food.id}`, {
                        method: "PUT",
                        body: {
                            name: name.trim(),
                            price: amount,
                        },
                    });

                    await loadCatalog();
                    showMessage("Food item updated.");
                } catch (error) {
                    showMessage(error.message || "Could not update food item.", true);
                }
            }, true));

            actions.append(button(
                food.is_available ? "Mark unavailable" : "Make available",
                async () => {
                    try {
                        await request(`/foods/admin/${food.id}/availability`, {
                            method: "PATCH",
                            body: {
                                is_available: !food.is_available,
                            },
                        });

                        await loadCatalog();
                        showMessage("Food availability updated.");
                    } catch (error) {
                        showMessage(
                            error.message || "Could not update availability.",
                            true
                        );
                    }
                }
            ));

            actions.append(button("Delete", async () => {
                if (!window.confirm(`Delete food item "${food.name}"?`)) return;

                try {
                    await request(`/foods/admin/${food.id}`, {
                        method: "DELETE",
                    });

                    await loadCatalog();
                    showMessage("Food item deleted.");
                } catch (error) {
                    showMessage(error.message || "Could not delete food item.", true);
                }
            }, true));

            row.append(actions);
            foodsBody.append(row);
        });

        if (!foods.length) {
            const row = document.createElement("tr");
            const empty = document.createElement("td");
            empty.colSpan = 5;
            empty.className = "operations-empty";
            empty.textContent = search
                ? "No food items match your search."
                : "No food items have been added to this restaurant yet.";
            row.append(empty);
            foodsBody.append(row);
        }

        const categories = restaurantCategories(restaurantId);
        categoriesBody.replaceChildren();

        categories.forEach((category) => {
            const row = document.createElement("tr");

            cell(row, category.name);
            cell(row, restaurantName(category.restaurant_id));
            cell(row, category.is_active ? "Active" : "Inactive");

            const actions = document.createElement("td");

            actions.append(button("Edit", async () => {
                const name = window.prompt("Category name:", category.name);

                if (name === null || !name.trim()) return;

                try {
                    await request(`/categories/admin/${category.id}`, {
                        method: "PUT",
                        body: { name: name.trim() },
                    });

                    await loadCatalog();
                    showMessage("Category updated.");
                } catch (error) {
                    showMessage(error.message || "Could not update category.", true);
                }
            }, true));

            actions.append(button("Delete", async () => {
                if (!window.confirm(`Delete category "${category.name}"?`)) return;

                try {
                    await request(`/categories/admin/${category.id}`, {
                        method: "DELETE",
                    });

                    await loadCatalog();
                    showMessage("Category deleted.");
                } catch (error) {
                    showMessage(error.message || "Could not delete category.", true);
                }
            }, true));

            row.append(actions);
            categoriesBody.append(row);
        });

        if (!categories.length) {
            const row = document.createElement("tr");
            const empty = document.createElement("td");
            empty.colSpan = 4;
            empty.className = "operations-empty";
            empty.textContent =
                "No categories have been added to this restaurant yet.";
            row.append(empty);
            categoriesBody.append(row);
        }

        // Update the card counts after edits, additions, or deletions.
        renderRestaurantCards();
        byId("restaurantCards").hidden = true;
        byId("restaurantCatalogWorkspace").hidden = false;
    }

    // -------------------------------------------------------
    // Load catalog from the existing backend endpoints
    // -------------------------------------------------------

    async function loadCatalog() {
        const [foodData, categoryData, restaurantData] = await Promise.all([
            request("/foods/admin?limit=100"),
            request("/categories/admin?limit=100"),
            request("/restaurants/admin?limit=100"),
        ]);

        catalogCache = {
            foods: listFrom(foodData, "foods"),
            categories: listFrom(categoryData, "categories"),
            restaurants: listFrom(restaurantData, "restaurants"),
        };

        const restaurantOptions = catalogCache.restaurants.map(
            (restaurant) => new Option(restaurant.name, restaurant.id)
        );

        [byId("foodRestaurant"), byId("categoryRestaurant")].forEach(
            (select) => {
                select.replaceChildren(
                    ...restaurantOptions.map((option) => option.cloneNode(true))
                );
            }
        );

        renderRestaurantCards();

        if (selectedRestaurantId != null) {
            const exists = catalogCache.restaurants.some(
                (restaurant) => sameId(restaurant.id, selectedRestaurantId)
            );

            if (exists) {
                const restaurant = catalogCache.restaurants.find(
                    (item) => sameId(item.id, selectedRestaurantId)
                );

                byId("selectedRestaurantName").textContent = restaurant.name;
                setRestaurantSelects(restaurant.id);
                renderSelectedCatalog();
            } else {
                selectedRestaurantId = null;
                byId("restaurantCards").hidden = false;
                byId("restaurantCatalogWorkspace").hidden = true;
            }
        } else {
            byId("restaurantCards").hidden = false;
            byId("restaurantCatalogWorkspace").hidden = true;
        }
    }

    function refreshFoodCategories() {
        const restaurantId = selectedRestaurantId;
        const categorySelect = byId("foodCategory");
        const previousCategory = categorySelect.value;

        const categories = restaurantId == null
            ? []
            : restaurantCategories(restaurantId);

        categorySelect.replaceChildren(
            new Option("No category", ""),
            ...categories.map(
                (category) => new Option(category.name, category.id)
            )
        );

        if (
            categories.some((category) =>
                sameId(category.id, previousCategory)
            )
        ) {
            categorySelect.value = previousCategory;
        }
    }

    // -------------------------------------------------------
    // Pagination
    // -------------------------------------------------------

    function renderPager(key, elementId) {
        const host = byId(elementId);
        if (!host) return;

        host.replaceChildren();

        const pagination = listPagination[key];

        if (!pagination || Number(pagination.totalPages || 1) <= 1) {
            if (pagination && Number(pagination.totalItems || 0) > 0) {
                host.textContent = `${pagination.totalItems} records`;
            }
            return;
        }

        const label = document.createElement("span");
        label.textContent =
            `Page ${pagination.page} of ${pagination.totalPages} · ${pagination.totalItems} records`;

        const previous = button("Previous", async () => {
            if (listPages[key] > 1) {
                listPages[key]--;
                await loadPage(key);
            }
        }, true);

        previous.disabled = Number(pagination.page) <= 1;

        const next = button("Next", async () => {
            if (listPages[key] < Number(pagination.totalPages)) {
                listPages[key]++;
                await loadPage(key);
            }
        }, true);

        next.disabled =
            Number(pagination.page) >= Number(pagination.totalPages);

        host.append(label, previous, next);
    }

    async function loadPage(key) {
        try {
            if (key === "admins") await loadAdmins();
            if (key === "reviews") await loadReviews();
            if (key === "audit") await loadAudit();
        } catch (error) {
            showMessage(error.message || "Could not load this page.", true);
        }
    }

    // -------------------------------------------------------
    // Administrator accounts
    // -------------------------------------------------------

    async function loadAdmins() {
        const data = await request(
            `/admins?page=${listPages.admins}&limit=25`
        );

        const admins = listFrom(data, "admins");
        listPagination.admins =
            data?.data?.pagination || data?.pagination || null;

        renderPager("admins", "adminsPager");

        const body = byId("adminsBody");
        body.replaceChildren();

        admins.forEach((admin) => {
            const row = document.createElement("tr");

            cell(row, `${admin.first_name} ${admin.last_name}`);
            cell(row, admin.email);
            cell(row, admin.phone);
            cell(row, admin.is_active ? "Active" : "Inactive");

            const actions = document.createElement("td");

            if (admin.is_active) {
                const isSelf = currentAdminId != null &&
                    sameId(admin.id, currentAdminId);

                const deactivate = button(
                    isSelf ? "Your account" : "Deactivate",
                    async () => {
                        if (isSelf) return;

                        if (!window.confirm(`Deactivate ${admin.email}?`)) return;

                        try {
                            await request(`/admins/${admin.id}`, {
                                method: "DELETE",
                            });

                            await loadAdmins();
                            showMessage("Administrator deactivated.");
                        } catch (error) {
                            showMessage(error.message, true);
                        }
                    },
                    true
                );

                deactivate.disabled = isSelf;

                if (isSelf) {
                    deactivate.title =
                        "You cannot deactivate the currently signed-in account.";
                }

                actions.append(deactivate);
            } else {
                actions.append(button("Activate", async () => {
                    try {
                        await request(`/admins/${admin.id}/activate`, {
                            method: "PATCH",
                        });

                        await loadAdmins();
                        showMessage("Administrator activated.");
                    } catch (error) {
                        showMessage(error.message, true);
                    }
                }));
            }

            row.append(actions);
            body.append(row);
        });

        if (!admins.length) {
            body.innerHTML =
                '<tr><td colspan="5" class="operations-empty">No administrator accounts found.</td></tr>';
        }
    }

    // -------------------------------------------------------
    // Reviews
    // -------------------------------------------------------

    async function loadReviews() {
        const params = new URLSearchParams({
            page: String(listPages.reviews),
            limit: "25",
            visibility: byId("reviewVisibility").value,
            search: byId("reviewSearch").value.trim(),
        });

        const data = await request(`/admins/reviews?${params}`);
        const reviews = listFrom(data, "reviews");

        listPagination.reviews =
            data?.data?.pagination || data?.pagination || null;

        renderPager("reviews", "reviewsPager");

        const body = byId("reviewsBody");
        body.replaceChildren();

        reviews.forEach((review) => {
            const row = document.createElement("tr");

            cell(row, review.customer_name);
            cell(row, review.restaurant_name);
            cell(row, `${review.rating} / 5`);
            cell(row, review.comment);
            cell(row, new Date(review.created_at).toLocaleDateString());
            cell(row, review.is_visible ? "Visible" : "Hidden");

            const actions = document.createElement("td");

            actions.append(button(
                review.is_visible ? "Hide" : "Restore",
                async () => {
                    try {
                        await request(
                            `/admins/reviews/${review.id}/visibility`,
                            {
                                method: "PATCH",
                                body: { is_visible: !review.is_visible },
                            }
                        );

                        await loadReviews();

                        showMessage(
                            review.is_visible
                                ? "Review hidden from customers."
                                : "Review restored."
                        );
                    } catch (error) {
                        showMessage(error.message, true);
                    }
                },
                review.is_visible
            ));

            row.append(actions);
            body.append(row);
        });

        if (!reviews.length) {
            body.innerHTML =
                '<tr><td colspan="7" class="operations-empty">No reviews match this filter.</td></tr>';
        }
    }

    // -------------------------------------------------------
    // Audit history
    // -------------------------------------------------------

    async function loadAudit() {
        const data = await request(
            `/admins/audit-logs?page=${listPages.audit}&limit=25`
        );

        const logs = listFrom(data, "logs");

        listPagination.audit =
            data?.data?.pagination || data?.pagination || null;

        renderPager("audit", "auditPager");

        const body = byId("auditBody");
        body.replaceChildren();

        logs.forEach((log) => {
            const row = document.createElement("tr");

            cell(row, new Date(log.created_at).toLocaleString());
            cell(row, log.admin_name || log.admin_email || "Admin removed");
            cell(row, log.action);
            cell(row, log.resource);

            const statusCode = Number(log.status_code);

            cell(
                row,
                `${statusCode >= 200 && statusCode < 400 ? "Success" : "Failed"} (${statusCode})`
            );

            body.append(row);
        });

        if (!logs.length) {
            body.innerHTML =
                '<tr><td colspan="5" class="operations-empty">No recorded admin changes yet.</td></tr>';
        }
    }

    // -------------------------------------------------------
    // Add food to the selected restaurant
    // -------------------------------------------------------

    byId("foodForm").addEventListener("submit", async (event) => {
        event.preventDefault();

        if (selectedRestaurantId == null) {
            showMessage("Select a restaurant first.", true);
            return;
        }

        const name = byId("foodName").value.trim();
        const price = Number(byId("foodPrice").value);
        const preparation = byId("foodPrep").value;

        if (!name || !Number.isFinite(price) || price < 0) {
            showMessage("Enter a food name and a valid price.", true);
            return;
        }

        try {
            await request("/foods/admin", {
                method: "POST",
                body: {
                    restaurant_id: Number(selectedRestaurantId),
                    category_id: byId("foodCategory").value
                        ? Number(byId("foodCategory").value)
                        : null,
                    name,
                    price,
                    preparation_time: preparation
                        ? Number(preparation)
                        : null,
                },
            });

            event.currentTarget.reset();

            // Resetting a form can change hidden selects; restore the chosen restaurant.
            setRestaurantSelects(selectedRestaurantId);

            await loadCatalog();
            showMessage("Food item created.");
        } catch (error) {
            showMessage(error.message || "Could not create food item.", true);
        }
    });

    // -------------------------------------------------------
    // Add category to the selected restaurant
    // -------------------------------------------------------

    byId("categoryForm").addEventListener("submit", async (event) => {
        event.preventDefault();

        if (selectedRestaurantId == null) {
            showMessage("Select a restaurant first.", true);
            return;
        }

        const name = byId("categoryName").value.trim();

        if (!name) {
            showMessage("Enter a category name.", true);
            return;
        }

        try {
            await request("/categories/admin", {
                method: "POST",
                body: {
                    restaurant_id: Number(selectedRestaurantId),
                    name,
                },
            });

            event.currentTarget.reset();
            setRestaurantSelects(selectedRestaurantId);

            await loadCatalog();
            showMessage("Category created.");
        } catch (error) {
            showMessage(error.message || "Could not create category.", true);
        }
    });

    // -------------------------------------------------------
    // Create administrator
    // -------------------------------------------------------

    byId("adminForm").addEventListener("submit", async (event) => {
        event.preventDefault();

        try {
            await request("/admins", {
                method: "POST",
                body: {
                    first_name: byId("newAdminFirst").value.trim(),
                    last_name: byId("newAdminLast").value.trim(),
                    email: byId("newAdminEmail").value.trim(),
                    phone: byId("newAdminPhone").value.trim() || null,
                    password: byId("newAdminPassword").value,
                },
            });

            event.currentTarget.reset();
            await loadAdmins();
            showMessage("Administrator account created.");
        } catch (error) {
            showMessage(error.message || "Could not create administrator.", true);
        }
    });

    // -------------------------------------------------------
    // Return to the restaurant cards
    // -------------------------------------------------------

    byId("backToRestaurants").addEventListener("click", () => {
        selectedRestaurantId = null;

        byId("restaurantCatalogWorkspace").hidden = true;
        byId("restaurantCards").hidden = false;
        byId("foodSearch").value = "";

        showMessage("");
    });

    // -------------------------------------------------------
    // Tabs
    // -------------------------------------------------------

    document.querySelectorAll(".operations-tabs button").forEach((tab) => {
        tab.addEventListener("click", async () => {
            document.querySelectorAll(".operations-tabs button").forEach(
                (item) => item.classList.toggle("active", item === tab)
            );

            document.querySelectorAll(".operations-panel").forEach((panel) => {
                panel.hidden = panel.id !== `panel-${tab.dataset.panel}`;
            });

            try {
                if (tab.dataset.panel === "catalog") await loadCatalog();
                if (tab.dataset.panel === "admins") await loadAdmins();
                if (tab.dataset.panel === "reviews") await loadReviews();
                if (tab.dataset.panel === "audit") await loadAudit();
            } catch (error) {
                showMessage(
                    error.message || "Could not load operations data.",
                    true
                );
            }
        });
    });

    // -------------------------------------------------------
    // Refresh and search handlers
    // -------------------------------------------------------

    byId("foodSearch").addEventListener("input", () => {
        clearTimeout(foodSearchTimer);

        foodSearchTimer = setTimeout(() => {
            renderSelectedCatalog();
        }, 200);
    });

    byId("refreshCatalog").addEventListener("click", () => {
        loadCatalog().catch((error) => {
            showMessage(error.message || "Could not refresh catalog.", true);
        });
    });

    byId("reviewVisibility").addEventListener("change", () => {
        listPages.reviews = 1;
        loadReviews().catch((error) => showMessage(error.message, true));
    });

    byId("reviewSearch").addEventListener("input", () => {
        listPages.reviews = 1;
        clearTimeout(reviewSearchTimer);

        reviewSearchTimer = setTimeout(() => {
            loadReviews().catch((error) => showMessage(error.message, true));
        }, 300);
    });

    byId("refreshReviews").addEventListener("click", () => {
        loadReviews().catch((error) => showMessage(error.message, true));
    });

    byId("refreshAudit").addEventListener("click", () => {
        loadAudit().catch((error) => showMessage(error.message, true));
    });

    // Load the signed-in administrator ID for self-deactivation protection.
    request("/admins/me")
        .then((data) => {
            const admin = data?.data?.admin || data?.admin;
            currentAdminId = admin?.id ?? null;
        })
        .catch(() => {});

    // Initial catalog load.
    loadCatalog().catch((error) => {
        showMessage(error.message || "Could not load catalog data.", true);
    });
});
