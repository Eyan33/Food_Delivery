
document.addEventListener("DOMContentLoaded", () => {
    "use strict";

    // =========================================================
    // CONFIGURATION
    // =========================================================

    const API_BASE = (window.FOOD_DELIVERY_API_BASE || document.querySelector('meta[name="api-base-url"]')?.content?.trim() || "http://localhost:5000/api").replace(/\/+$/, "");
    const TOKEN_KEY = "foodDeliveryAccessToken";

    const elements = {
        search: document.querySelector(
            '.rider-delivery-search input[type="search"]'
        ),
        filters: document.querySelectorAll(
            ".rider-delivery-filters .rider-filter-select"
        ),
        activeDelivery: document.querySelector(".rider-active-delivery"),
        historyContainer: document.querySelector(
            ".rider-deliveries-container"
        ),
        emptyState: document.querySelector(".rider-empty-deliveries"),
        message: document.querySelector(".rider-message"),
        sidebar: document.getElementById("riderSidebar"),
        menuButton: document.getElementById("riderMenuButton"),
        notificationButton: document.querySelector(
            ".rider-notification-button"
        ),
        summaryCards: document.querySelectorAll(".rider-summary-card"),
        profileNames: document.querySelectorAll(
            ".rider-profile-info strong, .rider-topbar-profile-info strong"
        ),
        profileAvatars: document.querySelectorAll(
            ".rider-profile-avatar, .rider-topbar-avatar"
        ),
        statusButton: document.querySelector(".rider-status-button")
    };

    let rider = null;
    let deliveries = [];
    let loading = false;
    let messageTimer = null;
    let currentFilter = "all";
    let currentDateFilter = "all";
    let trackingWatchId = null;
    let latestGpsPosition = null;
    let lastLocationSentAt = 0;
    let locationUpdatePromise = null;
    const trackingMaps = new Map();

    // =========================================================
    // API
    // =========================================================

    function getToken() {
        return (
            localStorage.getItem(TOKEN_KEY) ||
            sessionStorage.getItem(TOKEN_KEY) ||
            ""
        );
    }

    async function apiRequest(path, options = {}) {
        const token = getToken();

        if (!token) {
            throw new Error(
                "Your session is unavailable. Please sign in again."
            );
        }

        const headers = {
            Accept: "application/json",
            Authorization: `Bearer ${token}`,
            ...(options.body
                ? { "Content-Type": "application/json" }
                : {}),
            ...(options.headers || {})
        };

        const response = await fetch(`${API_BASE}${path}`, {
            ...options,
            headers
        });

        const result = await response.json().catch(() => ({}));

        if (response.status === 401 || response.status === 403) {
            throw new Error(
                result.message ||
                "Your session is invalid or has expired. Please sign in again."
            );
        }

        if (!response.ok || result.success === false) {
            throw new Error(
                result.message ||
                `Request failed with status ${response.status}.`
            );
        }

        return result;
    }

    function getData(result, key) {
        if (Array.isArray(result?.data?.[key])) {
            return result.data[key];
        }

        if (Array.isArray(result?.[key])) {
            return result[key];
        }

        if (Array.isArray(result?.data)) {
            return result.data;
        }

        return [];
    }

    // =========================================================
    // UTILITIES
    // =========================================================

    function escapeHTML(value) {
        return String(value ?? "").replace(/[&<>"']/g, character => ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#39;"
        })[character]);
    }

    function money(value) {
        const amount = Number(value);

        if (!Number.isFinite(amount)) {
            return "KSh 0";
        }

        return `KSh ${amount.toLocaleString("en-KE", {
            minimumFractionDigits: 0,
            maximumFractionDigits: 2
        })}`;
    }

    function getOrderNumber(order) {
        return order.order_number || `#${order.id}`;
    }

    function getStatus(order) {
        return String(order.status || "unknown").toLowerCase();
    }

    function isActive(order) {
        return ["ready", "out_for_delivery"].includes(getStatus(order));
    }

    function isCompleted(order) {
        return getStatus(order) === "delivered";
    }

    function isCancelled(order) {
        return getStatus(order) === "cancelled";
    }

    function getOrderDate(order) {
        const value =
            order.delivered_at ||
            order.out_for_delivery_at ||
            order.ready_at ||
            order.placed_at ||
            order.created_at;

        if (!value) {
            return null;
        }

        const date = new Date(value);

        return Number.isNaN(date.getTime()) ? null : date;
    }

    function formatDate(value) {
        if (!value) {
            return "Not available";
        }

        const date = new Date(value);

        if (Number.isNaN(date.getTime())) {
            return "Not available";
        }

        return date.toLocaleString("en-KE", {
            dateStyle: "medium",
            timeStyle: "short"
        });
    }

    function formatTime(value) {
        if (!value) {
            return "Not available";
        }

        const date = new Date(value);

        if (Number.isNaN(date.getTime())) {
            return "Not available";
        }

        return date.toLocaleTimeString("en-KE", {
            hour: "2-digit",
            minute: "2-digit"
        });
    }

    function nairobiDateKey(value) {
        const date = value instanceof Date ? value : new Date(value);
        if (Number.isNaN(date.getTime())) return null;

        const parts = new Intl.DateTimeFormat("en-CA", {
            timeZone: "Africa/Nairobi",
            year: "numeric",
            month: "2-digit",
            day: "2-digit"
        }).formatToParts(date);

        const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
        return `${values.year}-${values.month}-${values.day}`;
    }

    function isSameDay(first, second) {
        return nairobiDateKey(first) !== null &&
            nairobiDateKey(first) === nairobiDateKey(second);
    }

    function isWithinDateFilter(order) {
        if (currentDateFilter === "all") {
            return true;
        }

        const date = getOrderDate(order);

        if (!date) {
            return false;
        }

        const now = new Date();
        const dateKey = nairobiDateKey(date);
        const nowKey = nairobiDateKey(now);

        if (!dateKey || !nowKey) return false;
        if (currentDateFilter === "today") return dateKey === nowKey;

        const dateParts = dateKey.split("-").map(Number);
        const nowParts = nowKey.split("-").map(Number);
        const dateUtc = Date.UTC(dateParts[0], dateParts[1] - 1, dateParts[2]);
        const nowUtc = Date.UTC(nowParts[0], nowParts[1] - 1, nowParts[2]);

        if (currentDateFilter === "week") {
            const nowDate = new Date(nowUtc);
            const daysSinceMonday = (nowDate.getUTCDay() + 6) % 7;
            const startUtc = nowUtc - daysSinceMonday * 86400000;
            return dateUtc >= startUtc && dateUtc <= nowUtc;
        }

        if (currentDateFilter === "month") {
            return dateParts[0] === nowParts[0] &&
                dateParts[1] === nowParts[1];
        }

        return true;
    }

    function showMessage(message, type = "success") {
        if (!elements.message) {
            console[type === "error" ? "error" : "log"](message);
            return;
        }

        clearTimeout(messageTimer);

        elements.message.textContent = message;
        elements.message.className = `rider-message show ${type}`;
        elements.message.style.display = "block";

        messageTimer = setTimeout(() => {
            elements.message.classList.remove("show");
            elements.message.style.display = "none";
        }, 4000);
    }

    // =========================================================
    // RIDER PROFILE
    // =========================================================

    async function loadRiderProfile() {
        const result = await apiRequest("/riders/me");

        rider = result?.data?.rider || result?.rider || null;

        if (!rider) {
            throw new Error("Could not load your rider profile.");
        }

        const name = [
            rider.first_name,
            rider.last_name
        ].filter(Boolean).join(" ") ||
            rider.full_name ||
            rider.name ||
            "Delivery Rider";

        elements.profileNames.forEach(element => {
            element.textContent = name;
        });

        const initials = name
            .split(/\s+/)
            .filter(Boolean)
            .slice(0, 2)
            .map(part => part.charAt(0).toUpperCase())
            .join("") || "R";

        elements.profileAvatars.forEach(element => {
            element.textContent = initials;
        });

        renderOnlineStatus();
    }

    function renderOnlineStatus() {
        if (!elements.statusButton || !rider) {
            return;
        }

        const availability = String(
            rider.availability || "offline"
        ).toLowerCase();

        const online = availability === "available";
        const onDelivery = availability === "on_delivery";

        elements.statusButton.classList.toggle("online", online);
        elements.statusButton.classList.toggle("offline", !online);

        const statusText = elements.statusButton.querySelector(
            "span:not(.status-dot)"
        );

        if (statusText) {
            statusText.textContent = onDelivery
                ? "You're on a delivery"
                : online
                    ? "You're Online"
                    : "You're Offline";
        }

        elements.statusButton.setAttribute(
            "aria-label",
            onDelivery
                ? "You are currently on a delivery"
                : online
                    ? "You are online"
                    : "You are offline"
        );
    }

    // =========================================================
    // DELIVERIES API
    // =========================================================

    async function loadDeliveries() {
        const result = await apiRequest("/riders/my-orders");

        deliveries = getData(result, "orders");
    }

    async function refreshDeliveries() {
        if (loading) {
            return;
        }

        loading = true;

        if (elements.historyContainer) {
            elements.historyContainer.setAttribute("aria-busy", "true");
        }

        try {
            await loadDeliveries();

            renderActiveDelivery();
            renderDeliveryHistory();
            renderSummary();
        } catch (error) {
            console.error("Failed to load rider deliveries:", error);

            showMessage(
                error.message || "Unable to load deliveries.",
                "error"
            );

            renderLoadError();
        } finally {
            loading = false;

            if (elements.historyContainer) {
                elements.historyContainer.setAttribute("aria-busy", "false");
            }
        }
    }

    function renderLoadError() {
        if (elements.historyContainer) {
            elements.historyContainer.innerHTML = `
                <div class="rider-empty-deliveries">
                    <div class="rider-empty-deliveries-icon">!</div>
                    <h3>Unable to load deliveries</h3>
                    <p>
                        Check your connection and try loading your deliveries
                        again.
                    </p>
                    <button type="button"
                            class="rider-primary-button"
                            id="retryDeliveries">
                        Try Again
                    </button>
                </div>
            `;

            document.getElementById("retryDeliveries")
                ?.addEventListener("click", refreshDeliveries);
        }

        if (elements.activeDelivery) {
            elements.activeDelivery.hidden = true;
        }
    }

    // =========================================================
    // FILTERS
    // =========================================================

    function getFilteredDeliveries() {
        const search = elements.search?.value.trim().toLowerCase() || "";

        return deliveries.filter(order => {
            const searchableText = [
                order.order_number,
                order.restaurant_name,
                order.delivery_address,
                order.delivery_city,
                order.recipient_name,
                order.recipient_phone
            ].filter(Boolean).join(" ").toLowerCase();

            if (search && !searchableText.includes(search)) {
                return false;
            }

            if (currentFilter === "active" && !isActive(order)) {
                return false;
            }

            if (currentFilter === "completed" && !isCompleted(order)) {
                return false;
            }

            if (currentFilter === "cancelled" && !isCancelled(order)) {
                return false;
            }

            if (!isWithinDateFilter(order)) {
                return false;
            }

            return true;
        });
    }

    function clearFilters() {
        if (elements.search) {
            elements.search.value = "";
        }

        currentFilter = "all";
        currentDateFilter = "all";

        elements.filters.forEach((select, index) => {
            select.selectedIndex = 0;

            if (index === 0) {
                select.value = "All Deliveries";
            } else if (index === 1) {
                select.value = "All Dates";
            }
        });

        renderActiveDelivery();
        renderDeliveryHistory();

        showMessage("Filters cleared.", "success");
    }

    function handleFilterChange() {
        const statusSelect = elements.filters[0];
        const dateSelect = elements.filters[1];

        const statusValue = statusSelect?.value.toLowerCase() || "all";
        const dateValue = dateSelect?.value.toLowerCase() || "all";

        currentFilter = statusValue.includes("active")
            ? "active"
            : statusValue.includes("completed")
                ? "completed"
                : statusValue.includes("cancelled")
                    ? "cancelled"
                    : "all";

        currentDateFilter = dateValue.includes("today")
            ? "today"
            : dateValue.includes("week")
                ? "week"
                : dateValue.includes("month")
                    ? "month"
                    : "all";

        renderActiveDelivery();
        renderDeliveryHistory();
    }

    // =========================================================
    // ACTIVE DELIVERY
    // =========================================================

    function renderActiveDelivery() {
        const container = elements.activeDelivery;
        if (!container) return;

        const activeOrders = getFilteredDeliveries().filter(isActive);

        if (!activeOrders.length) {
            container.hidden = true;
            container.style.display = "none";
            container.innerHTML = "";
            return;
        }

        container.hidden = false;
        container.style.display = "";
        trackingMaps.forEach(item => item.map.remove());
        trackingMaps.clear();
        container.innerHTML = activeOrders.map(renderActiveDeliveryCard).join("");

        container.querySelectorAll("[data-view-delivery]").forEach(button => {
            const order = activeOrders.find(item =>
                String(item.id) === button.dataset.viewDelivery
            );
            if (order) button.addEventListener("click", () => viewDeliveryDetails(order));
        });

        container.querySelectorAll("[data-start-delivery]").forEach(button => {
            button.addEventListener("click", event => updateDeliveryStatus(
                event.currentTarget.dataset.startDelivery,
                "out_for_delivery",
                event.currentTarget
            ));
        });

        container.querySelectorAll("[data-mark-delivered]").forEach(button => {
            button.addEventListener("click", event => updateDeliveryStatus(
                event.currentTarget.dataset.markDelivered,
                "delivered",
                event.currentTarget
            ));
        });
        setupTrackingMaps(activeOrders);
    }

    function validCoordinates(latitude, longitude) {
        const lat = Number(latitude), lng = Number(longitude);
        if (latitude === null || latitude === "" || longitude === null || longitude === "") return null;
        if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
        return [lat, lng];
    }

    function navigationUrl(order) {
        const isPickup = getStatus(order) === "ready";
        const point = isPickup
            ? validCoordinates(order.restaurant_latitude, order.restaurant_longitude)
            : validCoordinates(order.delivery_latitude, order.delivery_longitude);
        const address = isPickup
            ? [order.restaurant_address, order.restaurant_city].filter(Boolean).join(", ")
            : [order.delivery_address, order.delivery_city].filter(Boolean).join(", ");
        const destination = point ? point.join(",") : address;
        return destination ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}&travelmode=driving` : "";
    }

    function setTrackingStatus(orderId, message, isError = false) {
        const element = document.querySelector(`[data-tracking-status="${orderId}"]`);
        if (element) { element.textContent = message; element.style.color = isError ? "#b91c1c" : ""; }
    }

    function setupTrackingMaps(activeOrders) {
        activeOrders.forEach(order => {
            const id = String(order.id);
            const element = document.getElementById(`riderTrackingMap-${id}`);
            if (!element) return;
            if (!window.L) { setTrackingStatus(id, "Map library failed to load. Use Open Navigation.", true); return; }
            const pickup = validCoordinates(order.restaurant_latitude, order.restaurant_longitude);
            const dropoff = validCoordinates(order.delivery_latitude, order.delivery_longitude);
            const initial = pickup || dropoff || [-1.286389, 36.817223];
            const map = L.map(element, { scrollWheelZoom: false }).setView(initial, pickup || dropoff ? 14 : 11);
            L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
                maxZoom: 19,
                attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>'
            }).addTo(map);
            const markers = {};
            const locationLabel = String(order.restaurant_location_name || "").trim()
                || `${String(order.restaurant_name || "Restaurant").trim().split(/\\s+/)[0]} Location`;
            if (pickup) markers.pickup = L.marker(pickup).addTo(map).bindPopup(locationLabel);
            if (dropoff) markers.dropoff = L.marker(dropoff).addTo(map).bindPopup("Customer delivery");
            const points = [pickup, dropoff].filter(Boolean);
            const tracking = { map, markers, order, hasCenteredOnRider: false };
            trackingMaps.set(id, tracking);
            if (points.length > 1) {
                map.fitBounds(L.latLngBounds(points), { padding: [28, 28] });
                const coords = points.map(p => `${p[1]},${p[0]}`).join(";");
                fetch(`https://router.project-osrm.org/route/v1/driving/${coords}?overview=full&geometries=geojson`)
                    .then(response => response.ok ? response.json() : null)
                    .then(result => {
                        if (result?.routes?.[0]?.geometry && trackingMaps.get(id)?.map === map) {
                            tracking.route = L.geoJSON(result.routes[0].geometry, { style: { color: "#ff5a1f", weight: 5, opacity: .8 } }).addTo(map);
                        }
                    }).catch(() => setTrackingStatus(id, "Route preview unavailable. Use Open Navigation."));
            } else {
                setTrackingStatus(id, "Some pickup/drop-off coordinates are missing. Open Navigation can still use the saved address.");
            }
            if (latestGpsPosition) updateMapRiderPosition(id, latestGpsPosition);
            const link = document.querySelector(`[data-open-navigation="${id}"]`);
            const url = navigationUrl(order);
            if (link && url) { link.href = url; link.target = "_blank"; link.rel = "noopener noreferrer"; }
            else if (link) link.hidden = true;
        });
        document.querySelectorAll("[data-start-tracking]").forEach(button => button.addEventListener("click", startLiveTracking));
        document.querySelectorAll("[data-stop-tracking]").forEach(button => button.addEventListener("click", stopLiveTracking));
    }

    function updateMapRiderPosition(id, position) {
        const tracking = trackingMaps.get(String(id));
        if (!tracking) return;
        const point = [position.coords.latitude, position.coords.longitude];
        if (!tracking.markers.rider) tracking.markers.rider = L.circleMarker(point, { radius: 8, color: "#fff", weight: 3, fillColor: "#2563eb", fillOpacity: 1 }).addTo(tracking.map).bindPopup("Your live location");
        else tracking.markers.rider.setLatLng(point);
        if (!tracking.hasCenteredOnRider) { tracking.map.setView(point, 15); tracking.hasCenteredOnRider = true; }
        setTrackingStatus(id, `GPS active · accuracy about ${Math.round(position.coords.accuracy || 0)} m · updated ${new Date(position.timestamp).toLocaleTimeString()}`);
    }

    async function saveLiveLocation(position) {
        if (Date.now() - lastLocationSentAt < 15000 || locationUpdatePromise) return;
        lastLocationSentAt = Date.now();
        locationUpdatePromise = apiRequest("/riders/me/location", {
            method: "PATCH",
            body: JSON.stringify({ latitude: position.coords.latitude, longitude: position.coords.longitude, accuracy: position.coords.accuracy })
        }).catch(error => {
            console.error("Unable to save rider location:", error);
            trackingMaps.forEach((tracking, id) => setTrackingStatus(id, "GPS works, but the server could not save your latest location.", true));
        }).finally(() => { locationUpdatePromise = null; });
        await locationUpdatePromise;
    }

    function startLiveTracking() {
        if (!navigator.geolocation) { showMessage("This browser does not support GPS location.", "error"); return; }
        if (trackingWatchId !== null) { showMessage("Live tracking is already running."); return; }
        trackingMaps.forEach((tracking, id) => setTrackingStatus(id, "Requesting location permission…"));
        trackingWatchId = navigator.geolocation.watchPosition(position => {
            latestGpsPosition = position;
            trackingMaps.forEach((tracking, id) => updateMapRiderPosition(id, position));
            saveLiveLocation(position);
        }, error => {
            const message = error.code === 1
                ? "Location permission denied. Allow location access in browser settings."
                : error.code === 2
                    ? "Current location unavailable. Check GPS and device location settings."
                    : "GPS timed out. Move to an area with a clearer signal and try again.";
            trackingMaps.forEach((tracking, id) => setTrackingStatus(id, message, true));
            showMessage(message, "error");
            if (error.code === 1 && trackingWatchId !== null) { navigator.geolocation.clearWatch(trackingWatchId); trackingWatchId = null; }
        }, { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 });
        trackingMaps.forEach((tracking, id) => setTrackingStatus(id, "Waiting for device GPS…"));
    }

    function stopLiveTracking() {
        if (trackingWatchId !== null && navigator.geolocation) { navigator.geolocation.clearWatch(trackingWatchId); trackingWatchId = null; }
        trackingMaps.forEach((tracking, id) => setTrackingStatus(id, "Live location sharing is paused."));
        showMessage("Live location tracking paused.");
    }

    function renderActiveDeliveryCard(order) {
        const status = getStatus(order);
        const restaurant = escapeHTML(order.restaurant_name || "Restaurant");
        const pickupAddress = escapeHTML(order.restaurant_address || "Pickup location not provided");
        const deliveryAddress = escapeHTML(
            [order.delivery_address, order.delivery_city].filter(Boolean).join(", ") ||
            "Delivery address not provided"
        );
        const recipient = escapeHTML(order.recipient_name || "Customer");
        const orderNumber = escapeHTML(getOrderNumber(order));
        const readyAt = order.ready_at ? formatTime(order.ready_at) : null;
        const startedAt = order.out_for_delivery_at ? formatTime(order.out_for_delivery_at) : null;

        const progress = status === "out_for_delivery" ? `
            <div class="rider-progress-step completed"><div class="rider-progress-dot">✓</div><div><strong>Order Ready</strong><span>${escapeHTML(readyAt || "Time not recorded")}</span></div></div>
            <div class="rider-progress-line completed"></div>
            <div class="rider-progress-step completed"><div class="rider-progress-dot">✓</div><div><strong>Delivery Started</strong><span>${escapeHTML(startedAt || "Start time not recorded")}</span></div></div>
            <div class="rider-progress-line completed"></div>
            <div class="rider-progress-step current"><div class="rider-progress-dot">3</div><div><strong>On the Way</strong><span>In progress</span></div></div>
            <div class="rider-progress-line"></div>
            <div class="rider-progress-step"><div class="rider-progress-dot">4</div><div><strong>Delivered</strong><span>Not yet delivered</span></div></div>
        ` : `
            <div class="rider-progress-step completed"><div class="rider-progress-dot">✓</div><div><strong>Order Ready</strong><span>${escapeHTML(readyAt || "Time not recorded")}</span></div></div>
            <div class="rider-progress-line completed"></div>
            <div class="rider-progress-step current"><div class="rider-progress-dot">2</div><div><strong>Ready for Pickup</strong><span>Waiting for you to start delivery</span></div></div>
            <div class="rider-progress-line"></div>
            <div class="rider-progress-step"><div class="rider-progress-dot">3</div><div><strong>On the Way</strong><span>Not started</span></div></div>
            <div class="rider-progress-line"></div>
            <div class="rider-progress-step"><div class="rider-progress-dot">4</div><div><strong>Delivered</strong><span>Not yet delivered</span></div></div>
        `;

        const actionButton = status === "ready"
            ? `<button type="button" class="rider-primary-button" data-start-delivery="${escapeHTML(order.id)}">Start Delivery</button>`
            : `<button type="button" class="rider-primary-button" data-mark-delivered="${escapeHTML(order.id)}">Mark as Delivered</button>`;

        const fee = order.delivery_fee === null || order.delivery_fee === undefined
            ? "Not provided"
            : money(order.delivery_fee);

        return `
            <section class="rider-active-delivery-card">
                <div class="rider-delivery-header">
                    <div class="rider-delivery-restaurant">
                        <div class="rider-delivery-icon">◈</div>
                        <div><span class="rider-delivery-order-number">Order ${orderNumber}</span><h3>${restaurant}</h3><small>${status === "ready" ? "Ready for pickup" : `Delivery started at ${escapeHTML(startedAt || "time not recorded")}`}</small></div>
                    </div>
                    <span class="rider-delivery-status active">${status === "ready" ? "Ready for Pickup" : "In Progress"}</span>
                </div>
                <div class="rider-delivery-progress">${progress}</div>
                <div class="rider-tracking-panel">
                    <div class="rider-tracking-toolbar">
                        <strong>Live location & route</strong>
                        <div class="rider-tracking-actions">
                            <button type="button" data-start-tracking="${escapeHTML(order.id)}">Start Live Tracking</button>
                            <button type="button" data-stop-tracking="${escapeHTML(order.id)}">Pause Tracking</button>
                            <a href="#" data-open-navigation="${escapeHTML(order.id)}">Open Navigation</a>
                        </div>
                    </div>
                    <div class="rider-tracking-map" id="riderTrackingMap-${escapeHTML(order.id)}" role="region" aria-label="Live delivery map for order ${orderNumber}"></div>
                    <p class="rider-tracking-status" data-tracking-status="${escapeHTML(order.id)}" role="status">Enable live tracking to show your current GPS position.</p>
                </div>
                <div class="rider-delivery-route">
                    <div class="rider-route-location"><span class="route-label">PICKUP</span><strong>${restaurant}</strong><p>${pickupAddress}</p></div>
                    <div class="rider-route-arrow">→</div>
                    <div class="rider-route-location"><span class="route-label">DELIVERY</span><strong>${recipient}</strong><p>${deliveryAddress}</p></div>
                </div>
                <div class="rider-delivery-footer">
                    <div class="rider-delivery-meta"><span>Order value: ${money(order.total_amount)}</span><span>Rider delivery fee: ${escapeHTML(fee)}</span></div>
                    <div class="rider-delivery-actions">
                        <button type="button" class="rider-secondary-button" data-view-delivery="${escapeHTML(order.id)}">View Details</button>
                        ${actionButton}
                    </div>
                </div>
            </section>
        `;
    }

    // =========================================================
    // DELIVERY HISTORY
    // =========================================================

    function renderDeliveryHistory() {
        const container = elements.historyContainer;

        if (!container) {
            return;
        }

        const history = getFilteredDeliveries().filter(
            order => !isActive(order)
        );

        if (history.length === 0) {
            container.innerHTML = `
                <div class="rider-empty-deliveries">
                    <div class="rider-empty-deliveries-icon">◈</div>
                    <h3>No Deliveries Found</h3>
                    <p>
                        No deliveries match your current search or filters.
                    </p>
                    <button type="button"
                            class="rider-secondary-button"
                            id="clearDeliveryFilters">
                        Clear Filters
                    </button>
                </div>
            `;

            container.querySelector("#clearDeliveryFilters")
                ?.addEventListener("click", clearFilters);

            return;
        }

        container.innerHTML = history
            .slice()
            .sort((a, b) => {
                const dateA = getOrderDate(a)?.getTime() || 0;
                const dateB = getOrderDate(b)?.getTime() || 0;

                return dateB - dateA;
            })
            .map(renderDeliveryCard)
            .join("");

        container.querySelectorAll("[data-view-history]")
            .forEach(button => {
                button.addEventListener("click", () => {
                    const order = history.find(
                        item => String(item.id) === button.dataset.viewHistory
                    );

                    if (order) {
                        viewDeliveryDetails(order);
                    }
                });
            });

        container.querySelectorAll("[data-confirm-history-payment]")
            .forEach(button => {
                button.addEventListener("click", event => markCashPaymentComplete(
                    event.currentTarget.dataset.confirmHistoryPayment,
                    event.currentTarget
                ));
            });
    }

    function renderDeliveryCard(order) {
        const status = getStatus(order);
        const completed = status === "delivered";
        const cancelled = status === "cancelled";

        const statusLabel = completed
            ? "Completed"
            : cancelled
                ? "Cancelled"
                : status.replaceAll("_", " ");

        const pickup = order.restaurant_address ||
            order.restaurant_name ||
            "Pickup location";

        const destination = [
            order.delivery_address,
            order.delivery_city
        ].filter(Boolean).join(", ") || "Delivery location";

        const date = order.delivered_at ||
            order.out_for_delivery_at ||
            order.ready_at ||
            order.placed_at;

        return `
            <article class="rider-delivery-card ${cancelled ? "cancelled" : ""}">
                <div class="rider-delivery-card-main">
                    <div class="rider-delivery-icon">◈</div>

                    <div class="rider-delivery-info">
                        <strong>
                            Order ${escapeHTML(getOrderNumber(order))}
                        </strong>
                        <span>
                            ${escapeHTML(order.restaurant_name || "Restaurant")}
                        </span>
                        <small>
                            ${escapeHTML(pickup)} → ${escapeHTML(destination)}
                        </small>
                    </div>
                </div>

                <div class="rider-delivery-card-center">
                    <span class="rider-delivery-card-label">
                        ${escapeHTML(statusLabel)}
                    </span>
                    <strong>${escapeHTML(formatTime(date))}</strong>
                    <small>${escapeHTML(formatDate(date))}</small>
                </div>

                <div class="rider-delivery-card-amount">
                    <strong>${order.delivery_fee === null || order.delivery_fee === undefined ? "—" : money(order.delivery_fee)}</strong>
                    <small>Rider fee</small>
                    <span class="rider-delivery-status ${
                        completed ? "completed" : cancelled ? "cancelled" : "active"
                    }">
                        ${escapeHTML(statusLabel)}
                    </span>
                </div>

                <div class="rider-delivery-card-action">
                    <button type="button"
                            class="rider-secondary-button"
                            data-view-history="${escapeHTML(order.id)}">
                        View
                    </button>
                    ${completed && String(order.payment_method || "").toLowerCase() === "cash"
                        ? String(order.payment_status || "pending").toLowerCase() === "completed"
                            ? '<span class="rider-delivery-status completed">Payment Confirmed</span>'
                            : `<button type="button" class="rider-primary-button" data-confirm-history-payment="${escapeHTML(order.id)}">Confirm Payment</button>`
                        : ""}
                </div>
            </article>
        `;
    }

    // =========================================================
    // SUMMARY CARDS
    // =========================================================

    function renderSummary() {
        const cards = elements.summaryCards;

        if (!cards.length) {
            return;
        }

        const today = new Date();

        const activeCount = deliveries.filter(isActive).length;

        const completedToday = deliveries.filter(order => {
            if (!isCompleted(order) || !order.delivered_at) {
                return false;
            }

            const deliveredDate = new Date(order.delivered_at);

            return !Number.isNaN(deliveredDate.getTime()) &&
                isSameDay(deliveredDate, today);
        });

        const firstValue = cards[0]?.querySelector("strong");
        const secondValue = cards[1]?.querySelector("strong");
        const thirdValue = cards[2]?.querySelector("strong");
        const fourthValue = cards[3]?.querySelector("strong");

        if (firstValue) {
            firstValue.textContent = String(activeCount);
        }

        if (secondValue) {
            secondValue.textContent = String(completedToday.length);
        }

        if (thirdValue) {
            const earnings = completedToday.reduce((total, order) => {
                const fee = Number(order.delivery_fee);
                return total + (Number.isFinite(fee) ? fee : 0);
            }, 0);
            const hasMissingFee = completedToday.some(order =>
                order.delivery_fee === null || order.delivery_fee === undefined ||
                order.delivery_fee === ""
            );
            thirdValue.textContent = money(earnings) + (hasMissingFee ? " *" : "");
            thirdValue.title = hasMissingFee
                ? "Some completed deliveries have no delivery fee recorded; displayed total may be incomplete."
                : "Sum of recorded delivery fees for deliveries completed today.";
        }

        if (fourthValue) {
            const completedCount = deliveries.filter(isCompleted).length;
            const finishedCount = deliveries.filter(
                order => isCompleted(order) || isCancelled(order)
            ).length;

            const successRate = finishedCount
                ? Math.round((completedCount / finishedCount) * 100)
                : 0;

            fourthValue.textContent = `${successRate}%`;
        }
    }

    // =========================================================
    // UPDATE DELIVERY STATUS
    // =========================================================

    async function updateDeliveryStatus(id, newStatus, button) {
        if (button?.disabled) {
            return;
        }

        const actionText = newStatus === "out_for_delivery"
            ? "start this delivery"
            : "mark this order as delivered";

        if (!window.confirm(`Are you sure you want to ${actionText}?`)) {
            return;
        }

        const originalText = button?.textContent;

        if (button) {
            button.disabled = true;
            button.textContent = "Updating...";
        }

        const endpoint = newStatus === "out_for_delivery"
            ? `/riders/my-orders/${encodeURIComponent(id)}/out-for-delivery`
            : `/riders/my-orders/${encodeURIComponent(id)}/delivered`;

        try {
            await apiRequest(endpoint, {
                method: "PATCH"
            });

            showMessage(
                newStatus === "out_for_delivery"
                    ? "Delivery started successfully."
                    : "Order marked as delivered successfully.",
                "success"
            );

            await refreshDeliveries();
        } catch (error) {
            console.error("Failed to update delivery status:", error);
            showMessage(error.message, "error");

            if (button) {
                button.disabled = false;
                button.textContent = originalText || "Try Again";
            }
        }
    }

    async function markCashPaymentComplete(orderId, button) {
        if (button?.disabled) return;
        const order = deliveries.find(item => String(item.id) === String(orderId));
        if (!order || getStatus(order) !== "delivered") {
            showMessage("Mark the order as delivered before confirming payment.", "error");
            return;
        }
        if (String(order.payment_method || "").toLowerCase() !== "cash") {
            showMessage("Only cash orders can be confirmed here.", "error");
            return;
        }
        if (String(order.payment_status || "").toLowerCase() === "completed") {
            showMessage("This payment is already confirmed.", "info");
            return;
        }
        if (!window.confirm(`Confirm that you received ${money(order.total_amount)} in cash from the customer for order ${getOrderNumber(order)}.`)) return;
        const originalText = button?.textContent;
        if (button) { button.disabled = true; button.textContent = "Saving..."; }
        try {
            await apiRequest(`/riders/my-orders/${encodeURIComponent(orderId)}/cash-payment-complete`, { method: "PATCH" });
            showMessage("Cash payment confirmed.", "success");
            await refreshDeliveries();
        } catch (error) {
            showMessage(error.message || "Could not confirm cash payment.", "error");
            if (button) { button.disabled = false; button.textContent = originalText || "Confirm Payment"; }
        }
    }

    // =========================================================
    // DELIVERY DETAILS MODAL
    // =========================================================

    function viewDeliveryDetails(order) {
        let modal = document.getElementById("riderDeliveryDetailsModal");

        if (!modal) {
            modal = document.createElement("div");
            modal.id = "riderDeliveryDetailsModal";
            modal.className = "rider-delivery-details-overlay";
            modal.setAttribute("role", "dialog");
            modal.setAttribute("aria-modal", "true");
            modal.setAttribute("aria-labelledby", "riderDeliveryDetailsTitle");

            modal.innerHTML = `
                <div class="rider-delivery-details-modal">
                    <button type="button"
                            class="rider-delivery-details-close"
                            aria-label="Close details">
                        &times;
                    </button>
                    <div id="riderDeliveryDetailsContent"></div>
                </div>
            `;

            document.body.appendChild(modal);

            modal.addEventListener("click", event => {
                if (event.target === modal) {
                    closeDetailsModal();
                }
            });

            modal.querySelector(".rider-delivery-details-close")
                .addEventListener("click", closeDetailsModal);
        }

        const status = getStatus(order);
        const content = modal.querySelector("#riderDeliveryDetailsContent");

        content.innerHTML = `
            <h2 id="riderDeliveryDetailsTitle">
                Order ${escapeHTML(getOrderNumber(order))}
            </h2>

            <p class="rider-delivery-details-status">
                ${escapeHTML(status.replaceAll("_", " "))}
            </p>

            <div class="rider-delivery-details-row">
                <span>Restaurant</span>
                <strong>
                    ${escapeHTML(order.restaurant_name || "Restaurant")}
                </strong>
            </div>

            <div class="rider-delivery-details-row">
                <span>Customer order value</span>
                <strong>${money(order.total_amount)}</strong>
            </div>

            <div class="rider-delivery-details-row">
                <span>Rider delivery fee</span>
                <strong>${order.delivery_fee === null || order.delivery_fee === undefined ? "Not recorded" : money(order.delivery_fee)}</strong>
            </div>

            <div class="rider-delivery-details-row">
                <span>Pickup address</span>
                <strong>
                    ${escapeHTML(order.restaurant_address || "Not provided")}
                </strong>
            </div>

            <div class="rider-delivery-details-row">
                <span>Recipient</span>
                <strong>${escapeHTML(order.recipient_name || "Customer")}</strong>
            </div>

            <div class="rider-delivery-details-row">
                <span>Delivery address</span>
                <strong>
                    ${escapeHTML([
                        order.delivery_address,
                        order.delivery_city
                    ].filter(Boolean).join(", ") || "Not provided")}
                </strong>
            </div>

            <div class="rider-delivery-details-row">
                <span>Recipient phone</span>
                <strong>
                    ${escapeHTML(order.recipient_phone || "Not provided")}
                </strong>
            </div>

            <div class="rider-delivery-details-row">
                <span>Delivery instructions</span>
                <strong>
                    ${escapeHTML(order.delivery_instructions || "None")}
                </strong>
            </div>

            <div class="rider-delivery-details-row">
                <span>Placed</span>
                <strong>${escapeHTML(formatDate(order.placed_at))}</strong>
            </div>

            <div class="rider-delivery-details-row">
                <span>Ready at</span>
                <strong>${escapeHTML(formatDate(order.ready_at))}</strong>
            </div>

            <div class="rider-delivery-details-row">
                <span>Out for delivery</span>
                <strong>
                    ${escapeHTML(formatDate(order.out_for_delivery_at))}
                </strong>
            </div>

            <div class="rider-delivery-details-row">
                <span>Delivered at</span>
                <strong>${escapeHTML(formatDate(order.delivered_at))}</strong>
            </div>

            ${
                status === "ready"
                    ? `<button type="button"
                               class="rider-primary-button rider-details-action"
                               data-start-delivery="${escapeHTML(order.id)}">
                           Start Delivery
                       </button>`
                    : status === "out_for_delivery"
                        ? `<button type="button"
                                   class="rider-primary-button rider-details-action"
                                   data-mark-delivered="${escapeHTML(order.id)}">
                               Mark as Delivered
                           </button>`
                        : ""
            }
        `;

        modal.hidden = false;
        modal.classList.add("open");
        document.body.classList.add("rider-modal-open");

        content.querySelector("[data-start-delivery]")
            ?.addEventListener("click", event => {
                closeDetailsModal();

                updateDeliveryStatus(
                    event.currentTarget.dataset.startDelivery,
                    "out_for_delivery",
                    event.currentTarget
                );
            });

        content.querySelector("[data-mark-delivered]")
            ?.addEventListener("click", event => {
                closeDetailsModal();

                updateDeliveryStatus(
                    event.currentTarget.dataset.markDelivered,
                    "delivered",
                    event.currentTarget
                );
            });
    }

    function closeDetailsModal() {
        const modal = document.getElementById("riderDeliveryDetailsModal");

        if (modal) {
            modal.classList.remove("open");
            modal.hidden = true;
        }

        document.body.classList.remove("rider-modal-open");
    }

    // =========================================================
    // SEARCH AND FILTER EVENTS
    // =========================================================

    elements.search?.addEventListener("input", () => {
        renderActiveDelivery();
        renderDeliveryHistory();
    });

    elements.filters.forEach(select => {
        select.addEventListener("change", handleFilterChange);
    });

    elements.emptyState?.querySelector("button")
        ?.addEventListener("click", clearFilters);

    // =========================================================
    // MOBILE SIDEBAR
    // =========================================================

    elements.menuButton?.addEventListener("click", event => {
        event.stopPropagation();
        elements.sidebar?.classList.toggle("active");
    });

    document.addEventListener("click", event => {
        if (
            elements.sidebar?.classList.contains("active") &&
            !elements.sidebar.contains(event.target) &&
            !elements.menuButton?.contains(event.target)
        ) {
            elements.sidebar.classList.remove("active");
        }
    });

    elements.sidebar?.querySelectorAll(".rider-nav-link")
        .forEach(link => {
            link.addEventListener("click", () => {
                if (window.innerWidth <= 768) {
                    elements.sidebar.classList.remove("active");
                }
            });
        });

    document.addEventListener("keydown", event => {
        if (event.key === "Escape") {
            closeDetailsModal();
            elements.sidebar?.classList.remove("active");
        }
    });

    // =========================================================
    // NOTIFICATIONS
    // =========================================================

    // Notifications are not exposed by the current rider API. The HTML control
    // is disabled and no fabricated notification count is displayed.

    // =========================================================
    // MODAL STYLES
    // =========================================================

    const modalStyles = document.createElement("style");

    modalStyles.textContent = `
        .rider-delivery-details-overlay {
            position: fixed;
            inset: 0;
            z-index: 9999;
            display: none;
            align-items: center;
            justify-content: center;
            padding: 20px;
            background: rgba(15, 23, 42, 0.55);
            overflow-y: auto;
        }

        .rider-delivery-details-overlay.open {
            display: flex;
        }

        .rider-delivery-details-modal {
            position: relative;
            width: 100%;
            max-width: 560px;
            max-height: 90vh;
            overflow-y: auto;
            padding: 28px;
            border-radius: 14px;
            background: #fff;
            box-shadow: 0 20px 60px rgba(0, 0, 0, 0.2);
        }

        .rider-delivery-details-modal h2 {
            margin: 0 36px 8px 0;
            color: #0f172a;
            font-size: 22px;
        }

        .rider-delivery-details-close {
            position: absolute;
            top: 12px;
            right: 16px;
            border: 0;
            background: transparent;
            color: #64748b;
            font-size: 30px;
            cursor: pointer;
        }

        .rider-delivery-details-status {
            margin: 0 0 20px;
            color: #15803d;
            font-weight: 600;
            text-transform: capitalize;
        }

        .rider-delivery-details-row {
            display: flex;
            flex-direction: column;
            gap: 5px;
            padding: 12px 0;
            border-bottom: 1px solid #e2e8f0;
        }

        .rider-delivery-details-row span {
            color: #64748b;
            font-size: 12px;
        }

        .rider-delivery-details-row strong {
            color: #0f172a;
            font-size: 14px;
            overflow-wrap: anywhere;
        }

        .rider-details-action {
            width: 100%;
            margin-top: 20px;
        }

        body.rider-modal-open {
            overflow: hidden;
        }

        @media (max-width: 520px) {
            .rider-delivery-details-modal {
                padding: 22px 18px;
            }
        }
    `;

    document.head.appendChild(modalStyles);

    // =========================================================
    // INITIALIZE
    // =========================================================

    async function initialize() {
        try {
            await loadRiderProfile();
            await refreshDeliveries();
        } catch (error) {
            console.error("Deliveries initialization failed:", error);

            showMessage(
                error.message || "Unable to initialize your deliveries.",
                "error"
            );
            renderLoadError();
            elements.summaryCards.forEach(card => {
                const value = card.querySelector("strong");
                if (value) value.textContent = "—";
            });
        }
    }

    initialize();
});
