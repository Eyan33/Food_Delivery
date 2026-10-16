const pool = require("../../config/database");

/*
 * Get or create the cart belonging to a user.
 */
async function getOrCreateCart(userId) {
    const existingCart = await pool.query(
        `
        SELECT
            id,
            user_id,
            created_at,
            updated_at
        FROM carts
        WHERE user_id = $1
        LIMIT 1
        `,
        [userId]
    );

    if (existingCart.rows.length > 0) {
        return existingCart.rows[0];
    }

    const result = await pool.query(
        `
        INSERT INTO carts (user_id)
        VALUES ($1)
        RETURNING
            id,
            user_id,
            created_at,
            updated_at
        `,
        [userId]
    );

    return result.rows[0];
}


/*
 * Get the complete cart for a user.
 */
async function getCart(userId) {
    const cart = await getOrCreateCart(userId);

    const result = await pool.query(
        `
        SELECT
            ci.id,
            ci.cart_id,
            ci.food_id,
            ci.quantity,
            ci.created_at,
            ci.updated_at,

            f.name AS food_name,
            f.description AS food_description,
            f.price,
            f.image_url,
            f.is_available,

            r.id AS restaurant_id,
            r.name AS restaurant_name

        FROM cart_items ci

        JOIN foods f
            ON f.id = ci.food_id

        JOIN restaurants r
            ON r.id = f.restaurant_id

        WHERE ci.cart_id = $1

        ORDER BY ci.created_at ASC
        `,
        [cart.id]
    );

    const items = result.rows;

    const total = items.reduce(
        (sum, item) =>
            sum + Number(item.price) * Number(item.quantity),
        0
    );

    return {
        id: cart.id,
        user_id: cart.user_id,
        items,
        item_count: items.reduce(
            (sum, item) => sum + Number(item.quantity),
            0
        ),
        total: total.toFixed(2),
        created_at: cart.created_at,
        updated_at: cart.updated_at
    };
}


/*
 * Add food to the user's cart.
 */
async function addItem(userId, foodId, quantity) {

    if (!foodId) {
        throw new Error("Food ID is required");
    }

    quantity = Number(quantity);

    if (!Number.isInteger(quantity) || quantity <= 0) {
        throw new Error("Quantity must be a positive integer");
    }

    const foodResult = await pool.query(
        `
        SELECT
            id,
            name,
            price,
            is_available
        FROM foods
        WHERE id = $1
        LIMIT 1
        `,
        [foodId]
    );

    if (foodResult.rows.length === 0) {
        throw new Error("Food not found");
    }

    const food = foodResult.rows[0];

    if (!food.is_available) {
        throw new Error("This food is currently unavailable");
    }

    const cart = await getOrCreateCart(userId);

    const existingItem = await pool.query(
        `
        SELECT
            id,
            quantity
        FROM cart_items
        WHERE cart_id = $1
          AND food_id = $2
        LIMIT 1
        `,
        [cart.id, foodId]
    );

    let item;

    if (existingItem.rows.length > 0) {

        const newQuantity =
            Number(existingItem.rows[0].quantity) + quantity;

        const result = await pool.query(
            `
            UPDATE cart_items
            SET quantity = $1
            WHERE id = $2
            RETURNING *
            `,
            [
                newQuantity,
                existingItem.rows[0].id
            ]
        );

        item = result.rows[0];

    } else {

        const result = await pool.query(
            `
            INSERT INTO cart_items (
                cart_id,
                food_id,
                quantity
            )
            VALUES ($1, $2, $3)
            RETURNING *
            `,
            [
                cart.id,
                foodId,
                quantity
            ]
        );

        item = result.rows[0];
    }

    return item;
}


/*
 * Update the quantity of a cart item.
 */
async function updateItem(userId, itemId, quantity) {

    quantity = Number(quantity);

    if (!Number.isInteger(quantity) || quantity <= 0) {
        throw new Error("Quantity must be a positive integer");
    }

    const result = await pool.query(
        `
        UPDATE cart_items ci

        SET quantity = $1

        FROM carts c

        WHERE ci.id = $2
          AND ci.cart_id = c.id
          AND c.user_id = $3

        RETURNING
            ci.*
        `,
        [
            quantity,
            itemId,
            userId
        ]
    );

    if (result.rows.length === 0) {
        throw new Error(
            "Cart item not found or you do not have permission to modify it"
        );
    }

    return result.rows[0];
}


/*
 * Remove one cart item.
 */
async function removeItem(userId, itemId) {

    const result = await pool.query(
        `
        DELETE FROM cart_items ci

        USING carts c

        WHERE ci.id = $1
          AND ci.cart_id = c.id
          AND c.user_id = $2

        RETURNING
            ci.id,
            ci.cart_id,
            ci.food_id,
            ci.quantity
        `,
        [
            itemId,
            userId
        ]
    );

    if (result.rows.length === 0) {
        throw new Error(
            "Cart item not found or you do not have permission to delete it"
        );
    }

    return result.rows[0];
}


/*
 * Remove every item from the user's cart.
 */
async function clearCart(userId) {

    const cart = await getOrCreateCart(userId);

    const result = await pool.query(
        `
        DELETE FROM cart_items
        WHERE cart_id = $1
        RETURNING id
        `,
        [cart.id]
    );

    return {
        cart_id: cart.id,
        removed_items: result.rowCount
    };
}


module.exports = {
    getOrCreateCart,
    getCart,
    addItem,
    updateItem,
    removeItem,
    clearCart
};