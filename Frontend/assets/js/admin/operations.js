document.addEventListener("DOMContentLoaded", () => {
    const API = window.FoodDeliveryAuthApi;
    const byId = (id) => document.getElementById(id);
    const message = byId("operationsMessage");
    if (!API?.request) return;

    const request = (path, options = {}) => API.request(path, { ...options, authenticated: true });
    const showMessage = (text, error = false) => {
        message.textContent = text;
        message.style.color = error ? "#a52d2d" : "#27623e";
    };
    const listFrom = (data, name) => data?.[name] || data?.data?.[name] || [];
    const money = (value) => `KSh ${Number(value || 0).toLocaleString("en-KE")}`;
    let catalogCache = { foods: [], categories: [], restaurants: [] };
    let currentAdminId = null;
    let foodSearchTimer = null;
    let reviewSearchTimer = null;
    const listPages = { admins: 1, reviews: 1, audit: 1 };
    const listPagination = { admins: null, reviews: null, audit: null };

    function cell(row, text) {
        const element = document.createElement("td");
        element.textContent = text == null ? "—" : String(text);
        row.append(element);
        return element;
    }

    function button(label, action, danger = false) {
        const element = document.createElement("button");
        element.type = "button";
        element.textContent = label;
        element.className = danger ? "admin-secondary-button" : "admin-primary-button";
        element.addEventListener("click", action);
        return element;
    }

    function renderPager(key, elementId) {
        const host = byId(elementId);
        if (!host) return;
        host.replaceChildren();
        const pagination = listPagination[key];
        if (!pagination || Number(pagination.totalPages || 1) <= 1) {
            if (pagination && Number(pagination.totalItems || 0) > 0) host.textContent = `${pagination.totalItems} records`;
            return;
        }
        const label = document.createElement("span");
        label.textContent = `Page ${pagination.page} of ${pagination.totalPages} · ${pagination.totalItems} records`;
        const previous = button("Previous", async () => { if (listPages[key] > 1) { listPages[key]--; await loadPage(key); } });
        previous.disabled = Number(pagination.page) <= 1;
        const next = button("Next", async () => { if (listPages[key] < Number(pagination.totalPages)) { listPages[key]++; await loadPage(key); } });
        next.disabled = Number(pagination.page) >= Number(pagination.totalPages);
        host.append(label, previous, next);
    }

    async function loadPage(key) {
        try {
            if (key === "admins") await loadAdmins();
            if (key === "reviews") await loadReviews();
            if (key === "audit") await loadAudit();
        } catch (error) { showMessage(error.message || "Could not load this page.", true); }
    }

    async function loadCatalog() {
        const [foodData, categoryData, restaurantData] = await Promise.all([
            request("/foods/admin?limit=100"),
            request("/categories/admin?limit=100"),
            request("/restaurants/admin?limit=100"),
        ]);
        const foods = listFrom(foodData, "foods");
        const categories = listFrom(categoryData, "categories");
        const restaurants = listFrom(restaurantData, "restaurants");
        catalogCache = { foods, categories, restaurants };
        const filter = byId("foodSearch").value.trim().toLowerCase();
        const visibleFoods = foods.filter((food) =>
            `${food.name} ${food.restaurant_name || ""}`.toLowerCase().includes(filter),
        );
        const foodsBody = byId("foodsBody");
        foodsBody.replaceChildren();
        visibleFoods.forEach((food) => {
            const row = document.createElement("tr");
            cell(row, food.name);
            cell(row, food.restaurant_name);
            cell(row, money(food.price));
            cell(row, food.is_available ? "Available" : "Unavailable");
            const actions = document.createElement("td");
            actions.append(button("Edit", async () => {
                const name = window.prompt("Food name:", food.name);
                if (name === null) return;
                const price = window.prompt("Price in KSh:", String(food.price));
                if (price === null) return;
                const amount = Number(price);
                if (!name.trim() || !Number.isFinite(amount) || amount < 0) {
                    showMessage("Enter a food name and a valid non-negative price.", true);
                    return;
                }
                try {
                    await request(`/foods/admin/${food.id}`, {
                        method: "PUT",
                        body: { name: name.trim(), price: amount },
                    });
                    await loadCatalog();
                    showMessage("Food item updated.");
                } catch (error) { showMessage(error.message, true); }
            }, true));
            actions.append(button(food.is_available ? "Mark unavailable" : "Make available", async () => {
                try {
                    await request(`/foods/admin/${food.id}/availability`, {
                        method: "PATCH",
                        body: { is_available: !food.is_available },
                    });
                    await loadCatalog();
                    showMessage("Food availability updated.");
                } catch (error) { showMessage(error.message, true); }
            }));
            actions.append(button("Delete", async () => {
                if (!window.confirm(`Delete food item “${food.name}”?`)) return;
                try {
                    await request(`/foods/admin/${food.id}`, { method: "DELETE" });
                    await loadCatalog();
                    showMessage("Food item deleted.");
                } catch (error) { showMessage(error.message, true); }
            }, true));
            row.append(actions);
            foodsBody.append(row);
        });
        if (!visibleFoods.length) foodsBody.innerHTML = '<tr><td colspan="5" class="operations-empty">No food items found.</td></tr>';

        const categoriesBody = byId("categoriesBody");
        categoriesBody.replaceChildren();
        categories.forEach((category) => {
            const row = document.createElement("tr");
            cell(row, category.name);
            cell(row, category.restaurant_name || `Restaurant ${category.restaurant_id}`);
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
                } catch (error) { showMessage(error.message, true); }
            }, true));
            actions.append(button("Delete", async () => {
                if (!window.confirm(`Delete category “${category.name}”?`)) return;
                try {
                    await request(`/categories/admin/${category.id}`, { method: "DELETE" });
                    await loadCatalog();
                    showMessage("Category deleted.");
                } catch (error) { showMessage(error.message, true); }
            }, true));
            row.append(actions);
            categoriesBody.append(row);
        });
        if (!categories.length) categoriesBody.innerHTML = '<tr><td colspan="4" class="operations-empty">No categories found.</td></tr>';

        const restaurantOptions = restaurants.map((restaurant) => {
            const option = document.createElement("option");
            option.value = restaurant.id;
            option.textContent = restaurant.name;
            return option;
        });
        [byId("foodRestaurant"), byId("categoryRestaurant")].forEach((select) => {
            const selected = select.value;
            select.replaceChildren(...restaurantOptions.map((option) => option.cloneNode(true)));
            if (selected) select.value = selected;
        });
        refreshFoodCategories();
    }

    function refreshFoodCategories() {
        const restaurantId = byId("foodRestaurant").value;
        const categorySelect = byId("foodCategory");
        const selectedCategory = categorySelect.value;
        const categories = catalogCache.categories.filter((category) => !restaurantId || String(category.restaurant_id) === String(restaurantId));
        categorySelect.replaceChildren(new Option("No category", ""), ...categories.map((category) => new Option(category.name, category.id)));
        if (categories.some((category) => String(category.id) === selectedCategory)) categorySelect.value = selectedCategory;
    }

    async function loadAdmins() {
        const data = await request(`/admins?page=${listPages.admins}&limit=25`);
        const admins = listFrom(data, "admins");
        listPagination.admins = data?.data?.pagination || data?.pagination || null;
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
                const isSelf = currentAdminId != null && String(admin.id) === String(currentAdminId);
                const deactivateButton = button(isSelf ? "Your account" : "Deactivate", async () => {
                    if (isSelf) return;
                    if (!window.confirm(`Deactivate ${admin.email}?`)) return;
                    try {
                        await request(`/admins/${admin.id}`, { method: "DELETE" });
                        await loadAdmins();
                        showMessage("Administrator deactivated.");
                    } catch (error) { showMessage(error.message, true); }
                }, true);
                deactivateButton.disabled = isSelf;
                if (isSelf) deactivateButton.title = "You cannot deactivate the currently signed-in account.";
                actions.append(deactivateButton);
            } else {
                actions.append(button("Activate", async () => {
                    try {
                        await request(`/admins/${admin.id}/activate`, { method: "PATCH" });
                        await loadAdmins();
                        showMessage("Administrator activated.");
                    } catch (error) { showMessage(error.message, true); }
                }));
            }
            row.append(actions);
            body.append(row);
        });
        if (!admins.length) body.innerHTML = '<tr><td colspan="5" class="operations-empty">No administrator accounts found.</td></tr>';
    }

    async function loadReviews() {
        const params = new URLSearchParams({ page: String(listPages.reviews), limit: "25", visibility: byId("reviewVisibility").value, search: byId("reviewSearch").value.trim() });
        const data = await request(`/admins/reviews?${params}`);
        const reviews = listFrom(data, "reviews");
        listPagination.reviews = data?.data?.pagination || data?.pagination || null;
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
            actions.append(button(review.is_visible ? "Hide" : "Restore", async () => {
                try {
                    await request(`/admins/reviews/${review.id}/visibility`, {
                        method: "PATCH",
                        body: { is_visible: !review.is_visible },
                    });
                    await loadReviews();
                    showMessage(review.is_visible ? "Review hidden from customers." : "Review restored.");
                } catch (error) { showMessage(error.message, true); }
            }, review.is_visible));
            row.append(actions);
            body.append(row);
        });
        if (!reviews.length) body.innerHTML = '<tr><td colspan="7" class="operations-empty">No reviews match this filter.</td></tr>';
    }

    async function loadAudit() {
        const data = await request(`/admins/audit-logs?page=${listPages.audit}&limit=25`);
        const logs = listFrom(data, "logs");
        listPagination.audit = data?.data?.pagination || data?.pagination || null;
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
            cell(row, `${statusCode >= 200 && statusCode < 400 ? "Success" : "Failed"} (${statusCode})`);
            body.append(row);
        });
        if (!logs.length) body.innerHTML = '<tr><td colspan="5" class="operations-empty">No recorded admin changes yet.</td></tr>';
    }

    byId("foodForm").addEventListener("submit", async (event) => {
        event.preventDefault();
        try {
            await request("/foods/admin", {
                method: "POST",
                body: {
                    restaurant_id: Number(byId("foodRestaurant").value),
                    category_id: byId("foodCategory").value ? Number(byId("foodCategory").value) : null,
                    name: byId("foodName").value.trim(),
                    price: Number(byId("foodPrice").value),
                    preparation_time: byId("foodPrep").value ? Number(byId("foodPrep").value) : null,
                },
            });
            event.currentTarget.reset();
            await loadCatalog();
            showMessage("Food item created.");
        } catch (error) { showMessage(error.message, true); }
    });

    byId("categoryForm").addEventListener("submit", async (event) => {
        event.preventDefault();
        try {
            await request("/categories/admin", {
                method: "POST",
                body: { restaurant_id: Number(byId("categoryRestaurant").value), name: byId("categoryName").value.trim() },
            });
            event.currentTarget.reset();
            await loadCatalog();
            showMessage("Category created.");
        } catch (error) { showMessage(error.message, true); }
    });

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
        } catch (error) { showMessage(error.message, true); }
    });

    document.querySelectorAll(".operations-tabs button").forEach((tab) => {
        tab.addEventListener("click", async () => {
            document.querySelectorAll(".operations-tabs button").forEach((button) => button.classList.toggle("active", button === tab));
            document.querySelectorAll(".operations-panel").forEach((panel) => { panel.hidden = panel.id !== `panel-${tab.dataset.panel}`; });
            try {
                if (tab.dataset.panel === "catalog") await loadCatalog();
                if (tab.dataset.panel === "admins") await loadAdmins();
                if (tab.dataset.panel === "reviews") await loadReviews();
                if (tab.dataset.panel === "audit") await loadAudit();
            } catch (error) { showMessage(error.message || "Could not load operations data.", true); }
        });
    });
    byId("foodSearch").addEventListener("input", () => {
        clearTimeout(foodSearchTimer);
        foodSearchTimer = setTimeout(() => loadCatalog().catch((error) => showMessage(error.message, true)), 250);
    });
    byId("foodRestaurant").addEventListener("change", refreshFoodCategories);
    byId("refreshCatalog").addEventListener("click", () => loadCatalog().catch((error) => showMessage(error.message, true)));
    byId("reviewVisibility").addEventListener("change", () => { listPages.reviews = 1; loadReviews().catch((error) => showMessage(error.message, true)); });
    byId("reviewSearch").addEventListener("input", () => { listPages.reviews = 1;
        clearTimeout(reviewSearchTimer);
        reviewSearchTimer = setTimeout(() => loadReviews().catch((error) => showMessage(error.message, true)), 300);
    });
    byId("refreshReviews").addEventListener("click", () => loadReviews().catch((error) => showMessage(error.message, true)));
    byId("refreshAudit").addEventListener("click", () => loadAudit().catch((error) => showMessage(error.message, true)));

    request("/admins/me").then((data) => { const admin = data?.data?.admin || data?.admin; currentAdminId = admin?.id ?? null; }).catch(() => {});
    loadCatalog().catch((error) => showMessage(error.message || "Could not load catalog data.", true));
});
