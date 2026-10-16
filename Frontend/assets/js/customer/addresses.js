
/* =========================================================
   CUSTOMER ADDRESSES PAGE
   FoodDelivery — API connected
========================================================= */

document.addEventListener("DOMContentLoaded", () => {
    "use strict";

    const API_BASE_URL = (window.FOOD_DELIVERY_API_BASE || document.querySelector('meta[name="api-base-url"]')?.content?.trim() || "http://localhost:5000/api").replace(/\/+$/, "");
    const TOKEN_KEY = "foodDeliveryAccessToken";

    const mobileMenuButton = document.getElementById("mobileMenuButton");
    const mobileNavigation = document.getElementById("mobileNavigation");

    const addressModal = document.getElementById("addressModal");
    const addressModalOverlay = document.getElementById("addressModalOverlay");
    const addAddressButton = document.getElementById("addAddressButton");
    const emptyAddAddressButton = document.getElementById("emptyAddAddressButton");
    const closeAddressModal = document.getElementById("closeAddressModal");
    const cancelAddressButton = document.getElementById("cancelAddressButton");

    const addressForm = document.getElementById("addressForm");
    const addressModalTitle = document.getElementById("addressModalTitle");
    const addressList = document.getElementById("addressList");
    const addressCount = document.getElementById("addressCount");
    const emptyAddresses = document.getElementById("emptyAddresses");

    const addressMessage = document.getElementById("addressMessage");
    const addressFormMessage = document.getElementById("addressFormMessage");

    const addressType = document.getElementById("addressType");
    const addressFullName = document.getElementById("addressFullName");
    const addressPhone = document.getElementById("addressPhone");
    const addressLine = document.getElementById("addressLine");
    const addressCity = document.getElementById("addressCity");
    const addressInstructions = document.getElementById("addressInstructions");
    const setDefaultAddressCheckbox = document.getElementById("setDefaultAddress");

    let addresses = [];
    let editingAddressId = null;
    let isSaving = false;

    /* =====================================================
       API
    ===================================================== */

    function getToken() {
        return localStorage.getItem(TOKEN_KEY)
            || sessionStorage.getItem(TOKEN_KEY);
    }

    async function apiRequest(path, options = {}) {
        const token = getToken();

        if (!token) {
            throw new Error("Please log in to manage your delivery addresses.");
        }

        const headers = {
            Accept: "application/json",
            Authorization: `Bearer ${token}`
        };

        const requestOptions = {
            method: options.method || "GET",
            headers
        };

        if (options.body !== undefined) {
            headers["Content-Type"] = "application/json";
            requestOptions.body = JSON.stringify(options.body);
        }

        let response;

        try {
            response = await fetch(`${API_BASE_URL}${path}`, requestOptions);
        } catch {
            throw new Error(
                "Cannot connect to the server. Make sure your backend is running."
            );
        }

        const result = await response.json().catch(() => ({}));

        if (!response.ok) {
            if (response.status === 401) {
                throw new Error("Your session has expired. Please log in again.");
            }

            if (response.status === 403) {
                throw new Error("You are not authorized to manage these addresses.");
            }

            throw new Error(
                result.message || result.error || `Request failed (${response.status}).`
            );
        }

        return result;
    }

    /* =====================================================
       HELPERS
    ===================================================== */

    function escapeHTML(value) {
        return String(value ?? "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    function normalizeAddress(address) {
        return {
            id: String(address.id),
            type: address.label || "Other",
            fullName: address.recipient_name || "",
            phone: address.phone || "",
            address: address.address_line || "",
            city: address.city || "",
            instructions: address.delivery_instructions || "",
            isDefault: address.is_default === true
                || address.is_default === "true",
            latitude: address.latitude ?? null,
            longitude: address.longitude ?? null
        };
    }

    function showMessage(message, type = "success") {
        if (!addressMessage) return;

        addressMessage.textContent = message;
        addressMessage.classList.remove("success", "error", "show");
        addressMessage.classList.add(type, "show");

        if (addressMessage.messageTimeout) {
            clearTimeout(addressMessage.messageTimeout);
        }

        addressMessage.messageTimeout = setTimeout(() => {
            addressMessage.classList.remove("show");
        }, 4500);
    }

    function showFormMessage(message, type = "error") {
        if (!addressFormMessage) return;

        addressFormMessage.textContent = message;
        addressFormMessage.classList.remove("success", "error", "show");
        addressFormMessage.classList.add(type, "show");
    }

    function clearFormMessage() {
        if (!addressFormMessage) return;

        addressFormMessage.textContent = "";
        addressFormMessage.classList.remove("success", "error", "show");
    }

    function getAddressById(id) {
        return addresses.find(address => String(address.id) === String(id));
    }

    function getAddressIcon(type) {
        if (type === "Home") return "🏠";
        if (type === "Work") return "💼";
        return "📍";
    }

    /* =====================================================
       MOBILE NAVIGATION
    ===================================================== */

    if (mobileMenuButton && mobileNavigation) {
        mobileMenuButton.addEventListener("click", () => {
            mobileNavigation.classList.toggle("open");

            mobileMenuButton.setAttribute(
                "aria-expanded",
                mobileNavigation.classList.contains("open") ? "true" : "false"
            );
        });

        mobileNavigation.querySelectorAll("a").forEach(link => {
            link.addEventListener("click", () => {
                mobileNavigation.classList.remove("open");
                mobileMenuButton.setAttribute("aria-expanded", "false");
            });
        });
    }

    /* =====================================================
       RENDER ADDRESS LIST
    ===================================================== */

    function updateAddressCount() {
        if (!addressCount) return;

        const count = addresses.length;

        addressCount.textContent =
            `${count} ${count === 1 ? "Address" : "Addresses"}`;
    }

    function updateEmptyState() {
        const hasAddresses = addresses.length > 0;

        if (emptyAddresses) {
            emptyAddresses.hidden = hasAddresses;
        }

        if (addressList) {
            addressList.hidden = !hasAddresses;
        }

        updateAddressCount();
    }

    function createAddressElement(address) {
        const article = document.createElement("article");

        article.className = "address-item";
        article.dataset.addressId = address.id;

        if (address.isDefault) {
            article.classList.add("default-address");
        }

        const badge = address.isDefault
            ? '<span class="default-badge">Default</span>'
            : "";

        const defaultButtonText = address.isDefault
            ? "✓ Default Address"
            : "Set as Default";

        const disabled = address.isDefault ? "disabled" : "";

        article.innerHTML = `
            <div class="address-item-top">
                <div class="address-type">
                    <div class="address-icon">
                        ${getAddressIcon(address.type)}
                    </div>

                    <div>
                        <h3>${escapeHTML(address.type)}</h3>
                        ${badge}
                    </div>
                </div>

                <div class="address-actions">
                    <button
                        type="button"
                        class="address-action-button edit-address-button"
                        data-address-id="${escapeHTML(address.id)}">
                        Edit
                    </button>

                    <button
                        type="button"
                        class="address-action-button delete-address-button"
                        data-address-id="${escapeHTML(address.id)}">
                        Delete
                    </button>
                </div>
            </div>

            <div class="address-details">
                <strong>${escapeHTML(address.fullName)}</strong>
                <p>${escapeHTML(address.address)}</p>
                <p>${escapeHTML(address.city)}</p>
                <span>Phone: ${escapeHTML(address.phone)}</span>
                ${
                    address.instructions
                        ? `<p>Instructions: ${escapeHTML(address.instructions)}</p>`
                        : ""
                }
            </div>

            <div class="address-item-footer">
                <button
                    type="button"
                    class="set-default-button"
                    data-address-id="${escapeHTML(address.id)}"
                    ${disabled}>
                    ${defaultButtonText}
                </button>
            </div>
        `;

        return article;
    }

    function renderAddresses() {
        if (!addressList) return;

        addressList.replaceChildren();

        addresses.forEach(address => {
            addressList.appendChild(createAddressElement(address));
        });

        updateEmptyState();
    }

    /* =====================================================
       LOAD ADDRESSES FROM BACKEND
    ===================================================== */

    async function loadAddresses() {
        if (addressList) {
            addressList.innerHTML = `
                <p class="address-loading">Loading your saved addresses...</p>
            `;
            addressList.hidden = false;
        }

        if (emptyAddresses) {
            emptyAddresses.hidden = true;
        }

        try {
            const result = await apiRequest("/addresses");

            const data = result.data || result;
            const rows = data.addresses;

            if (!Array.isArray(rows)) {
                throw new Error("The server returned an invalid address list.");
            }

            addresses = rows.map(normalizeAddress);
            renderAddresses();
        } catch (error) {
            addresses = [];
            renderAddresses();

            showMessage(error.message, "error");
        }
    }

    /* =====================================================
       OPEN / CLOSE MODAL
    ===================================================== */

    function resetForm() {
        if (addressForm) {
            addressForm.reset();
        }

        if (addressType) {
            addressType.value = "Home";
        }

        if (setDefaultAddressCheckbox) {
            setDefaultAddressCheckbox.checked = false;
        }
    }

    function openAddressModal(mode = "add", address = null) {
        if (!addressModal) return;

        clearFormMessage();
        resetForm();

        editingAddressId = mode === "edit" && address
            ? String(address.id)
            : null;

        if (addressModalTitle) {
            addressModalTitle.textContent = editingAddressId
                ? "Edit Address"
                : "Add New Address";
        }

        if (editingAddressId && address) {
            addressType.value = address.type;
            addressFullName.value = address.fullName;
            addressPhone.value = address.phone;
            addressLine.value = address.address;
            addressCity.value = address.city;
            addressInstructions.value = address.instructions || "";

            if (setDefaultAddressCheckbox) {
                setDefaultAddressCheckbox.checked = address.isDefault;
            }
        }

        addressModal.hidden = false;
        document.body.classList.add("modal-open");

        setTimeout(() => addressFullName?.focus(), 50);
    }

    function closeModal() {
        if (!addressModal) return;

        addressModal.hidden = true;
        document.body.classList.remove("modal-open");

        editingAddressId = null;
        isSaving = false;
        resetForm();
        clearFormMessage();
    }

    addAddressButton?.addEventListener("click", () => {
        openAddressModal("add");
    });

    emptyAddAddressButton?.addEventListener("click", () => {
        openAddressModal("add");
    });

    closeAddressModal?.addEventListener("click", closeModal);
    cancelAddressButton?.addEventListener("click", closeModal);
    addressModalOverlay?.addEventListener("click", closeModal);

    document.addEventListener("keydown", event => {
        if (event.key === "Escape" && addressModal && !addressModal.hidden) {
            closeModal();
        }
    });

    /* =====================================================
       FORM VALIDATION
    ===================================================== */

    function validateForm() {
        const fullName = addressFullName?.value.trim() || "";
        const phone = addressPhone?.value.trim() || "";
        const line = addressLine?.value.trim() || "";
        const city = addressCity?.value.trim() || "";

        if (!addressType?.value) {
            showFormMessage("Please select an address type.");
            addressType?.focus();
            return false;
        }

        if (!fullName) {
            showFormMessage("Please enter the recipient's full name.");
            addressFullName?.focus();
            return false;
        }

        if (!phone || !/^[0-9+\s()-]{7,20}$/.test(phone)) {
            showFormMessage("Please enter a valid phone number.");
            addressPhone?.focus();
            return false;
        }

        if (!line) {
            showFormMessage("Please enter your delivery address.");
            addressLine?.focus();
            return false;
        }

        if (!city) {
            showFormMessage("Please enter your city or area.");
            addressCity?.focus();
            return false;
        }

        return true;
    }

    function setSaveButtonLoading(loading) {
        const button = addressForm?.querySelector('button[type="submit"]');

        if (!button) return;

        if (loading) {
            button.dataset.originalText = button.dataset.originalText
                || button.textContent.trim();

            button.disabled = true;
            button.textContent = "Saving...";
        } else {
            button.disabled = false;
            button.textContent = button.dataset.originalText || "Save Address";
        }
    }

    /* =====================================================
       CREATE / UPDATE ADDRESS
    ===================================================== */

    if (addressForm) {
        addressForm.addEventListener("submit", async event => {
            event.preventDefault();

            if (isSaving) return;

            clearFormMessage();

            if (!validateForm()) return;

            const isDefault = Boolean(setDefaultAddressCheckbox?.checked);

            const payload = {
                label: addressType.value,
                recipient_name: addressFullName.value.trim(),
                phone: addressPhone.value.trim(),
                address_line: addressLine.value.trim(),
                city: addressCity.value.trim(),
                delivery_instructions: addressInstructions?.value.trim() || "",
                is_default: isDefault
            };

            isSaving = true;
            setSaveButtonLoading(true);

            try {
                let result;

                if (editingAddressId) {
                    result = await apiRequest(
                        `/addresses/${encodeURIComponent(editingAddressId)}`,
                        {
                            method: "PUT",
                            body: payload
                        }
                    );
                } else {
                    result = await apiRequest("/addresses", {
                        method: "POST",
                        body: payload
                    });
                }

                const data = result.data || result;
                const savedAddress = data.address;

                if (!savedAddress) {
                    throw new Error(
                        "The server did not return the saved address."
                    );
                }

                closeModal();
                await loadAddresses();

                showMessage(
                    result.message || (
                        editingAddressId
                            ? "Address updated successfully."
                            : "Address added successfully."
                    ),
                    "success"
                );
            } catch (error) {
                showFormMessage(error.message, "error");
            } finally {
                isSaving = false;
                setSaveButtonLoading(false);
            }
        });
    }

    /* =====================================================
       SET DEFAULT ADDRESS
    ===================================================== */

    async function makeDefaultAddress(addressId) {
        const address = getAddressById(addressId);

        if (!address || address.isDefault) return;

        try {
            const result = await apiRequest(
                `/addresses/${encodeURIComponent(addressId)}/default`,
                { method: "PATCH" }
            );

            await loadAddresses();

            showMessage(
                result.message || "Default delivery address updated.",
                "success"
            );
        } catch (error) {
            showMessage(error.message, "error");
        }
    }

    /* =====================================================
       DELETE ADDRESS
    ===================================================== */

    async function deleteAddress(addressId) {
        const address = getAddressById(addressId);

        if (!address) return;

        const confirmed = window.confirm(
            `Delete your "${address.type}" delivery address?`
        );

        if (!confirmed) return;

        try {
            const result = await apiRequest(
                `/addresses/${encodeURIComponent(addressId)}`,
                { method: "DELETE" }
            );

            await loadAddresses();

            showMessage(
                result.message || "Address deleted successfully.",
                "success"
            );
        } catch (error) {
            showMessage(error.message, "error");
        }
    }

    /* =====================================================
       ADDRESS ACTIONS
    ===================================================== */

    if (addressList) {
        addressList.addEventListener("click", event => {
            const editButton = event.target.closest(".edit-address-button");
            const deleteButton = event.target.closest(".delete-address-button");
            const defaultButton = event.target.closest(".set-default-button");

            if (editButton) {
                const address = getAddressById(editButton.dataset.addressId);

                if (address) {
                    openAddressModal("edit", address);
                }

                return;
            }

            if (deleteButton) {
                deleteAddress(deleteButton.dataset.addressId);
                return;
            }

            if (defaultButton) {
                makeDefaultAddress(defaultButton.dataset.addressId);
            }
        });
    }

    /* =====================================================
       INITIALIZE
    ===================================================== */

    loadAddresses();
});
