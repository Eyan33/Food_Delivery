const pool = require("../../config/database");

const ORDER_FILTER_TIME_ZONE =
    process.env.DASHBOARD_TIME_ZONE || "Africa/Nairobi";

const ORDER_STATUS_VALUES = [
    "pending",
    "confirmed",
    "preparing",
    "ready",
    "out_for_delivery",
    "delivered",
    "cancelled",
];

const ADMIN_ORDER_TRANSITIONS = {
    pending: ["confirmed", "cancelled"],
    confirmed: ["preparing", "cancelled"],
    preparing: ["ready", "cancelled"],
    ready: ["out_for_delivery", "cancelled"],
    out_for_delivery: ["delivered", "cancelled"],
    delivered: [],
    cancelled: [],
};

function apiError(message, statusCode = 400) {
    const error = new Error(message);
    error.statusCode = statusCode;
    return error;
}


function validCoordinate(value, min, max) {
    if (value === undefined || value === null || value === "") return null;
    const number = Number(value);
    return Number.isFinite(number) && number >= min && number <= max ? number : null;
}

function calculateStraightLineDistanceKm(latitude1, longitude1, latitude2, longitude2) {
    const radians = degrees => degrees * Math.PI / 180;
    const dLat = radians(latitude2 - latitude1);
    const dLon = radians(longitude2 - longitude1);
    const a = Math.sin(dLat / 2) ** 2 +
        Math.cos(radians(latitude1)) * Math.cos(radians(latitude2)) *
        Math.sin(dLon / 2) ** 2;
    return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(Math.max(0, 1 - a)));
}

/**
 * Calculate delivery charges from distance and the per-kilometre rate
 * configured in Admin Operations > Platform fees. Uses Haversine
 * straight-line distance, not road-routing distance.
 */
async function calculateDeliveryPricing(queryable, restaurant, destinationLatitude, destinationLongitude) {
    const restaurantLatitude = validCoordinate(restaurant.latitude, -90, 90);
    const restaurantLongitude = validCoordinate(restaurant.longitude, -180, 180);
    const customerLatitude = validCoordinate(destinationLatitude, -90, 90);
    const customerLongitude = validCoordinate(destinationLongitude, -180, 180);

    if ([restaurantLatitude, restaurantLongitude, customerLatitude, customerLongitude].some(value => value === null)) {
        throw apiError("Delivery pricing requires valid GPS coordinates for both the restaurant and delivery location. Update the restaurant location and select your delivery location again.", 400);
    }

    const result = await queryable.query("SELECT settings FROM admin_settings WHERE id = 1 LIMIT 1");
    const allSettings = result.rows[0]?.settings || {};
    const platformFees = allSettings.platformFees || {};
    const deliverySettings = allSettings.delivery || {};
    const feePerKm = platformFees.deliveryFeePerKm == null || platformFees.deliveryFeePerKm === ""
        ? 0 : Number(platformFees.deliveryFeePerKm);
    const maxDistanceKm = Number(deliverySettings.maxDistance || 0);

    if (!Number.isFinite(feePerKm) || feePerKm < 0 ||
        !Number.isFinite(maxDistanceKm) || maxDistanceKm < 0) {
        throw apiError("Delivery pricing settings are invalid. Review Admin Operations > Platform fees.", 500);
    }

    const exactDistanceKm = calculateStraightLineDistanceKm(
        restaurantLatitude, restaurantLongitude, customerLatitude, customerLongitude,
    );
    const distanceKm = Math.round(exactDistanceKm * 100) / 100;

    if (maxDistanceKm > 0 && exactDistanceKm > maxDistanceKm) {
        throw apiError(`This delivery location is ${distanceKm.toFixed(2)} km away, beyond the ${maxDistanceKm} km delivery limit.`, 400);
    }

    const deliveryFee = Math.round(exactDistanceKm * feePerKm * 100) / 100;
    return { deliveryFee, distanceKm, feePerKm };
}

function parsePositiveInteger(value, label) {
    if (value === undefined || value === null || value === "") {
        return null;
    }

    const text = String(value).trim();

    if (!/^[1-9][0-9]*$/.test(text)) {
        throw apiError(`${label} must be a positive integer`);
    }

    return text;
}

function parseOrderFilterDate(value, label) {
    if (value === undefined || value === null || value === "") {
        return null;
    }

    const text = String(value).trim();

    if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) {
        throw apiError(
            `${label} must be a valid date in YYYY-MM-DD format`,
        );
    }

    const parsed = new Date(`${text}T00:00:00Z`);

    if (
        Number.isNaN(parsed.getTime()) ||
        parsed.toISOString().slice(0, 10) !== text
    ) {
        throw apiError(
            `${label} must be a valid date in YYYY-MM-DD format`,
        );
    }

    return text;
}

function validateAdminReason(reason, required = false) {
    if (reason === undefined || reason === null) {
        if (required) {
            throw apiError("Reason is required");
        }

        return null;
    }

    const text = String(reason).trim();

    if (!text) {
        if (required) {
            throw apiError("Reason is required");
        }

        return null;
    }

    if (text.length > 500) {
        throw apiError("Reason cannot exceed 500 characters");
    }

    return text;
}

function generateOrderNumber() {
    const now = new Date();

    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    const hours = String(now.getHours()).padStart(2, "0");
    const minutes = String(now.getMinutes()).padStart(2, "0");
    const seconds = String(now.getSeconds()).padStart(2, "0");

    const random = Math.floor(Math.random() * 1000)
        .toString()
        .padStart(3, "0");

    return `FD-${year}${month}${day}-${hours}${minutes}${seconds}-${random}`;
}

/*
|--------------------------------------------------------------------------
| Customer - Get Orders
|--------------------------------------------------------------------------
*/

async function getCustomerOrders(customerId) {
    const result = await pool.query(
        `
        SELECT
            o.id,
            o.order_number,
            o.customer_id,
            o.restaurant_id,
            o.address_id,
            o.status,
            o.delivery_address,
            o.delivery_city,
            o.recipient_name,
            o.recipient_phone,
            o.delivery_instructions,
            o.subtotal,
            o.delivery_fee,
            o.discount,
            o.total_amount,
            o.notes,
            o.placed_at,
            o.confirmed_at,
            o.preparing_at,
            o.ready_at,
            o.out_for_delivery_at,
            o.delivered_at,
            o.cancelled_at,
            o.created_at,
            o.updated_at,
            r.name AS restaurant_name,
            r.logo_url AS restaurant_logo,
            COALESCE((SELECT json_agg(json_build_object('id', oi.id, 'food_id', oi.food_id, 'food_name', oi.food_name, 'quantity', oi.quantity, 'unit_price', oi.unit_price, 'subtotal', oi.subtotal) ORDER BY oi.id ASC) FROM order_items oi WHERE oi.order_id = o.id), '[]'::json) AS items
        FROM orders o
        JOIN restaurants r
            ON r.id = o.restaurant_id
        WHERE o.customer_id = $1
        ORDER BY o.created_at DESC
        `,
        [customerId],
    );

    return result.rows;
}

/*
|--------------------------------------------------------------------------
| Customer - Get One Order
|--------------------------------------------------------------------------
*/

async function getOrderById(orderId, customerId) {
    const orderResult = await pool.query(
        `
        SELECT
            o.id,
            o.order_number,
            o.customer_id,
            o.restaurant_id,
            o.address_id,
            o.rider_id,
            o.status,
            o.delivery_address,
            o.delivery_city,
            o.recipient_name,
            o.recipient_phone,
            o.delivery_instructions,
            o.subtotal,
            o.delivery_fee,
            o.discount,
            o.total_amount,
            o.notes,
            o.placed_at,
            o.confirmed_at,
            o.preparing_at,
            o.ready_at,
            o.out_for_delivery_at,
            o.delivered_at,
            o.cancelled_at,
            o.created_at,
            o.updated_at,
            r.name AS restaurant_name,
            r.logo_url AS restaurant_logo,
            p.payment_method,
            p.payment_status
        FROM orders o
        JOIN restaurants r
            ON r.id = o.restaurant_id
        LEFT JOIN payments p
            ON p.order_id = o.id
        WHERE o.id = $1
          AND o.customer_id = $2
        LIMIT 1
        `,
        [orderId, customerId],
    );

    if (orderResult.rows.length === 0) {
        return null;
    }

    const order = orderResult.rows[0];

    const itemsResult = await pool.query(
        `
        SELECT
            oi.id,
            oi.order_id,
            oi.food_id,
            oi.food_name,
            oi.quantity,
            oi.unit_price,
            oi.subtotal,
            oi.created_at,
            f.image_url
        FROM order_items oi
        LEFT JOIN foods f
            ON f.id = oi.food_id
        WHERE oi.order_id = $1
        ORDER BY oi.id ASC
        `,
        [order.id],
    );

    order.items = itemsResult.rows;

    return order;
}

/*
|--------------------------------------------------------------------------
| Customer - Create Order
|--------------------------------------------------------------------------
*/

async function getCustomerCheckoutQuote(data) {
    const restaurantId = data?.restaurant_id;
    const items = data?.items;
    const destinationLatitude = validCoordinate(data?.delivery_latitude, -90, 90);
    const destinationLongitude = validCoordinate(data?.delivery_longitude, -180, 180);
    if (!restaurantId || !Array.isArray(items) || items.length === 0) {
        throw apiError("Restaurant and cart items are required");
    }
    const restaurantResult = await pool.query(
        `SELECT id, name, is_open, is_active, delivery_fee, minimum_order, latitude, longitude
           FROM restaurants WHERE id = $1 LIMIT 1`,
        [restaurantId],
    );
    const restaurant = restaurantResult.rows[0];
    if (!restaurant || !restaurant.is_active || !restaurant.is_open) {
        throw apiError("The selected restaurant is unavailable or closed", 409);
    }
    const ids = items.map(item => String(item.food_id ?? ""));
    if (ids.some(id => !/^[1-9][0-9]*$/.test(id))) {
        throw apiError("The cart contains an invalid food item");
    }
    const foodsResult = await pool.query(
        `SELECT id, restaurant_id, name, price, is_available, is_active
           FROM foods WHERE id = ANY($1::bigint[])`,
        [[...new Set(ids)]],
    );
    const foods = foodsResult.rows;
    if (foods.length !== new Set(ids).size) {
        throw apiError("One or more cart items are no longer available", 409);
    }
    let subtotal = 0;
    for (const requested of items) {
        const food = foods.find(item => String(item.id) === String(requested.food_id));
        const quantity = Number(requested.quantity);
        if (!food || String(food.restaurant_id) !== String(restaurantId) ||
            !food.is_active || !food.is_available) {
            throw apiError("A cart item is no longer available from this restaurant", 409);
        }
        if (!Number.isInteger(quantity) || quantity < 1 || quantity > 99) {
            throw apiError("Cart quantities must be between 1 and 99");
        }
        if (requested.expected_price != null &&
            Math.abs(Number(requested.expected_price) - Number(food.price)) > 0.009) {
            throw apiError(`${food.name} price has changed. Review your cart before checkout.`, 409);
        }
        subtotal += Number(food.price) * quantity;
    }
    if (subtotal < Number(restaurant.minimum_order || 0)) {
        throw apiError(`Minimum order amount is KSh ${Number(restaurant.minimum_order || 0).toFixed(2)}`);
    }
    const pricing = await calculateDeliveryPricing(pool, restaurant, destinationLatitude, destinationLongitude);
    return {
        restaurant_id: restaurant.id,
        restaurant_name: restaurant.name,
        subtotal: Math.round(subtotal * 100) / 100,
        delivery_distance_km: pricing.distanceKm,
        delivery_fee: pricing.deliveryFee,
        fee_per_km: pricing.feePerKm,
        total_amount: Math.round((subtotal + pricing.deliveryFee) * 100) / 100,
        currency: "KES",
    };
}

async function createOrder(customerId, data) {
    const {
        restaurant_id,
        delivery_address,
        delivery_city,
        recipient_name,
        delivery_phone,
        delivery_instructions,
        notes,
        items,
        address_id,
        delivery_latitude,
        delivery_longitude,
        expected_delivery_fee,
        payment_method,
        mpesa_checkout_session_id,
    } = data;

    const selectedPaymentMethod = String(payment_method || "cash").trim().toLowerCase();
    if (!["cash", "mpesa"].includes(selectedPaymentMethod)) {
        throw apiError("Payment method must be cash or mpesa");
    }

    if (!restaurant_id) {
        throw new Error("Restaurant ID is required");
    }

    if (!delivery_address) {
        throw new Error("Delivery address is required");
    }

    if (!delivery_city) {
        throw new Error("Delivery city is required");
    }

    if (!recipient_name) {
        throw new Error("Recipient name is required");
    }

    if (!delivery_phone) {
        throw new Error("Delivery phone is required");
    }

    if (!Array.isArray(items) || items.length === 0) {
        throw new Error("At least one food item is required");
    }

    const client = await pool.connect();

    try {
        await client.query("BEGIN");

        let savedAddress = null;
        if (address_id !== undefined && address_id !== null && address_id !== "") {
            if (!/^[1-9][0-9]*$/.test(String(address_id))) throw new Error("Selected delivery address is invalid");
            const addressResult = await client.query(
                "SELECT id, recipient_name, phone, address_line, city, delivery_instructions, latitude, longitude FROM addresses WHERE id = $1 AND user_id = $2 AND is_active = TRUE LIMIT 1",
                [address_id, customerId],
            );
            if (addressResult.rows.length === 0) throw new Error("Selected saved address was not found. Please choose another address.");
            savedAddress = addressResult.rows[0];
        }

        const restaurantResult = await client.query(
            `
            SELECT
                id,
                name,
                is_open,
                is_active,
                delivery_fee,
                minimum_order,
                latitude,
                longitude
            FROM restaurants
            WHERE id = $1
            LIMIT 1
            `,
            [restaurant_id],
        );

        if (restaurantResult.rows.length === 0) {
            throw new Error("Restaurant not found");
        }

        const restaurant = restaurantResult.rows[0];

        if (!restaurant.is_active) {
            throw new Error("Restaurant is currently unavailable");
        }

        if (!restaurant.is_open) {
            throw new Error("Restaurant is currently closed");
        }

        const requestedFoodIds = items.map((item) => item.food_id);

        const foodsResult = await client.query(
            `
            SELECT
                id,
                restaurant_id,
                name,
                price,
                is_available,
                is_active
            FROM foods
            WHERE id = ANY($1::bigint[])
            `,
            [requestedFoodIds],
        );

        const foods = foodsResult.rows;

        if (foods.length !== requestedFoodIds.length) {
            throw new Error("One or more food items were not found");
        }

        let subtotal = 0;
        const orderItems = [];

        for (const requestedItem of items) {
            const food = foods.find(
                (item) =>
                    String(item.id) === String(requestedItem.food_id),
            );

            if (!food) {
                throw new Error(
                    `Food item ${requestedItem.food_id} was not found`,
                );
            }

            if (
                String(food.restaurant_id) !==
                String(restaurant_id)
            ) {
                throw new Error(
                    `${food.name} does not belong to this restaurant`,
                );
            }

            if (!food.is_active) {
                throw new Error(`${food.name} is no longer available`);
            }

            if (!food.is_available) {
                throw new Error(`${food.name} is currently unavailable`);
            }

            const quantity = Number(requestedItem.quantity);

            if (!Number.isInteger(quantity) || quantity <= 0) {
                throw new Error(
                    `Invalid quantity for ${food.name}`,
                );
            }

            const unitPrice = Number(food.price);
            if (requestedItem.expected_price !== undefined && requestedItem.expected_price !== null) {
                const expectedPrice = Number(requestedItem.expected_price);
                if (!Number.isFinite(expectedPrice) || Math.abs(expectedPrice - unitPrice) > 0.009) {
                    const priceError = new Error(`${food.name} price has changed from KSh ${expectedPrice.toFixed(2)} to KSh ${unitPrice.toFixed(2)}. Review your cart and place the order again.`);
                    priceError.statusCode = 409;
                    throw priceError;
                }
            }
            const itemSubtotal = unitPrice * quantity;

            subtotal += itemSubtotal;

            orderItems.push({
                food_id: food.id,
                food_name: food.name,
                quantity,
                unit_price: unitPrice,
                subtotal: itemSubtotal,
            });
        }

        const destinationLatitude = validCoordinate(savedAddress ? savedAddress.latitude : delivery_latitude, -90, 90);
        const destinationLongitude = validCoordinate(savedAddress ? savedAddress.longitude : delivery_longitude, -180, 180);
        const pricing = await calculateDeliveryPricing(client, restaurant, destinationLatitude, destinationLongitude);
        const deliveryFee = pricing.deliveryFee;
        if (expected_delivery_fee !== undefined && expected_delivery_fee !== null && expected_delivery_fee !== "") {
            const expectedFee = Number(expected_delivery_fee);
            if (!Number.isFinite(expectedFee) || Math.abs(expectedFee - deliveryFee) > 0.009) {
                const feeError = new Error(`Delivery fee has changed from KSh ${expectedFee.toFixed(2)} to KSh ${deliveryFee.toFixed(2)}. Review your cart and place the order again.`);
                feeError.statusCode = 409;
                throw feeError;
            }
        }
        const discount = 0;
        const totalAmount = subtotal + deliveryFee - discount;

        const minimumOrder = Number(
            restaurant.minimum_order || 0,
        );

        if (subtotal < minimumOrder) {
            throw new Error(
                `Minimum order amount is ${minimumOrder.toFixed(2)}`,
            );
        }

        const orderNumber = generateOrderNumber();

        const orderResult = await client.query(
            `
            INSERT INTO orders (
                order_number,
                customer_id,
                restaurant_id,
                address_id,
                delivery_latitude,
                delivery_longitude,
                status,
                delivery_address,
                delivery_city,
                recipient_name,
                recipient_phone,
                delivery_instructions,
                subtotal,
                delivery_fee,
                discount,
                total_amount,
                notes,
                mpesa_checkout_session_id,
                placed_at
            )
            VALUES (
                $1,
                $2,
                $3,
                $4,
                $5,
                $6,
                'pending',
                $7,
                $8,
                $9,
                $10,
                $11,
                $12,
                $13,
                $14,
                $15,
                $16,
                $17,
                CURRENT_TIMESTAMP
            )
            RETURNING *
            `,
            [
                orderNumber,
                customerId,
                restaurant_id,
                savedAddress ? savedAddress.id : null,
                savedAddress ? savedAddress.latitude : (Number.isFinite(Number(delivery_latitude)) && delivery_latitude !== null && delivery_latitude !== "" ? Number(delivery_latitude) : null),
                savedAddress ? savedAddress.longitude : (Number.isFinite(Number(delivery_longitude)) && delivery_longitude !== null && delivery_longitude !== "" ? Number(delivery_longitude) : null),
                savedAddress ? savedAddress.address_line : delivery_address,
                savedAddress ? savedAddress.city : delivery_city,
                savedAddress ? savedAddress.recipient_name : recipient_name,
                savedAddress ? savedAddress.phone : delivery_phone,
                savedAddress ? (savedAddress.delivery_instructions || delivery_instructions || null) : (delivery_instructions || null),
                subtotal,
                deliveryFee,
                discount,
                totalAmount,
                notes || null,
                mpesa_checkout_session_id || null,
            ],
        );

        const order = orderResult.rows[0];

        for (const item of orderItems) {
            await client.query(
                `
                INSERT INTO order_items (
                    order_id,
                    food_id,
                    food_name,
                    quantity,
                    unit_price,
                    subtotal
                )
                VALUES (
                    $1,
                    $2,
                    $3,
                    $4,
                    $5,
                    $6
                )
                `,
                [
                    order.id,
                    item.food_id,
                    item.food_name,
                    item.quantity,
                    item.unit_price,
                    item.subtotal,
                ],
            );
        }

        // Persist the selected payment before returning the created order.
        // M-Pesa remains processing/pending until the provider callback confirms it.
        await client.query(
            `INSERT INTO payments (order_id, payment_method, payment_status, amount, phone_number)
             VALUES ($1, $2, 'pending', $3, $4)`,
            [order.id, selectedPaymentMethod, totalAmount, selectedPaymentMethod === "mpesa" ? delivery_phone : null],
        );

        await client.query("COMMIT");

        return getOrderById(order.id, customerId);
    } catch (error) {
        await client.query("ROLLBACK").catch(() => {});
        throw error;
    } finally {
        client.release();
    }
}

/*
|--------------------------------------------------------------------------
| Restaurant - Get Orders
|--------------------------------------------------------------------------
*/

async function getRestaurantOrders(ownerId) {
    const restaurantResult = await pool.query(
        `
        SELECT
            id,
            name
        FROM restaurants
        WHERE owner_id = $1
          AND is_active = TRUE
        LIMIT 1
        `,
        [ownerId],
    );

    if (restaurantResult.rows.length === 0) {
        throw new Error("Restaurant profile not found");
    }

    const restaurant = restaurantResult.rows[0];

    const result = await pool.query(
        `
        SELECT
            o.id,
            o.order_number,
            o.customer_id,
            o.restaurant_id,
            o.rider_id,
            o.address_id,
            o.status,
            o.delivery_address,
            o.delivery_city,
            o.recipient_name,
            o.recipient_phone,
            o.delivery_instructions,
            o.subtotal,
            o.delivery_fee,
            o.discount,
            o.total_amount,
            o.notes,
            o.placed_at,
            o.confirmed_at,
            o.preparing_at,
            o.ready_at,
            o.out_for_delivery_at,
            o.delivered_at,
            o.cancelled_at,
            o.created_at,
            o.updated_at,
            (
                SELECT COALESCE(SUM(oi.quantity), 0)::int
                FROM order_items oi
                WHERE oi.order_id = o.id
            ) AS item_count,
            u.first_name AS customer_first_name,
            u.last_name AS customer_last_name,
            u.email AS customer_email,
            u.phone AS customer_phone
        FROM orders o
        JOIN users u
            ON u.id = o.customer_id
        WHERE o.restaurant_id = $1
        ORDER BY o.created_at DESC
        `,
        [restaurant.id],
    );

    return result.rows;
}

/*
|--------------------------------------------------------------------------
| Restaurant - Get One Order
|--------------------------------------------------------------------------
*/

async function getRestaurantOrder(orderId, ownerId) {
    const restaurantResult = await pool.query(
        `
        SELECT
            id,
            name
        FROM restaurants
        WHERE owner_id = $1
          AND is_active = TRUE
        LIMIT 1
        `,
        [ownerId],
    );

    if (restaurantResult.rows.length === 0) {
        throw new Error("Restaurant profile not found");
    }

    const restaurant = restaurantResult.rows[0];

    const orderResult = await pool.query(
        `
        SELECT
            o.id,
            o.order_number,
            o.customer_id,
            o.restaurant_id,
            o.rider_id,
            o.address_id,
            o.status,
            o.delivery_address,
            o.delivery_city,
            o.recipient_name,
            o.recipient_phone,
            o.delivery_instructions,
            o.subtotal,
            o.delivery_fee,
            o.discount,
            o.total_amount,
            o.notes,
            o.placed_at,
            o.confirmed_at,
            o.preparing_at,
            o.ready_at,
            o.out_for_delivery_at,
            o.delivered_at,
            o.cancelled_at,
            o.created_at,
            o.updated_at,
            u.first_name AS customer_first_name,
            u.last_name AS customer_last_name,
            u.email AS customer_email,
            u.phone AS customer_phone,
            r.name AS restaurant_name,
            r.logo_url AS restaurant_logo
        FROM orders o
        JOIN users u
            ON u.id = o.customer_id
        JOIN restaurants r
            ON r.id = o.restaurant_id
        WHERE o.id = $1
          AND o.restaurant_id = $2
        LIMIT 1
        `,
        [orderId, restaurant.id],
    );

    if (orderResult.rows.length === 0) {
        return null;
    }

    const order = orderResult.rows[0];

    const itemsResult = await pool.query(
        `
        SELECT
            oi.id,
            oi.order_id,
            oi.food_id,
            oi.food_name,
            oi.quantity,
            oi.unit_price,
            oi.subtotal,
            oi.created_at,
            f.image_url
        FROM order_items oi
        LEFT JOIN foods f
            ON f.id = oi.food_id
        WHERE oi.order_id = $1
        ORDER BY oi.id ASC
        `,
        [order.id],
    );

    order.items = itemsResult.rows;

    return order;
}

/*
|--------------------------------------------------------------------------
| Restaurant - Update Order Status
|--------------------------------------------------------------------------
*/

async function updateOrderStatus(orderId, ownerId, newStatus) {
    const restaurantResult = await pool.query(
        `
        SELECT
            id,
            name
        FROM restaurants
        WHERE owner_id = $1
          AND is_active = TRUE
        LIMIT 1
        `,
        [ownerId],
    );

    if (restaurantResult.rows.length === 0) {
        throw new Error("Restaurant profile not found");
    }

    const restaurant = restaurantResult.rows[0];

    const allowedStatuses = [
        "confirmed",
        "preparing",
        "ready",
    ];

    if (!allowedStatuses.includes(newStatus)) {
        throw new Error("Invalid order status");
    }

    const currentOrderResult = await pool.query(
        `
        SELECT
            id,
            status
        FROM orders
        WHERE id = $1
          AND restaurant_id = $2
        LIMIT 1
        `,
        [orderId, restaurant.id],
    );

    if (currentOrderResult.rows.length === 0) {
        throw new Error("Order not found");
    }

    const currentStatus =
        currentOrderResult.rows[0].status;

    const validTransitions = {
        pending: ["confirmed"],
        confirmed: ["preparing"],
        preparing: ["ready"],
        ready: [],
    };

    if (
        !validTransitions[currentStatus] ||
        !validTransitions[currentStatus].includes(newStatus)
    ) {
        throw new Error(
            `Cannot change order status from ${currentStatus} to ${newStatus}`,
        );
    }

    const timestampMap = {
        confirmed: "confirmed_at",
        preparing: "preparing_at",
        ready: "ready_at",
    };

    const timestampColumn = timestampMap[newStatus];

    const result = await pool.query(
        `
        UPDATE orders
        SET
            status = $1,
            ${timestampColumn} = CURRENT_TIMESTAMP,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $2
          AND restaurant_id = $3
        RETURNING *
        `,
        [newStatus, orderId, restaurant.id],
    );

    return result.rows[0];
}

/*
|--------------------------------------------------------------------------
| Admin - Get All Orders
|--------------------------------------------------------------------------
*/

async function getAllOrders(options = {}) {
    const search = String(options.search ?? "").trim();

    const status = String(options.status ?? "")
        .trim()
        .toLowerCase();

    const restaurantId = parsePositiveInteger(
        options.restaurantId,
        "restaurant_id",
    );

    const customerId = parsePositiveInteger(
        options.customerId,
        "customer_id",
    );

    const dateFrom = parseOrderFilterDate(
        options.dateFrom,
        "date_from",
    );

    const dateTo = parseOrderFilterDate(
        options.dateTo,
        "date_to",
    );

    if (
        status &&
        !ORDER_STATUS_VALUES.includes(status)
    ) {
        throw apiError(
            `Invalid status. Use one of: ${ORDER_STATUS_VALUES.join(", ")}`,
        );
    }

    if (dateFrom && dateTo && dateFrom > dateTo) {
        throw apiError(
            "date_from cannot be after date_to",
        );
    }

    const requestedLimit = Number.parseInt(
        options.limit,
        10,
    );

    const requestedPage = Number.parseInt(
        options.page,
        10,
    );

    const limit =
        Number.isInteger(requestedLimit) &&
        requestedLimit > 0
            ? Math.min(requestedLimit, 100)
            : 6;

    const page =
        Number.isInteger(requestedPage) &&
        requestedPage > 0
            ? requestedPage
            : 1;

    const offset = (page - 1) * limit;

    const values = [];
    const conditions = [];

    if (search) {
        const escapedSearch = search.replace(
            /[\\%_]/g,
            "\\$&",
        );

        values.push(`%${escapedSearch}%`);

        const placeholder = `$${values.length}`;

        conditions.push(`
            (
                o.order_number ILIKE ${placeholder}
                ESCAPE '\\'
                OR CONCAT(
                    u.first_name,
                    ' ',
                    u.last_name
                ) ILIKE ${placeholder}
                ESCAPE '\\'
                OR u.email ILIKE ${placeholder}
                ESCAPE '\\'
                OR COALESCE(
                    u.phone,
                    ''
                ) ILIKE ${placeholder}
                ESCAPE '\\'
                OR r.name ILIKE ${placeholder}
                ESCAPE '\\'
                OR COALESCE(
                    o.recipient_name,
                    ''
                ) ILIKE ${placeholder}
                ESCAPE '\\'
                OR COALESCE(
                    o.recipient_phone,
                    ''
                ) ILIKE ${placeholder}
                ESCAPE '\\'
            )
        `);
    }

    if (status) {
        values.push(status);

        conditions.push(
            `o.status = $${values.length}`,
        );
    }

    if (restaurantId) {
        values.push(restaurantId);

        conditions.push(
            `o.restaurant_id = $${values.length}`,
        );
    }

    if (customerId) {
        values.push(customerId);

        conditions.push(
            `o.customer_id = $${values.length}`,
        );
    }

    if (dateFrom) {
        values.push(dateFrom);

        conditions.push(
            `o.placed_at >= $${values.length}::date`,
        );
    }

    if (dateTo) {
        values.push(dateTo);

        conditions.push(
            `o.placed_at < ($${values.length}::date + 1)`,
        );
    }

    const filter =
        conditions.length > 0
            ? conditions.join(" AND ")
            : "TRUE";

    const client = await pool.connect();

    try {
        await client.query("BEGIN READ ONLY");

        await client.query(
            "SELECT set_config('TimeZone', $1, true)",
            [ORDER_FILTER_TIME_ZONE],
        );

        const statsResult = await client.query(
            `
            SELECT

                COUNT(*)::int
                    AS total,

                COUNT(*) FILTER (
                    WHERE o.status = 'pending'
                )::int
                    AS pending,

                COUNT(*) FILTER (
                    WHERE o.status = 'confirmed'
                )::int
                    AS confirmed,

                COUNT(*) FILTER (
                    WHERE o.status = 'preparing'
                )::int
                    AS preparing,

                COUNT(*) FILTER (
                    WHERE o.status = 'ready'
                )::int
                    AS ready,

                COUNT(*) FILTER (
                    WHERE o.status = 'out_for_delivery'
                )::int
                    AS out_for_delivery,

                COUNT(*) FILTER (
                    WHERE o.status = 'delivered'
                )::int
                    AS delivered,

                COUNT(*) FILTER (
                    WHERE o.status = 'cancelled'
                )::int
                    AS cancelled,

                COUNT(*) FILTER (
                    WHERE o.status IN (
                        'confirmed',
                        'preparing',
                        'ready',
                        'out_for_delivery'
                    )
                )::int
                    AS in_progress,

                COUNT(*) FILTER (
                    WHERE ${filter}
                )::int
                    AS filtered

            FROM orders o

            JOIN users u
                ON u.id = o.customer_id

            JOIN restaurants r
                ON r.id = o.restaurant_id
            `,
            values,
        );

        const dataResult = await client.query(
            `
            SELECT

                o.id,
                o.order_number,

                o.customer_id,
                o.restaurant_id,
                o.rider_id,

                o.status,

                o.delivery_address,
                o.delivery_city,

                o.recipient_name,
                o.recipient_phone,

                o.delivery_instructions,

                o.subtotal,
                o.delivery_fee,
                o.discount,
                o.total_amount,

                o.notes,

                o.placed_at,
                o.confirmed_at,
                o.preparing_at,
                o.ready_at,
                o.out_for_delivery_at,
                o.delivered_at,
                o.cancelled_at,

                o.created_at,
                o.updated_at,

                u.first_name
                    AS customer_first_name,

                u.last_name
                    AS customer_last_name,

                u.email
                    AS customer_email,

                u.phone
                    AS customer_phone,

                r.name
                    AS restaurant_name,

                rider.first_name
                    AS rider_first_name,

                rider.last_name
                    AS rider_last_name,

                (
                    SELECT COUNT(*)::int
                    FROM order_items oi
                    WHERE oi.order_id = o.id
                )
                    AS item_count

            FROM orders o

            JOIN users u
                ON u.id = o.customer_id

            JOIN restaurants r
                ON r.id = o.restaurant_id

            LEFT JOIN users rider
                ON rider.id = o.rider_id

            WHERE ${filter}

            ORDER BY
                o.created_at DESC,
                o.id DESC

            LIMIT $${values.length + 1}

            OFFSET $${values.length + 2}
            `,
            [
                ...values,
                limit,
                offset,
            ],
        );

        await client.query("COMMIT");

        const stats = statsResult.rows[0];

        return {
            orders: dataResult.rows,

            pagination: {
                page,
                limit,
                totalItems: Number(stats.filtered),
                totalPages: Math.max(
                    1,
                    Math.ceil(
                        Number(stats.filtered) / limit,
                    ),
                ),
            },

            statistics: {
                total: Number(stats.total),
                pending: Number(stats.pending),
                confirmed: Number(stats.confirmed),
                preparing: Number(stats.preparing),
                ready: Number(stats.ready),
                outForDelivery: Number(
                    stats.out_for_delivery,
                ),
                inProgress: Number(stats.in_progress),
                delivered: Number(stats.delivered),
                cancelled: Number(stats.cancelled),
            },
        };
    } catch (error) {
        await client.query("ROLLBACK").catch(() => {});
        throw error;
    } finally {
        client.release();
    }
}

/*
|--------------------------------------------------------------------------
| Admin - Get One Order
|--------------------------------------------------------------------------
*/

async function getOrderByIdForAdmin(orderId) {
    const validOrderId = parsePositiveInteger(
        orderId,
        "Order ID",
    );

    const orderResult = await pool.query(
        `
        SELECT

            o.*,

            u.first_name
                AS customer_first_name,

            u.last_name
                AS customer_last_name,

            u.email
                AS customer_email,

            u.phone
                AS customer_phone,

            r.name
                AS restaurant_name,

            r.logo_url
                AS restaurant_logo,

            rider.first_name
                AS rider_first_name,

            rider.last_name
                AS rider_last_name,

            rider.phone
                AS rider_phone

        FROM orders o

        JOIN users u
            ON u.id = o.customer_id

        JOIN restaurants r
            ON r.id = o.restaurant_id

        LEFT JOIN users rider
            ON rider.id = o.rider_id

        WHERE o.id = $1

        LIMIT 1
        `,
        [validOrderId],
    );

    if (orderResult.rows.length === 0) {
        return null;
    }

    const order = orderResult.rows[0];

    const itemsResult = await pool.query(
        `
        SELECT
            oi.id,
            oi.order_id,
            oi.food_id,
            oi.food_name,
            oi.quantity,
            oi.unit_price,
            oi.subtotal,
            oi.created_at,
            f.image_url
        FROM order_items oi
        LEFT JOIN foods f
            ON f.id = oi.food_id
        WHERE oi.order_id = $1
        ORDER BY oi.id ASC
        `,
        [order.id],
    );

    order.items = itemsResult.rows;

    return order;
}

/*
|--------------------------------------------------------------------------
| Admin - Status Update
|--------------------------------------------------------------------------
*/

async function adminUpdateOrderStatus(
    orderId,
    newStatus,
    adminId,
    reason = null,
) {
    const validOrderId = parsePositiveInteger(
        orderId,
        "Order ID",
    );

    const status = String(newStatus || "")
        .trim()
        .toLowerCase();

    const normalizedReason = validateAdminReason(
        reason,
        false,
    );

    if (!ORDER_STATUS_VALUES.includes(status)) {
        throw apiError("Invalid order status");
    }

    const client = await pool.connect();

    try {
        await client.query("BEGIN");

        const currentOrderResult =
            await client.query(
                `
                SELECT
                    id,
                    status
                FROM orders
                WHERE id = $1
                FOR UPDATE
                `,
                [validOrderId],
            );

        if (currentOrderResult.rows.length === 0) {
            throw apiError("Order not found", 404);
        }

        const currentStatus =
            currentOrderResult.rows[0].status;

        if (currentStatus === status) {
            throw apiError(
                `Order is already ${status}`,
            );
        }

        const allowedTransitions =
            ADMIN_ORDER_TRANSITIONS[currentStatus];

        if (
            !allowedTransitions ||
            !allowedTransitions.includes(status)
        ) {
            throw apiError(
                `Cannot change order status from ${currentStatus} to ${status}`,
            );
        }

        const timestampMap = {
            confirmed: "confirmed_at",
            preparing: "preparing_at",
            ready: "ready_at",
            out_for_delivery:
                "out_for_delivery_at",
            delivered: "delivered_at",
            cancelled: "cancelled_at",
        };

        const timestampColumn =
            timestampMap[status];

        const timestampSql = timestampColumn
            ? `, ${timestampColumn} = CURRENT_TIMESTAMP`
            : "";

        const result = await client.query(
            `
            UPDATE orders
            SET
                status = $1
                ${timestampSql},
                updated_at = CURRENT_TIMESTAMP
            WHERE id = $2
            RETURNING *
            `,
            [status, validOrderId],
        );

        if (result.rows.length === 0) {
            throw apiError(
                "Order could not be updated",
                409,
            );
        }

        const updatedOrder = result.rows[0];

        updatedOrder.admin_action = {
            admin_id: adminId ?? null,
            reason: normalizedReason,
        };

        await client.query("COMMIT");

        return updatedOrder;
    } catch (error) {
        await client.query("ROLLBACK").catch(() => {});
        throw error;
    } finally {
        client.release();
    }
}

/*
|--------------------------------------------------------------------------
| Admin - Cancel Order
|--------------------------------------------------------------------------
*/

async function adminCancelOrder(
    orderId,
    adminId,
    reason,
) {
    const validOrderId = parsePositiveInteger(
        orderId,
        "Order ID",
    );

    const normalizedReason =
        validateAdminReason(reason, true);

    const client = await pool.connect();

    try {
        await client.query("BEGIN");

        const currentOrderResult =
            await client.query(
                `
                SELECT
                    id,
                    status
                FROM orders
                WHERE id = $1
                FOR UPDATE
                `,
                [validOrderId],
            );

        if (currentOrderResult.rows.length === 0) {
            throw apiError("Order not found", 404);
        }

        const currentStatus =
            currentOrderResult.rows[0].status;

        if (currentStatus === "delivered") {
            throw apiError(
                "Delivered orders cannot be cancelled",
            );
        }

        if (currentStatus === "cancelled") {
            throw apiError(
                "Order is already cancelled",
            );
        }

        const cancellableStatuses = [
            "pending",
            "confirmed",
            "preparing",
            "ready",
            "out_for_delivery",
        ];

        if (
            !cancellableStatuses.includes(
                currentStatus,
            )
        ) {
            throw apiError(
                `Order cannot be cancelled from ${currentStatus} status`,
            );
        }

        const result = await client.query(
            `
            UPDATE orders
            SET
                status = 'cancelled',
                cancelled_at = CURRENT_TIMESTAMP,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = $1
            RETURNING *
            `,
            [validOrderId],
        );

        if (result.rows.length === 0) {
            throw apiError(
                "Order could not be cancelled",
                409,
            );
        }

        const cancelledOrder = result.rows[0];

        cancelledOrder.admin_action = {
            admin_id: adminId ?? null,
            reason: normalizedReason,
        };

        await client.query("COMMIT");

        return cancelledOrder;
    } catch (error) {
        await client.query("ROLLBACK").catch(() => {});
        throw error;
    } finally {
        client.release();
    }
}

/*
|--------------------------------------------------------------------------
| Admin - Quick Order Summary
|--------------------------------------------------------------------------
*/

async function getAdminOrderSummary() {
    const client = await pool.connect();

    try {
        await client.query(
            "SELECT set_config('TimeZone', $1, true)",
            [ORDER_FILTER_TIME_ZONE],
        );

        const result = await client.query(
            `
            SELECT

                COUNT(*) FILTER (
                    WHERE
                        o.placed_at >= CURRENT_DATE
                        AND o.placed_at < CURRENT_DATE + 1
                        AND o.status = 'pending'
                )::int AS pending,

                COUNT(*) FILTER (
                    WHERE
                        o.placed_at >= CURRENT_DATE
                        AND o.placed_at < CURRENT_DATE + 1
                        AND o.status = 'preparing'
                )::int AS preparing,

                COUNT(*) FILTER (
                    WHERE
                        o.placed_at >= CURRENT_DATE
                        AND o.placed_at < CURRENT_DATE + 1
                        AND o.status = 'out_for_delivery'
                )::int AS out_for_delivery,

                COUNT(*) FILTER (
                    WHERE
                        o.placed_at >= CURRENT_DATE
                        AND o.placed_at < CURRENT_DATE + 1
                        AND o.status = 'delivered'
                )::int AS delivered,

                COUNT(*) FILTER (
                    WHERE
                        o.placed_at >= CURRENT_DATE
                        AND o.placed_at < CURRENT_DATE + 1
                )::int AS total_today,

                COALESCE(
                    SUM(
                        CASE
                            WHEN
                                o.placed_at >= CURRENT_DATE
                                AND o.placed_at < CURRENT_DATE + 1
                                AND o.status <> 'cancelled'
                            THEN o.total_amount
                            ELSE 0
                        END
                    ),
                    0
                ) AS today_revenue,

                COALESCE(
                    SUM(
                        CASE
                            WHEN
                                o.placed_at >= CURRENT_DATE - 1
                                AND o.placed_at < CURRENT_DATE
                                AND o.status <> 'cancelled'
                            THEN o.total_amount
                            ELSE 0
                        END
                    ),
                    0
                ) AS yesterday_revenue

            FROM orders o
            `,
        );

        const row = result.rows[0];

        const todayRevenue =
            Number(row.today_revenue || 0);

        const yesterdayRevenue =
            Number(row.yesterday_revenue || 0);

        const change =
            yesterdayRevenue === 0
                ? todayRevenue === 0
                    ? 0
                    : 100
                : (
                      ((todayRevenue -
                          yesterdayRevenue) /
                          yesterdayRevenue) *
                      100
                  );

        return {
            todayStatus: {
                pending: Number(row.pending || 0),
                preparing: Number(row.preparing || 0),
                delivery: Number(
                    row.out_for_delivery || 0,
                ),
                delivered: Number(
                    row.delivered || 0,
                ),
            },

            revenue: {
                today: todayRevenue,
                yesterday: yesterdayRevenue,
                change: Number(change.toFixed(1)),
                target: 45000,
            },

            totalToday: Number(row.total_today || 0),
        };
    } finally {
        client.release();
    }
}

/*
|--------------------------------------------------------------------------
| Admin - Form Options
|--------------------------------------------------------------------------
*/

async function getAdminOrderFormOptions(
    restaurantId = null,
) {
    const validRestaurantId =
        restaurantId === null ||
        restaurantId === undefined ||
        restaurantId === ""
            ? null
            : parsePositiveInteger(
                  restaurantId,
                  "restaurant_id",
              );

    const [
        customersResult,
        restaurantsResult,
        ridersResult,
    ] = await Promise.all([
        pool.query(
            `
            SELECT
                id,
                first_name,
                last_name,
                email,
                phone
            FROM users
            WHERE role = 'customer'
              AND is_active = TRUE
            ORDER BY created_at DESC
            LIMIT 500
            `,
        ),

        pool.query(
            `
            SELECT
                id,
                name,
                city,
                is_open,
                delivery_fee,
                minimum_order
            FROM restaurants
            WHERE is_active = TRUE
            ORDER BY name ASC
            LIMIT 500
            `,
        ),

        pool.query(
            `
            SELECT
                id,
                first_name,
                last_name,
                phone
            FROM users
            WHERE role = 'rider'
              AND is_active = TRUE
            ORDER BY first_name ASC, last_name ASC
            LIMIT 500
            `,
        ),
    ]);

    let foods = [];

    if (validRestaurantId) {
        const foodsResult = await pool.query(
            `
            SELECT
                id,
                restaurant_id,
                category_id,
                name,
                description,
                price,
                image_url,
                is_available,
                is_active
            FROM foods
            WHERE restaurant_id = $1
              AND is_active = TRUE
              AND is_available = TRUE
            ORDER BY name ASC
            LIMIT 500
            `,
            [validRestaurantId],
        );

        foods = foodsResult.rows;
    }

    return {
        customers: customersResult.rows,
        restaurants: restaurantsResult.rows,
        riders: ridersResult.rows,
        foods,
    };
}

/*
|--------------------------------------------------------------------------
| Admin - Create Order
|--------------------------------------------------------------------------
*/

async function createAdminOrder(data, adminId) {
    const {
        customer_id,
        restaurant_id,
        rider_id,
        delivery_address,
        delivery_city,
        recipient_name,
        recipient_phone,
        delivery_instructions,
        notes,
        payment_method,
        items,
    } = data || {};

    const customerId =
        parsePositiveInteger(
            customer_id,
            "customer_id",
        );

    const restaurantId =
        parsePositiveInteger(
            restaurant_id,
            "restaurant_id",
        );

    const riderId =
        rider_id === null ||
        rider_id === undefined ||
        rider_id === ""
            ? null
            : parsePositiveInteger(
                  rider_id,
                  "rider_id",
              );

    const paymentMethod = String(payment_method || "")
        .trim()
        .toLowerCase();

    if (!["mpesa", "cash", "card"].includes(paymentMethod)) {
        throw apiError(
            "Select a valid payment method: M-Pesa, cash, or card",
        );
    }

    if (!customerId) {
        throw apiError("Customer is required");
    }

    if (!restaurantId) {
        throw apiError("Restaurant is required");
    }

    if (
        !delivery_address ||
        !String(delivery_address).trim()
    ) {
        throw apiError(
            "Delivery address is required",
        );
    }

    if (
        !delivery_city ||
        !String(delivery_city).trim()
    ) {
        throw apiError(
            "Delivery city is required",
        );
    }

    if (
        !recipient_name ||
        !String(recipient_name).trim()
    ) {
        throw apiError(
            "Recipient name is required",
        );
    }

    if (
        !recipient_phone ||
        !String(recipient_phone).trim()
    ) {
        throw apiError(
            "Recipient phone is required",
        );
    }

    if (!Array.isArray(items) || items.length === 0) {
        throw apiError(
            "At least one food item is required",
        );
    }

    /*
     * Combine duplicate food IDs into one line.
     */

    const combinedItems = new Map();

    for (const item of items) {
        const foodId =
            parsePositiveInteger(
                item?.food_id,
                "food_id",
            );

        const quantity = Number(
            item?.quantity,
        );

        if (!foodId) {
            throw apiError(
                "Every order item must have a valid food_id",
            );
        }

        if (
            !Number.isInteger(quantity) ||
            quantity <= 0
        ) {
            throw apiError(
                `Invalid quantity for food ${foodId}`,
            );
        }

        combinedItems.set(
            String(foodId),
            (combinedItems.get(
                String(foodId),
            ) || 0) + quantity,
        );
    }

    const normalizedItems =
        Array.from(
            combinedItems.entries(),
        ).map(([foodId, quantity]) => ({
            food_id: foodId,
            quantity,
        }));

    const client = await pool.connect();

    try {
        await client.query("BEGIN");

        /*
         * Verify customer.
         */

        const customerResult =
            await client.query(
                `
                SELECT
                    id,
                    first_name,
                    last_name,
                    email,
                    phone
                FROM users
                WHERE id = $1
                  AND role = 'customer'
                  AND is_active = TRUE
                LIMIT 1
                `,
                [customerId],
            );

        if (customerResult.rows.length === 0) {
            throw apiError(
                "Customer not found or inactive",
            );
        }

        /*
         * Verify restaurant.
         */

        const restaurantResult =
            await client.query(
                `
                SELECT
                    id,
                    name,
                    is_open,
                    is_active,
                    delivery_fee,
                    minimum_order
                FROM restaurants
                WHERE id = $1
                LIMIT 1
                `,
                [restaurantId],
            );

        if (restaurantResult.rows.length === 0) {
            throw apiError(
                "Restaurant not found",
            );
        }

        const restaurant =
            restaurantResult.rows[0];

        if (!restaurant.is_active) {
            throw apiError(
                "Restaurant is inactive",
            );
        }

        if (!restaurant.is_open) {
            throw apiError(
                "Restaurant is currently closed",
            );
        }

        /*
         * Verify rider when supplied.
         */

        if (riderId) {
            const riderResult =
                await client.query(
                    `
                    SELECT
                        id,
                        first_name,
                        last_name,
                        phone
                    FROM users
                    WHERE id = $1
                      AND role = 'rider'
                      AND is_active = TRUE
                    LIMIT 1
                    `,
                    [riderId],
                );

            if (riderResult.rows.length === 0) {
                throw apiError(
                    "Rider not found or inactive",
                );
            }
        }

        /*
         * Fetch foods belonging to the restaurant.
         */

        const foodIds =
            normalizedItems.map(
                (item) => item.food_id,
            );

        const foodsResult =
            await client.query(
                `
                SELECT
                    id,
                    restaurant_id,
                    name,
                    price,
                    is_available,
                    is_active
                FROM foods
                WHERE id = ANY($1::bigint[])
                `,
                [foodIds],
            );

        const foods = foodsResult.rows;

        if (
            foods.length !==
            normalizedItems.length
        ) {
            throw apiError(
                "One or more selected foods were not found",
            );
        }

        let subtotal = 0;

        const orderItems = [];

        for (const requestedItem of normalizedItems) {
            const food = foods.find(
                (item) =>
                    String(item.id) ===
                    String(
                        requestedItem.food_id,
                    ),
            );

            if (!food) {
                throw apiError(
                    `Food ${requestedItem.food_id} was not found`,
                );
            }

            if (
                String(food.restaurant_id) !==
                String(restaurantId)
            ) {
                throw apiError(
                    `${food.name} does not belong to the selected restaurant`,
                );
            }

            if (!food.is_active) {
                throw apiError(
                    `${food.name} is inactive`,
                );
            }

            if (!food.is_available) {
                throw apiError(
                    `${food.name} is currently unavailable`,
                );
            }

            const unitPrice =
                Number(food.price);

            const quantity =
                Number(requestedItem.quantity);

            const itemSubtotal =
                unitPrice * quantity;

            subtotal += itemSubtotal;

            orderItems.push({
                food_id: food.id,
                food_name: food.name,
                quantity,
                unit_price: unitPrice,
                subtotal: itemSubtotal,
            });
        }

        const deliveryFee =
            Number(
                restaurant.delivery_fee || 0,
            );

        const discount = 0;

        const totalAmount =
            subtotal +
            deliveryFee -
            discount;

        const minimumOrder =
            Number(
                restaurant.minimum_order ||
                    0,
            );

        if (subtotal < minimumOrder) {
            throw apiError(
                `Minimum order amount is ${minimumOrder.toFixed(2)}`,
            );
        }

        const orderNumber =
            generateOrderNumber();

        const orderResult =
            await client.query(
                `
                INSERT INTO orders (
                    order_number,
                    customer_id,
                    restaurant_id,
                    rider_id,
                    status,
                    delivery_address,
                    delivery_city,
                    recipient_name,
                    recipient_phone,
                    delivery_instructions,
                    subtotal,
                    delivery_fee,
                    discount,
                    total_amount,
                    notes,
                    placed_at
                )
                VALUES (
                    $1,
                    $2,
                    $3,
                    $4,
                    'pending',
                    $5,
                    $6,
                    $7,
                    $8,
                    $9,
                    $10,
                    $11,
                    $12,
                    $13,
                    $14,
                    CURRENT_TIMESTAMP
                )
                RETURNING id
                `,
                [
                    orderNumber,
                    customerId,
                    restaurantId,
                    riderId,
                    String(
                        delivery_address,
                    ).trim(),
                    String(
                        delivery_city,
                    ).trim(),
                    String(
                        recipient_name,
                    ).trim(),
                    String(
                        recipient_phone,
                    ).trim(),
                    delivery_instructions
                        ? String(
                              delivery_instructions,
                          ).trim()
                        : null,
                    subtotal,
                    deliveryFee,
                    discount,
                    totalAmount,
                    notes
                        ? String(notes).trim()
                        : null,
                ],
            );

        const orderId =
            orderResult.rows[0].id;

        for (const item of orderItems) {
            await client.query(
                `
                INSERT INTO order_items (
                    order_id,
                    food_id,
                    food_name,
                    quantity,
                    unit_price,
                    subtotal
                )
                VALUES (
                    $1,
                    $2,
                    $3,
                    $4,
                    $5,
                    $6
                )
                `,
                [
                    orderId,
                    item.food_id,
                    item.food_name,
                    item.quantity,
                    item.unit_price,
                    item.subtotal,
                ],
            );
        }

        /*
         * Every admin-created order must have a payment record so it appears
         * in payment reconciliation and restaurant earnings. Keep it pending:
         * creating an order does not prove that money has been received.
         */
        await client.query(
            `
            INSERT INTO payments (
                order_id,
                payment_method,
                payment_status,
                amount
            )
            VALUES ($1, $2, 'pending', $3)
            ON CONFLICT (order_id) DO NOTHING
            `,
            [orderId, paymentMethod, totalAmount],
        );

        await client.query("COMMIT");

        const createdOrder =
            await getOrderByIdForAdmin(
                orderId,
            );

        if (createdOrder) {
            createdOrder.admin_action = {
                admin_id: adminId ?? null,
                action: "create",
            };
        }

        return createdOrder;
    } catch (error) {
        await client.query("ROLLBACK").catch(() => {});
        throw error;
    } finally {
        client.release();
    }
}

/*
|--------------------------------------------------------------------------
| Customer - Cancel Own Order
|--------------------------------------------------------------------------
*/

async function cancelOrder(orderId, customerId) {
    const result = await pool.query(
        `
        UPDATE orders
        SET
            status = 'cancelled',
            cancelled_at = CURRENT_TIMESTAMP,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $1
          AND customer_id = $2
          AND status IN (
              'pending',
              'confirmed'
          )
        RETURNING *
        `,
        [orderId, customerId],
    );

    if (result.rows.length === 0) {
        throw new Error(
            "Order not found or cannot be cancelled",
        );
    }

    return result.rows[0];
}

module.exports = {
    getCustomerCheckoutQuote,
    getCustomerOrders,
    getOrderById,
    createOrder,
    cancelOrder,

    getRestaurantOrders,
    getRestaurantOrder,
    updateOrderStatus,

    getAllOrders,
    getOrderByIdForAdmin,
    adminUpdateOrderStatus,
    adminCancelOrder,

    getAdminOrderSummary,
    getAdminOrderFormOptions,
    createAdminOrder,
};