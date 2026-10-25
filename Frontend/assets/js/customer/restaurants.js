
/* =========================================================
   CUSTOMER RESTAURANTS PAGE
   - Loads real restaurants from the backend
   - Searches restaurant names and descriptions
   - Updates result count and empty/error states
   - Links each card to its actual restaurant ID
   - Keeps mobile navigation and cart count
   ========================================================= */

document.addEventListener("DOMContentLoaded", () => {
    "use strict";

    const API_BASE = (window.FOOD_DELIVERY_API_BASE || document.querySelector('meta[name="api-base-url"]')?.content?.trim() || "http://localhost:5000/api").replace(/\/+$/, "");
    const RESTAURANT_PLACEHOLDER =
        "../../assets/images/restaurants/restaurant-placeholder.jpg";

    const searchForm = document.getElementById("restaurantSearchForm");
    const searchInput = document.getElementById("restaurantSearch");
    const restaurantGrid = document.getElementById("restaurantGrid");
    const resultsCount = document.getElementById("restaurantResultsCount");
    const noResultsMessage = document.getElementById("noRestaurantsMessage");
    const cartCount = document.getElementById("cartCount");

    let restaurants = [];
    let loadingFailed = false;

    function escapeHTML(value) {
        return String(value ?? "").replace(/[&<>"']/g, (character) => ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#39;"
        })[character]);
    }

    function formatKES(value) {
        const amount = Number(value);

        if (!Number.isFinite(amount)) {
            return "Not available";
        }

        return `KSh ${amount.toLocaleString("en-KE", {
            maximumFractionDigits: 2
        })}`;
    }

    function getImageUrl(value) {
        const url = String(value ?? "").trim();

        if (!url) {
            return RESTAURANT_PLACEHOLDER;
        }

        if (
            url.startsWith("/") ||
            url.startsWith("./") ||
            url.startsWith("../")
        ) {
            return url;
        }

        try {
            const parsed = new URL(url, window.location.href);

            if (["http:", "https:"].includes(parsed.protocol)) {
                return parsed.href;
            }
        } catch (error) {
            // Use the fallback for an invalid URL.
        }

        return RESTAURANT_PLACEHOLDER;
    }

    function updateResultsCount(count) {
        if (!resultsCount) return;

        resultsCount.textContent = count === 1
            ? "1 restaurant available"
            : `${count} restaurants available`;
    }

    function showNoResults(show) {
        if (noResultsMessage) {
            noResultsMessage.hidden = !show;
        }
    }

    function showGridMessage(message, isError = false) {
        if (!restaurantGrid) return;

        restaurantGrid.innerHTML = `
            <p class="home-message${isError ? " home-message-error" : ""}">
                ${escapeHTML(message)}
            </p>
        `;

        showNoResults(false);
    }

    function getSearchText(restaurant) {
        return [
            restaurant.name,
            restaurant.description,
            restaurant.city,
            restaurant.address
        ].filter(Boolean).join(" ").toLowerCase();
    }

    function renderRestaurants() {
        if (!restaurantGrid) return;

        const term = (searchInput?.value || "").trim().toLowerCase();

        const filtered = restaurants.filter((restaurant) => {
            return getSearchText(restaurant).includes(term);
        });

        updateResultsCount(filtered.length);

        if (filtered.length === 0) {
            restaurantGrid.innerHTML = "";
            showNoResults(true);
            return;
        }

        showNoResults(false);

        restaurantGrid.innerHTML = filtered.map((restaurant) => {
            const name = restaurant.name || "Restaurant";
            const isOpen = restaurant.is_open === true;
            const rating = Number(restaurant.average_rating);
            const hasRating =
                restaurant.average_rating !== null &&
                restaurant.average_rating !== undefined &&
                Number.isFinite(rating);

            const ratingText = hasRating
                ? `★ ${rating.toFixed(1)}`
                : "No ratings";

            const deliveryFee = restaurant.delivery_fee;
            const deliveryText =
                deliveryFee !== null &&
                deliveryFee !== undefined &&
                Number.isFinite(Number(deliveryFee))
                    ? `${formatKES(deliveryFee)} delivery`
                    : "Delivery fee unavailable";

            const location = [restaurant.city, restaurant.address]
                .filter(Boolean)
                .join(" · ");

            const imageUrl = getImageUrl(
                restaurant.logo_url || restaurant.cover_image_url
            );

            const restaurantUrl =
                `restaurant.html?id=${encodeURIComponent(restaurant.id)}`;

            return `
                <article class="restaurant-card">
                    <div class="restaurant-image">
                        <img
                            src="${escapeHTML(imageUrl)}"
                            alt="${escapeHTML(name)}"
                            loading="lazy"
                            data-fallback="${RESTAURANT_PLACEHOLDER}"
                        >

                        <span class="restaurant-status">
                            ${isOpen ? "Open" : "Closed"}
                        </span>
                    </div>

                    <div class="restaurant-info">
                        <div class="restaurant-title-row">
                            <h3>${escapeHTML(name)}</h3>

                            <span class="rating">
                                ${escapeHTML(ratingText)}
                            </span>
                        </div>

                        <p class="restaurant-category">
                            ${escapeHTML(location || restaurant.description || "Restaurant")}
                        </p>

                        <div class="restaurant-meta">
                            <span>${escapeHTML(deliveryText)}</span>
                        </div>

                        <a
                            href="${escapeHTML(restaurantUrl)}"
                            class="view-restaurant-button"
                            ${isOpen ? "" : 'aria-label="' + escapeHTML(name) + ' is currently closed"'}
                        >
                            View Restaurant
                        </a>
                    </div>
                </article>
            `;
        }).join("");
    }

    
async function loadRestaurants() {
    if (!restaurantGrid) return;

    showGridMessage("Loading restaurants...");
    updateResultsCount(0);

    try {
        const response = await fetch(`${API_BASE}/restaurants`, {
            method: "GET",
            headers: {
                Accept: "application/json"
            }
        });

        const responseText = await response.text();

        let result;

        try {
            result = JSON.parse(responseText);
        } catch (error) {
            console.error(
                "Restaurants API returned non-JSON content:",
                responseText.slice(0, 500)
            );

            throw new Error(
                `Expected JSON but received an invalid response (HTTP ${response.status}).`
            );
        }

        // Diagnostic output: check the browser console.
        console.log("Restaurants API HTTP status:", response.status);
        console.log("Restaurants API response:", result);

        if (!response.ok || result.success === false) {
            throw new Error(
                result.message || `Request failed (${response.status}).`
            );
        }

        // Support the expected response and common alternative envelopes.
       
const restaurantData = result.data?.restaurants;

const restaurantList = Array.isArray(restaurantData)
    ? restaurantData
    : restaurantData?.restaurants;

if (!Array.isArray(restaurantList)) {
    console.error(
        "Could not locate a restaurant array. Actual response:",
        result
    );

    throw new Error(
        "The API response does not contain a valid restaurant list."
    );
}


        restaurants = restaurantList.filter((restaurant) => {
            return restaurant &&
                restaurant.is_active !== false &&
                restaurant.approval_status !== "pending" &&
                restaurant.approval_status !== "rejected";
        });

        loadingFailed = false;
        renderRestaurants();

    } catch (error) {
        loadingFailed = true;

        console.error("Failed to load customer restaurants:", error);

        updateResultsCount(0);

        showGridMessage(
            "We couldn't load restaurants. Check the browser console for details.",
            true
        );
    }
}


    if (searchForm) {
        searchForm.addEventListener("submit", (event) => {
            event.preventDefault();

            if (!loadingFailed) {
                renderRestaurants();
            }
        });
    }

    if (searchInput) {
        searchInput.addEventListener("input", () => {
            if (!loadingFailed) {
                renderRestaurants();
            }
        });
    }

    /* Mobile navigation */
    const mobileMenuButton =
        document.getElementById("mobileMenuButton");

    const mobileNavigation =
        document.getElementById("mobileNavigation");

    if (mobileMenuButton && mobileNavigation) {
        mobileMenuButton.setAttribute("aria-expanded", "false");

        mobileMenuButton.addEventListener("click", () => {
            const isOpen =
                mobileNavigation.classList.toggle("active");

            mobileMenuButton.setAttribute(
                "aria-expanded",
                String(isOpen)
            );
        });

        mobileNavigation.querySelectorAll("a").forEach((link) => {
            link.addEventListener("click", () => {
                mobileNavigation.classList.remove("active");
                mobileMenuButton.setAttribute("aria-expanded", "false");
            });
        });
    }

    /* Cart count from the existing local cart */
    function updateCartCount() {
        if (!cartCount) return;

        try {
            const savedCart = JSON.parse(
                localStorage.getItem("foodDeliveryCart") || "[]"
            );

            const total = Array.isArray(savedCart)
                ? savedCart.reduce(
                    (sum, item) => sum + Math.max(0, Number(item.quantity) || 0),
                    0
                )
                : 0;

            cartCount.textContent = String(total);
        } catch (error) {
            cartCount.textContent = "0";
        }
    }

    const initialSearch = new URLSearchParams(window.location.search).get("search");
    if (searchInput && initialSearch) searchInput.value = initialSearch;

    updateCartCount();
    loadRestaurants();
});
