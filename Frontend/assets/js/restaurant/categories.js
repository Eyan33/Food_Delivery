/* =========================================================
   RESTAURANT CATEGORIES
   FoodDelivery — Backend Connected
   ========================================================= */

document.addEventListener("DOMContentLoaded", () => {
    "use strict";

    const API_BASE = (window.FOOD_DELIVERY_API_BASE || document.querySelector('meta[name="api-base-url"]')?.content?.trim() || "http://localhost:5000/api").replace(/\/+$/, "");

    const $ = (id) => document.getElementById(id);

    const categoryModal = $("categoryModal");
    const deleteCategoryModal = $("deleteCategoryModal");
    const categoryForm = $("categoryForm");
    const categoryModalTitle = $("categoryModalTitle");
    const categoryName = $("categoryName");
    const categoryDescription = $("categoryDescription");
    const categoryStatus = $("categoryStatus");

    const addCategoryButton = $("addCategoryButton");
    const closeCategoryModal = $("closeCategoryModal");
    const cancelCategoryButton = $("cancelCategoryButton");
    const cancelDeleteCategory = $("cancelDeleteCategory");
    const confirmDeleteCategory = $("confirmDeleteCategory");
    const deleteCategoryName = $("deleteCategoryName");

    const categorySearch = $("categorySearch");
    const categoryStatusFilter = $("categoryStatusFilter");
    const categoryMessage = $("categoryMessage");
    const categoryTableBody = document.querySelector(".categories-table tbody");

    let categories = [];
    let foods = [];
    let editingCategoryId = null;
    let deletingCategoryId = null;
    let saving = false;

    /*
    |--------------------------------------------------------------------------
    | API REQUEST
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
    | LOAD CATEGORIES AND MENU ITEMS
    |--------------------------------------------------------------------------
    */

    async function loadCategories() {
        if (!categoryTableBody) return;

        categoryTableBody.innerHTML = `
            <tr>
                <td colspan="6">Loading your categories...</td>
            </tr>
        `;

        try {
            const [categoryResult, foodResult] = await Promise.all([
                apiRequest("/categories/owner/me"),
                apiRequest("/foods/restaurant/my").catch((error) => {
                    console.warn("Could not load food counts:", error);
                    return null;
                })
            ]);

            categories = Array.isArray(categoryResult.data?.categories)
                ? categoryResult.data.categories
                : [];

            foods = Array.isArray(foodResult?.data?.foods)
                ? foodResult.data.foods
                : [];

            renderCategories();
            updateSummary();
            filterCategories();
        } catch (error) {
            console.error("Loading categories failed:", error);

            categoryTableBody.innerHTML = `
                <tr>
                    <td colspan="6">
                        ${escapeHtml(error.message)}
                    </td>
                </tr>
            `;

            showMessage(error.message, "error");
        }
    }

    /*
    |--------------------------------------------------------------------------
    | RENDER CATEGORY TABLE
    |--------------------------------------------------------------------------
    */

    function renderCategories() {
        if (!categoryTableBody) return;

        categoryTableBody.innerHTML = "";

        if (categories.length === 0) {
            categoryTableBody.innerHTML = `
                <tr>
                    <td colspan="6">
                        No categories yet. Select "Add Category" to create one.
                    </td>
                </tr>
            `;
            updateCategoryCount();
            return;
        }

        categories.forEach((category) => {
            const row = document.createElement("tr");
            const foodCount = getFoodCount(category.id);
            const createdDate = formatDate(category.created_at);

            row.dataset.categoryId = String(category.id);

            row.innerHTML = `
                <td>
                    <div class="category-name">
                        <div class="category-icon">
                            ${escapeHtml(getInitials(category.name))}
                        </div>

                        <div>
                            <strong>${escapeHtml(category.name)}</strong>
                            <span>CAT-${String(category.id).padStart(3, "0")}</span>
                        </div>
                    </div>
                </td>

                <td>
                    ${escapeHtml(category.description || "No description added.")}
                </td>

                <td>
                    <strong>${foodCount}</strong>
                </td>

                <td>
                    <span class="category-status inactive"
                          title="Category activation is not currently supported by the backend">
                        Not configured
                    </span>
                </td>

                <td>${escapeHtml(createdDate)}</td>

                <td>
                    <div class="category-actions">
                        <button
                            type="button"
                            class="category-action-button edit"
                            data-action="edit"
                            data-id="${category.id}"
                            title="Edit category"
                            aria-label="Edit ${escapeHtml(category.name)}">
                            ✎
                        </button>

                        <button
                            type="button"
                            class="category-action-button delete"
                            data-action="delete"
                            data-id="${category.id}"
                            title="Delete category"
                            aria-label="Delete ${escapeHtml(category.name)}">
                            ×
                        </button>
                    </div>
                </td>
            `;

            categoryTableBody.appendChild(row);
        });

        updateCategoryCount();
    }

    /*
    |--------------------------------------------------------------------------
    | CATEGORY COUNTS AND SUMMARY
    |--------------------------------------------------------------------------
    */

    function getFoodCount(categoryId) {
        return foods.filter(
            (food) => String(food.category_id) === String(categoryId)
        ).length;
    }

    function updateSummary() {
        const summaryCards = document.querySelectorAll(".category-summary-card");

        const totalCategories = categories.length;
        const totalFoods = foods.length;
        const emptyCategories = categories.filter(
            (category) => getFoodCount(category.id) === 0
        ).length;

        if (summaryCards[0]) {
            const value = summaryCards[0].querySelector("strong");
            if (value) value.textContent = totalCategories;
        }

        if (summaryCards[1]) {
            const value = summaryCards[1].querySelector("strong");
            if (value) value.textContent = totalFoods;
        }

        // The current backend does not store category active/inactive status.
        if (summaryCards[2]) {
            const value = summaryCards[2].querySelector("strong");
            if (value) {
                value.textContent = "—";
                value.title = "Category activation is not currently supported";
            }
        }

        if (summaryCards[3]) {
            const value = summaryCards[3].querySelector("strong");
            if (value) value.textContent = emptyCategories;
        }

        updateCategoryCount();
    }

    function updateCategoryCount() {
        const countElement = document.querySelector(".category-count");

        if (countElement) {
            countElement.textContent =
                `${categories.length} ${
                    categories.length === 1 ? "Category" : "Categories"
                }`;
        }
    }

    /*
    |--------------------------------------------------------------------------
    | ADD CATEGORY
    |--------------------------------------------------------------------------
    */

    function openAddModal() {
        editingCategoryId = null;

        categoryForm?.reset();

        if (categoryModalTitle) {
            categoryModalTitle.textContent = "Add Category";
        }

        const saveButton = categoryForm?.querySelector(
            'button[type="submit"]'
        );

        if (saveButton) saveButton.textContent = "Save Category";

        openModal(categoryModal);
        categoryName?.focus();
    }

    /*
    |--------------------------------------------------------------------------
    | EDIT CATEGORY
    |--------------------------------------------------------------------------
    */

    function openEditModal(category) {
        editingCategoryId = String(category.id);

        if (categoryModalTitle) {
            categoryModalTitle.textContent = "Edit Category";
        }

        if (categoryName) categoryName.value = category.name || "";

        if (categoryDescription) {
            categoryDescription.value = category.description || "";
        }

        const saveButton = categoryForm?.querySelector(
            'button[type="submit"]'
        );

        if (saveButton) saveButton.textContent = "Update Category";

        openModal(categoryModal);
        categoryName?.focus();
    }

    /*
    |--------------------------------------------------------------------------
    | SAVE CATEGORY
    |--------------------------------------------------------------------------
    */

    categoryForm?.addEventListener("submit", async (event) => {
        event.preventDefault();

        if (saving) return;

        const name = categoryName?.value.trim() || "";
        const description = categoryDescription?.value.trim() || "";

        if (name.length < 2) {
            showMessage(
                "Category name must contain at least 2 characters.",
                "error"
            );
            categoryName?.focus();
            return;
        }

        if (name.length > 100) {
            showMessage(
                "Category name must be 100 characters or fewer.",
                "error"
            );
            return;
        }

        const payload = {
            name,
            description: description || null
        };

        saving = true;

        const saveButton = categoryForm.querySelector(
            'button[type="submit"]'
        );

        const originalButtonText = saveButton?.textContent || "Save Category";

        if (saveButton) {
            saveButton.disabled = true;
            saveButton.textContent = "Saving...";
        }

        try {
            if (editingCategoryId) {
                await apiRequest(
                    `/categories/${encodeURIComponent(editingCategoryId)}`,
                    {
                        method: "PUT",
                        body: JSON.stringify(payload)
                    }
                );

                showMessage("Category updated successfully.", "success");
            } else {
                await apiRequest("/categories", {
                    method: "POST",
                    body: JSON.stringify(payload)
                });

                showMessage("Category created successfully.", "success");
            }

            closeModal(categoryModal);
            await loadCategories();
        } catch (error) {
            console.error("Saving category failed:", error);
            showMessage(error.message, "error");
        } finally {
            saving = false;

            if (saveButton) {
                saveButton.disabled = false;
                saveButton.textContent = originalButtonText;
            }
        }
    });

    /*
    |--------------------------------------------------------------------------
    | DELETE CATEGORY
    |--------------------------------------------------------------------------
    */

    function openDeleteModal(category) {
        deletingCategoryId = String(category.id);

        if (deleteCategoryName) {
            deleteCategoryName.textContent = category.name;
        }

        const deleteButton = $("confirmDeleteCategory");
        if (deleteButton) {
            deleteButton.disabled = false;
            deleteButton.textContent = "Delete Category";
        }

        openModal(deleteCategoryModal);
    }

    async function deleteCategory() {
        if (!deletingCategoryId) return;

        const deleteButton = $("confirmDeleteCategory");

        if (deleteButton) {
            deleteButton.disabled = true;
            deleteButton.textContent = "Deleting...";
        }

        try {
            await apiRequest(
                `/categories/${encodeURIComponent(deletingCategoryId)}`,
                { method: "DELETE" }
            );

            closeModal(deleteCategoryModal);
            deletingCategoryId = null;

            showMessage("Category deleted successfully.", "success");
            await loadCategories();
        } catch (error) {
            console.error("Deleting category failed:", error);

            showMessage(error.message, "error");

            if (deleteButton) {
                deleteButton.disabled = false;
                deleteButton.textContent = "Delete Category";
            }
        }
    }

    /*
    |--------------------------------------------------------------------------
    | TABLE ACTIONS
    |--------------------------------------------------------------------------
    */

    categoryTableBody?.addEventListener("click", (event) => {
        const button = event.target.closest("[data-action]");
        if (!button) return;

        const category = categories.find(
            (item) => String(item.id) === String(button.dataset.id)
        );

        if (!category) {
            showMessage("Category could not be found.", "error");
            return;
        }

        if (button.dataset.action === "edit") {
            openEditModal(category);
        }

        if (button.dataset.action === "delete") {
            openDeleteModal(category);
        }
    });

    /*
    |--------------------------------------------------------------------------
    | SEARCH AND STATUS FILTER
    |--------------------------------------------------------------------------
    */

    function filterCategories() {
        if (!categoryTableBody) return;

        const searchValue = (categorySearch?.value || "")
            .trim()
            .toLowerCase();

        const statusValue = categoryStatusFilter?.value || "all";

        categoryTableBody.querySelectorAll("tr[data-category-id]").forEach((row) => {
            const category = categories.find(
                (item) => String(item.id) === row.dataset.categoryId
            );

            if (!category) return;

            const searchText =
                `${category.name || ""} ${category.description || ""}`
                    .toLowerCase();

            const matchesSearch = searchText.includes(searchValue);

            /*
             * Category active/inactive status does not exist in the current API.
             * Do not incorrectly label database records as active or inactive.
             */
            const matchesStatus = statusValue === "all";

            row.style.display =
                matchesSearch && matchesStatus ? "" : "none";
        });
    }

    categorySearch?.addEventListener("input", filterCategories);

    categoryStatusFilter?.addEventListener("change", filterCategories);

    /*
    |--------------------------------------------------------------------------
    | MODALS
    |--------------------------------------------------------------------------
    */

    function openModal(modal) {
        if (!modal) return;

        modal.classList.add("show");
        document.body.classList.add("modal-open");
    }

    function closeModal(modal) {
        if (!modal) return;

        modal.classList.remove("show");

        const anotherModalOpen =
            categoryModal?.classList.contains("show") ||
            deleteCategoryModal?.classList.contains("show");

        if (!anotherModalOpen) {
            document.body.classList.remove("modal-open");
        }
    }

    addCategoryButton?.addEventListener("click", openAddModal);

    closeCategoryModal?.addEventListener("click", () => {
        closeModal(categoryModal);
    });

    cancelCategoryButton?.addEventListener("click", () => {
        closeModal(categoryModal);
    });

    cancelDeleteCategory?.addEventListener("click", () => {
        deletingCategoryId = null;
        closeModal(deleteCategoryModal);
    });

    confirmDeleteCategory?.addEventListener("click", deleteCategory);

    categoryModal?.addEventListener("click", (event) => {
        if (event.target === categoryModal) {
            closeModal(categoryModal);
        }
    });

    deleteCategoryModal?.addEventListener("click", (event) => {
        if (event.target === deleteCategoryModal) {
            deletingCategoryId = null;
            closeModal(deleteCategoryModal);
        }
    });

    document.addEventListener("keydown", (event) => {
        if (event.key !== "Escape") return;

        closeModal(categoryModal);
        closeModal(deleteCategoryModal);
        deletingCategoryId = null;
    });

    /*
    |--------------------------------------------------------------------------
    | UTILITIES
    |--------------------------------------------------------------------------
    */

    function getInitials(name) {
        return String(name || "")
            .trim()
            .split(/\s+/)
            .slice(0, 2)
            .map((word) => word.charAt(0).toUpperCase())
            .join("") || "CA";
    }

    function formatDate(value) {
        if (!value) return "—";

        const date = new Date(value);

        if (Number.isNaN(date.getTime())) return "—";

        return date.toLocaleDateString("en-KE", {
            year: "numeric",
            month: "short",
            day: "2-digit"
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

    function showMessage(message, type = "info") {
        if (!categoryMessage) {
            console.info(message);
            return;
        }

        categoryMessage.textContent = message;
        categoryMessage.className = `category-message ${type}`;
        categoryMessage.hidden = false;

        clearTimeout(showMessage.timeout);

        showMessage.timeout = setTimeout(() => {
            categoryMessage.hidden = true;
        }, 4500);
    }

    /*
    |--------------------------------------------------------------------------
    | MOBILE SIDEBAR
    |--------------------------------------------------------------------------
    */

    $("restaurantMenuButton")?.addEventListener("click", () => {
        $("restaurantSidebar")?.classList.toggle("active");
    });

    /*
    |--------------------------------------------------------------------------
    | START
    |--------------------------------------------------------------------------
    */

    loadCategories();
});