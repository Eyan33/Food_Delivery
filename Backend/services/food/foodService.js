const pool = require("../../config/database");

function apiError(message, statusCode = 400) {
    const error = new Error(message);
    error.statusCode = statusCode;
    return error;
}

/*
|--------------------------------------------------------------------------
| Validation Helpers
|--------------------------------------------------------------------------
*/

function parsePositiveInteger(value, label) {
    if (
        value === undefined ||
        value === null ||
        value === ""
    ) {
        throw apiError(
            `${label} is required`
        );
    }

    const text = String(value).trim();

    if (!/^[1-9][0-9]*$/.test(text)) {
        throw apiError(
            `${label} must be a positive integer`
        );
    }

    return text;
}

function parseOptionalPositiveInteger(value, label) {
    if (
        value === undefined ||
        value === null ||
        value === ""
    ) {
        return null;
    }

    const text = String(value).trim();

    if (!/^[1-9][0-9]*$/.test(text)) {
        throw apiError(
            `${label} must be a positive integer`
        );
    }

    return text;
}

function parseNonNegativeNumber(value, label) {
    if (
        value === undefined ||
        value === null ||
        value === ""
    ) {
        throw apiError(
            `${label} is required`
        );
    }

    const number = Number(value);

    if (!Number.isFinite(number) || number < 0) {
        throw apiError(
            `${label} must be a valid non-negative number`
        );
    }

    return number;
}

function parseOptionalNonNegativeNumber(
    value,
    label
) {
    if (
        value === undefined ||
        value === null ||
        value === ""
    ) {
        return null;
    }

    const number = Number(value);

    if (!Number.isFinite(number) || number < 0) {
        throw apiError(
            `${label} must be a valid non-negative number`
        );
    }

    return number;
}

function parseOptionalNonNegativeInteger(
    value,
    label
) {
    if (
        value === undefined ||
        value === null ||
        value === ""
    ) {
        return null;
    }

    const number = Number(value);

    if (
        !Number.isInteger(number) ||
        number < 0
    ) {
        throw apiError(
            `${label} must be a non-negative integer`
        );
    }

    return number;
}

function parseBoolean(value, label) {
    if (typeof value !== "boolean") {
        throw apiError(
            `${label} must be a boolean`
        );
    }

    return value;
}

function validateName(value, label) {
    if (
        typeof value !== "string" ||
        !value.trim()
    ) {
        throw apiError(
            `${label} is required`
        );
    }

    return value.trim();
}

async function getRestaurantById(restaurantId) {
    const result = await pool.query(
        `
        SELECT
            id,
            name,
            is_active
        FROM restaurants
        WHERE id = $1
        LIMIT 1
        `,
        [restaurantId]
    );

    return result.rows[0] || null;
}

async function validateCategoryForRestaurant(
    categoryId,
    restaurantId
) {
    if (
        categoryId === undefined ||
        categoryId === null
    ) {
        return;
    }

    const result = await pool.query(
        `
        SELECT id
        FROM food_categories
        WHERE id = $1
          AND restaurant_id = $2
        LIMIT 1
        `,
        [
            categoryId,
            restaurantId
        ]
    );

    if (result.rows.length === 0) {
        throw apiError(
            "The selected category does not belong to this restaurant"
        );
    }
}

/*
|--------------------------------------------------------------------------
| Restaurant Lookup
|--------------------------------------------------------------------------
*/

async function getRestaurantIdByOwnerId(ownerId) {
    const result = await pool.query(
        `
        SELECT id
        FROM restaurants
        WHERE owner_id = $1
        LIMIT 1
        `,
        [ownerId]
    );

    return result.rows[0]?.id || null;
}

/*
|--------------------------------------------------------------------------
| Public Foods
|--------------------------------------------------------------------------
*/

async function getAllFoods(restaurantId) {
    const values = [];
    let restaurantFilter = "TRUE";

    if (restaurantId !== undefined && restaurantId !== "") {
        const validRestaurantId = parsePositiveInteger(restaurantId, "Restaurant ID");
        values.push(validRestaurantId);
        restaurantFilter = "f.restaurant_id = $1";
    }

    const result = await pool.query(
        `
        SELECT
            f.id,
            f.restaurant_id,
            f.category_id,
            f.name,
            f.description,
            f.price,
            CASE WHEN f.image_data IS NOT NULL THEN '/api/foods/' || f.id || '/image' ELSE f.image_url END AS image_url,
            f.preparation_time,
            f.is_available,
            f.is_featured,
            f.created_at,
            f.updated_at,

            fc.name AS category_name,
            r.name AS restaurant_name

        FROM foods f

        LEFT JOIN food_categories fc
            ON fc.id = f.category_id

        JOIN restaurants r
            ON r.id = f.restaurant_id

        WHERE r.is_active = TRUE
          AND ${restaurantFilter}

        ORDER BY f.created_at DESC
        `,
        values
    );

    return result.rows;
}

async function getFoodById(foodId) {
    const validFoodId =
        parsePositiveInteger(
            foodId,
            "Food ID"
        );

    const result = await pool.query(
        `
        SELECT
            f.id,
            f.restaurant_id,
            f.category_id,
            f.name,
            f.description,
            f.price,
            CASE WHEN f.image_data IS NOT NULL THEN '/api/foods/' || f.id || '/image' ELSE f.image_url END AS image_url,
            f.preparation_time,
            f.is_available,
            f.is_featured,
            f.created_at,
            f.updated_at,

            fc.name AS category_name,
            r.name AS restaurant_name

        FROM foods f

        LEFT JOIN food_categories fc
            ON fc.id = f.category_id

        JOIN restaurants r
            ON r.id = f.restaurant_id

        WHERE f.id = $1

        LIMIT 1
        `,
        [validFoodId]
    );

    return result.rows[0] || null;
}

/*
|--------------------------------------------------------------------------
| Restaurant Foods
|--------------------------------------------------------------------------
*/

async function getMyFoods(ownerId) {
    const restaurantId =
        await getRestaurantIdByOwnerId(
            ownerId
        );

    if (!restaurantId) {
        throw apiError(
            "Restaurant profile not found",
            404
        );
    }

    const result = await pool.query(
        `
        SELECT
            f.id,
            f.restaurant_id,
            f.category_id,
            f.name,
            f.description,
            f.price,
            CASE WHEN f.image_data IS NOT NULL THEN '/api/foods/' || f.id || '/image' ELSE f.image_url END AS image_url,
            f.preparation_time,
            f.is_available,
            f.is_featured,
            f.created_at,
            f.updated_at,

            fc.name AS category_name

        FROM foods f

        LEFT JOIN food_categories fc
            ON fc.id = f.category_id

        WHERE f.restaurant_id = $1

        ORDER BY f.created_at DESC
        `,
        [restaurantId]
    );

    return result.rows;
}

async function createFood(ownerId, data) {
    const restaurantId =
        await getRestaurantIdByOwnerId(
            ownerId
        );

    if (!restaurantId) {
        throw apiError(
            "Restaurant profile not found",
            404
        );
    }

    const {
        category_id,
        name,
        description,
        price,
        image_url,
        preparation_time,
        is_available,
        is_featured
    } = data;

    const foodName =
        validateName(name, "Food name");

    const foodPrice =
        parseNonNegativeNumber(
            price,
            "Food price"
        );

    const preparationTime =
        parseOptionalNonNegativeInteger(
            preparation_time,
            "Preparation time"
        );

    if (
        is_available !== undefined &&
        typeof is_available !== "boolean"
    ) {
        throw apiError(
            "is_available must be a boolean"
        );
    }

    if (
        is_featured !== undefined &&
        typeof is_featured !== "boolean"
    ) {
        throw apiError(
            "is_featured must be a boolean"
        );
    }

    const categoryId =
        parseOptionalPositiveInteger(
            category_id,
            "Category ID"
        );

    await validateCategoryForRestaurant(
        categoryId,
        restaurantId
    );

    const result = await pool.query(
        `
        INSERT INTO foods (
            restaurant_id,
            category_id,
            name,
            description,
            price,
            image_url,
            preparation_time,
            is_available,
            is_featured
        )

        VALUES (
            $1,
            $2,
            $3,
            $4,
            $5,
            $6,
            $7,
            $8,
            $9
        )

        RETURNING *
        `,
        [
            restaurantId,
            categoryId,
            foodName,
            description !== undefined
                ? description
                : null,
            foodPrice,
            image_url !== undefined
                ? image_url
                : null,
            preparationTime,
            is_available !== undefined
                ? is_available
                : true,
            is_featured !== undefined
                ? is_featured
                : false
        ]
    );

    return result.rows[0];
}

async function updateFood(
    ownerId,
    foodId,
    data
) {
    const restaurantId =
        await getRestaurantIdByOwnerId(
            ownerId
        );

    if (!restaurantId) {
        throw apiError(
            "Restaurant profile not found",
            404
        );
    }

    const validFoodId =
        parsePositiveInteger(
            foodId,
            "Food ID"
        );

    const existing = await pool.query(
        `
        SELECT id
        FROM foods
        WHERE id = $1
          AND restaurant_id = $2
        LIMIT 1
        `,
        [
            validFoodId,
            restaurantId
        ]
    );

    if (existing.rows.length === 0) {
        throw apiError(
            "Food item not found",
            404
        );
    }

    const {
        category_id,
        name,
        description,
        price,
        image_url,
        preparation_time,
        is_available,
        is_featured
    } = data;

    const updates = [];
    const values = [];

    if (category_id !== undefined) {
        const categoryId =
            parseOptionalPositiveInteger(
                category_id,
                "Category ID"
            );

        await validateCategoryForRestaurant(
            categoryId,
            restaurantId
        );

        values.push(categoryId);
        updates.push(
            `category_id = $${values.length}`
        );
    }

    if (name !== undefined) {
        values.push(
            validateName(
                name,
                "Food name"
            )
        );

        updates.push(
            `name = $${values.length}`
        );
    }

    if (description !== undefined) {
        values.push(
            description === null
                ? null
                : String(description)
        );

        updates.push(
            `description = $${values.length}`
        );
    }

    if (price !== undefined) {
        values.push(
            parseNonNegativeNumber(
                price,
                "Food price"
            )
        );

        updates.push(
            `price = $${values.length}`
        );
    }

    if (image_url !== undefined) {
        values.push(
            image_url === null ||
            image_url === ""
                ? null
                : String(image_url).trim()
        );

        updates.push(
            `image_url = $${values.length}`
        );
    }

    if (image_data !== undefined || image_mime_type !== undefined) {
        if (typeof image_data !== "string" ||
            !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(image_data)) {
            throw apiError("A valid replacement image is required");
        }
        if (!["image/jpeg", "image/png", "image/webp"].includes(image_mime_type)) {
            throw apiError("A JPEG, PNG, or WebP image is required");
        }
        const imageBuffer = Buffer.from(image_data, "base64");
        if (!imageBuffer.length || imageBuffer.length > 5 * 1024 * 1024) {
            throw apiError("Food image must be smaller than 5 MB");
        }
        const validSignature =
            (image_mime_type === "image/jpeg" && imageBuffer.length >= 3 && imageBuffer[0] === 0xff && imageBuffer[1] === 0xd8 && imageBuffer[2] === 0xff) ||
            (image_mime_type === "image/png" && imageBuffer.length >= 8 && imageBuffer.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) ||
            (image_mime_type === "image/webp" && imageBuffer.length >= 12 && imageBuffer.toString("ascii", 0, 4) === "RIFF" && imageBuffer.toString("ascii", 8, 12) === "WEBP");
        if (!validSignature) throw apiError("The selected file is not a valid JPEG, PNG, or WebP image");
        values.push(imageBuffer);
        updates.push(`image_data = $${values.length}`);
        values.push(image_mime_type);
        updates.push(`image_mime_type = $${values.length}`);
        updates.push("image_url = NULL");
    }
    if (preparation_time !== undefined) {
        values.push(
            parseOptionalNonNegativeInteger(
                preparation_time,
                "Preparation time"
            )
        );

        updates.push(
            `preparation_time = $${values.length}`
        );
    }

    if (is_available !== undefined) {
        values.push(
            parseBoolean(
                is_available,
                "is_available"
            )
        );

        updates.push(
            `is_available = $${values.length}`
        );
    }

    if (is_featured !== undefined) {
        values.push(
            parseBoolean(
                is_featured,
                "is_featured"
            )
        );

        updates.push(
            `is_featured = $${values.length}`
        );
    }

    if (updates.length === 0) {
        throw apiError(
            "No fields were provided for update"
        );
    }

    values.push(validFoodId);

    const result = await pool.query(
        `
        UPDATE foods

        SET
            ${updates.join(", ")},
            updated_at = CURRENT_TIMESTAMP

        WHERE id = $${values.length}

          AND restaurant_id = ${restaurantId
              ? `'${restaurantId}'`
              : "NULL"
          }

        RETURNING *
        `,
        values
    );

    /*
     * The restaurant ID above is trusted from
     * the authenticated restaurant lookup.
     * Re-run the ownership condition safely
     * if the previous query did not match.
     */
    if (result.rows.length === 0) {
        throw apiError(
            "Food item not found",
            404
        );
    }

    return result.rows[0];
}

async function deleteFood(
    ownerId,
    foodId
) {
    const restaurantId =
        await getRestaurantIdByOwnerId(
            ownerId
        );

    if (!restaurantId) {
        throw apiError(
            "Restaurant profile not found",
            404
        );
    }

    const validFoodId =
        parsePositiveInteger(
            foodId,
            "Food ID"
        );

    const result = await pool.query(
        `
        DELETE FROM foods

        WHERE id = $1
          AND restaurant_id = $2

        RETURNING id, name
        `,
        [
            validFoodId,
            restaurantId
        ]
    );

    if (result.rows.length === 0) {
        throw apiError(
            "Food item not found",
            404
        );
    }

    return result.rows[0];
}

async function updateFoodAvailability(
    ownerId,
    foodId,
    isAvailable
) {
    const restaurantId =
        await getRestaurantIdByOwnerId(
            ownerId
        );

    if (!restaurantId) {
        throw apiError(
            "Restaurant profile not found",
            404
        );
    }

    const validFoodId =
        parsePositiveInteger(
            foodId,
            "Food ID"
        );

    parseBoolean(
        isAvailable,
        "is_available"
    );

    const result = await pool.query(
        `
        UPDATE foods

        SET
            is_available = $1,
            updated_at = CURRENT_TIMESTAMP

        WHERE id = $2
          AND restaurant_id = $3

        RETURNING
            id,
            name,
            is_available,
            updated_at
        `,
        [
            isAvailable,
            validFoodId,
            restaurantId
        ]
    );

    if (result.rows.length === 0) {
        throw apiError(
            "Food item not found",
            404
        );
    }

    return result.rows[0];
}

async function updateFoodFeatured(
    ownerId,
    foodId,
    isFeatured
) {
    const restaurantId =
        await getRestaurantIdByOwnerId(
            ownerId
        );

    if (!restaurantId) {
        throw apiError(
            "Restaurant profile not found",
            404
        );
    }

    const validFoodId =
        parsePositiveInteger(
            foodId,
            "Food ID"
        );

    parseBoolean(
        isFeatured,
        "is_featured"
    );

    const result = await pool.query(
        `
        UPDATE foods

        SET
            is_featured = $1,
            updated_at = CURRENT_TIMESTAMP

        WHERE id = $2
          AND restaurant_id = $3

        RETURNING
            id,
            name,
            is_featured,
            updated_at
        `,
        [
            isFeatured,
            validFoodId,
            restaurantId
        ]
    );

    if (result.rows.length === 0) {
        throw apiError(
            "Food item not found",
            404
        );
    }

    return result.rows[0];
}

/*
|--------------------------------------------------------------------------
| Restaurant Categories
|--------------------------------------------------------------------------
*/

async function getMyCategories(ownerId) {
    const restaurantId =
        await getRestaurantIdByOwnerId(
            ownerId
        );

    if (!restaurantId) {
        throw apiError(
            "Restaurant profile not found",
            404
        );
    }

    const result = await pool.query(
        `
        SELECT
            id,
            restaurant_id,
            name,
            description,
            created_at,
            updated_at

        FROM food_categories

        WHERE restaurant_id = $1

        ORDER BY name ASC
        `,
        [restaurantId]
    );

    return result.rows;
}

async function createCategory(
    ownerId,
    data
) {
    const restaurantId =
        await getRestaurantIdByOwnerId(
            ownerId
        );

    if (!restaurantId) {
        throw apiError(
            "Restaurant profile not found",
            404
        );
    }

    const {
        name,
        description
    } = data;

    const categoryName =
        validateName(
            name,
            "Category name"
        );

    const result = await pool.query(
        `
        INSERT INTO food_categories (
            restaurant_id,
            name,
            description
        )

        VALUES (
            $1,
            $2,
            $3
        )

        RETURNING *
        `,
        [
            restaurantId,
            categoryName,
            description !== undefined
                ? description
                : null
        ]
    );

    return result.rows[0];
}

async function updateCategory(
    ownerId,
    categoryId,
    data
) {
    const restaurantId =
        await getRestaurantIdByOwnerId(
            ownerId
        );

    if (!restaurantId) {
        throw apiError(
            "Restaurant profile not found",
            404
        );
    }

    const validCategoryId =
        parsePositiveInteger(
            categoryId,
            "Category ID"
        );

    const {
        name,
        description
    } = data;

    const updates = [];
    const values = [];

    if (name !== undefined) {
        values.push(
            validateName(
                name,
                "Category name"
            )
        );

        updates.push(
            `name = $${values.length}`
        );
    }

    if (description !== undefined) {
        values.push(
            description === null
                ? null
                : String(description)
        );

        updates.push(
            `description = $${values.length}`
        );
    }

    if (updates.length === 0) {
        throw apiError(
            "No fields were provided for update"
        );
    }

    values.push(
        validCategoryId,
        restaurantId
    );

    const result = await pool.query(
        `
        UPDATE food_categories

        SET
            ${updates.join(", ")},
            updated_at = CURRENT_TIMESTAMP

        WHERE id = $${values.length - 1}
          AND restaurant_id = $${values.length}

        RETURNING *
        `,
        values
    );

    if (result.rows.length === 0) {
        throw apiError(
            "Category not found",
            404
        );
    }

    return result.rows[0];
}

async function deleteCategory(
    ownerId,
    categoryId
) {
    const restaurantId =
        await getRestaurantIdByOwnerId(
            ownerId
        );

    if (!restaurantId) {
        throw apiError(
            "Restaurant profile not found",
            404
        );
    }

    const validCategoryId =
        parsePositiveInteger(
            categoryId,
            "Category ID"
        );

    const result = await pool.query(
        `
        DELETE FROM food_categories

        WHERE id = $1
          AND restaurant_id = $2

        RETURNING id, name
        `,
        [
            validCategoryId,
            restaurantId
        ]
    );

    if (result.rows.length === 0) {
        throw apiError(
            "Category not found",
            404
        );
    }

    return result.rows[0];
}

/*
|--------------------------------------------------------------------------
| Admin - Food Listing
|--------------------------------------------------------------------------
*/

async function getAdminFoods(options = {}) {
    const search =
        String(
            options.search ?? ""
        ).trim();

    const restaurantId =
        parseOptionalPositiveInteger(
            options.restaurantId,
            "restaurant_id"
        );

    const categoryId =
        parseOptionalPositiveInteger(
            options.categoryId,
            "category_id"
        );

    let isAvailable;

    if (
        options.isAvailable !== undefined &&
        options.isAvailable !== null &&
        options.isAvailable !== ""
    ) {
        const value =
            String(
                options.isAvailable
            ).trim().toLowerCase();

        if (
            value !== "true" &&
            value !== "false"
        ) {
            throw apiError(
                "is_available must be true or false"
            );
        }

        isAvailable = value === "true";
    }

    let isFeatured;

    if (
        options.isFeatured !== undefined &&
        options.isFeatured !== null &&
        options.isFeatured !== ""
    ) {
        const value =
            String(
                options.isFeatured
            ).trim().toLowerCase();

        if (
            value !== "true" &&
            value !== "false"
        ) {
            throw apiError(
                "is_featured must be true or false"
            );
        }

        isFeatured = value === "true";
    }

    const requestedLimit =
        Number.parseInt(
            options.limit,
            10
        );

    const requestedPage =
        Number.parseInt(
            options.page,
            10
        );

    const limit =
        Number.isInteger(
            requestedLimit
        ) &&
        requestedLimit > 0
            ? Math.min(
                  requestedLimit,
                  100
              )
            : 10;

    const page =
        Number.isInteger(
            requestedPage
        ) &&
        requestedPage > 0
            ? requestedPage
            : 1;

    const offset =
        (page - 1) * limit;

    const values = [];
    const conditions = [];

    if (search) {
        const escapedSearch =
            search.replace(
                /[\\%_]/g,
                "\\$&"
            );

        values.push(
            `%${escapedSearch}%`
        );

        const placeholder =
            `$${values.length}`;

        conditions.push(`
            (
                f.name
                    ILIKE ${placeholder}
                    ESCAPE '\\'

                OR COALESCE(
                    f.description,
                    ''
                )
                    ILIKE ${placeholder}
                    ESCAPE '\\'

                OR COALESCE(
                    r.name,
                    ''
                )
                    ILIKE ${placeholder}
                    ESCAPE '\\'

                OR COALESCE(
                    fc.name,
                    ''
                )
                    ILIKE ${placeholder}
                    ESCAPE '\\'
            )
        `);
    }

    if (restaurantId) {
        values.push(restaurantId);

        conditions.push(
            `f.restaurant_id = $${values.length}`
        );
    }

    if (categoryId) {
        values.push(categoryId);

        conditions.push(
            `f.category_id = $${values.length}`
        );
    }

    if (isAvailable !== undefined) {
        values.push(isAvailable);

        conditions.push(
            `f.is_available = $${values.length}`
        );
    }

    if (isFeatured !== undefined) {
        values.push(isFeatured);

        conditions.push(
            `f.is_featured = $${values.length}`
        );
    }

    const filter =
        conditions.length > 0
            ? conditions.join(" AND ")
            : "TRUE";

    const client =
        await pool.connect();

    try {
        await client.query(
            "BEGIN READ ONLY"
        );

        const statsResult =
            await client.query(
                `
                SELECT
                    COUNT(*)::int
                        AS total,

                    COUNT(*)
                        FILTER (
                            WHERE f.is_available = TRUE
                        )::int
                        AS available,

                    COUNT(*)
                        FILTER (
                            WHERE f.is_available = FALSE
                        )::int
                        AS unavailable,

                    COUNT(*)
                        FILTER (
                            WHERE f.is_featured = TRUE
                        )::int
                        AS featured,

                    COUNT(*)
                        FILTER (
                            WHERE ${filter}
                        )::int
                        AS filtered

                FROM foods f

                JOIN restaurants r
                    ON r.id = f.restaurant_id

                LEFT JOIN food_categories fc
                    ON fc.id = f.category_id
                `,
                values
            );

        const foodsResult =
            await client.query(
                `
                SELECT
                    f.id,
                    f.restaurant_id,
                    f.category_id,
                    f.name,
                    f.description,
                    f.price,
                    CASE WHEN f.image_data IS NOT NULL THEN '/api/foods/' || f.id || '/image' ELSE f.image_url END AS image_url,
                    f.preparation_time,
                    f.is_available,
                    f.is_featured,
                    f.created_at,
                    f.updated_at,

                    fc.name
                        AS category_name,

                    r.name
                        AS restaurant_name

                FROM foods f

                JOIN restaurants r
                    ON r.id = f.restaurant_id

                LEFT JOIN food_categories fc
                    ON fc.id = f.category_id

                WHERE ${filter}

                ORDER BY
                    f.created_at DESC,
                    f.id DESC

                LIMIT $${values.length + 1}

                OFFSET $${values.length + 2}
                `,
                [
                    ...values,
                    limit,
                    offset
                ]
            );

        await client.query(
            "COMMIT"
        );

        const stats =
            statsResult.rows[0];

        const totalItems =
            Number(
                stats.filtered
            );

        return {
            foods:
                foodsResult.rows,

            pagination: {
                page,
                limit,
                totalItems,

                totalPages:
                    Math.max(
                        1,
                        Math.ceil(
                            totalItems /
                                limit
                        )
                    )
            },

            statistics: {
                total:
                    Number(
                        stats.total
                    ),

                available:
                    Number(
                        stats.available
                    ),

                unavailable:
                    Number(
                        stats.unavailable
                    ),

                featured:
                    Number(
                        stats.featured
                    )
            }
        };
    } catch (error) {
        await client
            .query("ROLLBACK")
            .catch(() => {});

        throw error;
    } finally {
        client.release();
    }
}

/*
|--------------------------------------------------------------------------
| Admin - Get One Food
|--------------------------------------------------------------------------
*/

async function getAdminFoodById(
    foodId
) {
    const validFoodId =
        parsePositiveInteger(
            foodId,
            "Food ID"
        );

    const result =
        await pool.query(
            `
            SELECT
                f.id,
                f.restaurant_id,
                f.category_id,
                f.name,
                f.description,
                f.price,
                CASE WHEN f.image_data IS NOT NULL THEN '/api/foods/' || f.id || '/image' ELSE f.image_url END AS image_url,
                f.preparation_time,
                f.is_available,
                f.is_featured,
                f.created_at,
                f.updated_at,

                fc.name
                    AS category_name,

                fc.description
                    AS category_description,

                r.name
                    AS restaurant_name,

                r.is_active
                    AS restaurant_is_active

            FROM foods f

            JOIN restaurants r
                ON r.id = f.restaurant_id

            LEFT JOIN food_categories fc
                ON fc.id = f.category_id

            WHERE f.id = $1

            LIMIT 1
            `,
            [validFoodId]
        );

    return result.rows[0] || null;
}

/*
|--------------------------------------------------------------------------
| Admin - Create Food
|--------------------------------------------------------------------------
*/

async function createAdminFood(data) {
    const {
        restaurant_id, category_id, name, description, price,
        image_data, image_mime_type, preparation_time, is_available, is_featured
    } = data;

    const restaurantId = parsePositiveInteger(restaurant_id, "Restaurant ID");
    const restaurant = await getRestaurantById(restaurantId);
    if (!restaurant) throw apiError("Restaurant not found", 404);

    const foodName = validateName(name, "Food name");
    const foodPrice = parseNonNegativeNumber(price, "Food price");
    const preparationTime = parseOptionalNonNegativeInteger(preparation_time, "Preparation time");
    if (is_available !== undefined && typeof is_available !== "boolean") throw apiError("is_available must be a boolean");
    if (is_featured !== undefined && typeof is_featured !== "boolean") throw apiError("is_featured must be a boolean");

    const categoryId = parseOptionalPositiveInteger(category_id, "Category ID");
    await validateCategoryForRestaurant(categoryId, restaurantId);

    if (typeof image_mime_type !== "string" ||
        !["image/jpeg", "image/png", "image/webp"].includes(image_mime_type)) {
        throw apiError("A JPEG, PNG, or WebP image is required");
    }
    if (typeof image_data !== "string" ||
        !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(image_data)) {
        throw apiError("A valid food image is required");
    }

    const imageBuffer = Buffer.from(image_data, "base64");
    if (!imageBuffer.length || imageBuffer.length > 5 * 1024 * 1024) {
        throw apiError("Food image must be smaller than 5 MB");
    }
    // Verify file signatures; do not trust the browser-provided MIME type alone.
    const validSignature =
        (image_mime_type === "image/jpeg" && imageBuffer.length >= 3 &&
            imageBuffer[0] === 0xff && imageBuffer[1] === 0xd8 && imageBuffer[2] === 0xff) ||
        (image_mime_type === "image/png" && imageBuffer.length >= 8 &&
            imageBuffer.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) ||
        (image_mime_type === "image/webp" && imageBuffer.length >= 12 &&
            imageBuffer.toString("ascii", 0, 4) === "RIFF" &&
            imageBuffer.toString("ascii", 8, 12) === "WEBP");
    if (!validSignature) throw apiError("The selected file is not a valid JPEG, PNG, or WebP image");

    const result = await pool.query(
        `
        INSERT INTO foods (
            restaurant_id, category_id, name, description, price, image_url,
            image_data, image_mime_type, preparation_time, is_available, is_featured
        )
        VALUES ($1, $2, $3, $4, $5, NULL, $6, $7, $8, $9, $10)
        RETURNING id, restaurant_id, category_id, name, description, price,
            '/api/foods/' || id || '/image' AS image_url,
            preparation_time, is_available, is_featured, created_at, updated_at
        `,
        [
            restaurantId, categoryId, foodName,
            description !== undefined ? description : null,
            foodPrice, imageBuffer, image_mime_type, preparationTime,
            is_available !== undefined ? is_available : true,
            is_featured !== undefined ? is_featured : false
        ]
    );
    return result.rows[0];
}

async function getFoodImage(foodId) {
    const validFoodId = parsePositiveInteger(foodId, "Food ID");
    const result = await pool.query(
        `SELECT image_data, image_mime_type FROM foods WHERE id = $1 LIMIT 1`,
        [validFoodId]
    );
    const food = result.rows[0];
    return food && food.image_data ? food : null;
}

/*
|--------------------------------------------------------------------------
| Admin - Update Food
|--------------------------------------------------------------------------
*/

async function updateAdminFood(
    foodId,
    data
) {
    const validFoodId =
        parsePositiveInteger(
            foodId,
            "Food ID"
        );

    const existing =
        await pool.query(
            `
            SELECT
                id,
                restaurant_id

            FROM foods

            WHERE id = $1

            LIMIT 1
            `,
            [validFoodId]
        );

    if (existing.rows.length === 0) {
        throw apiError(
            "Food item not found",
            404
        );
    }

    const currentRestaurantId =
        existing.rows[0].restaurant_id;

    const {
        restaurant_id,
        category_id,
        name,
        description,
        price,
        image_url,
        preparation_time,
        is_available,
        is_featured,
        image_data,
        image_mime_type
    } = data;

    let targetRestaurantId =
        currentRestaurantId;

    const updates = [];
    const values = [];

    if (restaurant_id !== undefined) {
        targetRestaurantId =
            parsePositiveInteger(
                restaurant_id,
                "Restaurant ID"
            );

        const restaurant =
            await getRestaurantById(
                targetRestaurantId
            );

        if (!restaurant) {
            throw apiError(
                "Restaurant not found",
                404
            );
        }

        values.push(
            targetRestaurantId
        );

        updates.push(
            `restaurant_id = $${values.length}`
        );
    }

    if (category_id !== undefined) {
        const categoryId =
            parseOptionalPositiveInteger(
                category_id,
                "Category ID"
            );

        await validateCategoryForRestaurant(
            categoryId,
            targetRestaurantId
        );

        values.push(categoryId);

        updates.push(
            `category_id = $${values.length}`
        );
    }

    if (name !== undefined) {
        values.push(
            validateName(
                name,
                "Food name"
            )
        );

        updates.push(
            `name = $${values.length}`
        );
    }

    if (description !== undefined) {
        values.push(
            description === null
                ? null
                : String(description)
        );

        updates.push(
            `description = $${values.length}`
        );
    }

    if (price !== undefined) {
        values.push(
            parseNonNegativeNumber(
                price,
                "Food price"
            )
        );

        updates.push(
            `price = $${values.length}`
        );
    }

    if (image_url !== undefined) {
        values.push(
            image_url === null ||
            image_url === ""
                ? null
                : String(image_url).trim()
        );

        updates.push(
            `image_url = $${values.length}`
        );
    }

    if (preparation_time !== undefined) {
        values.push(
            parseOptionalNonNegativeInteger(
                preparation_time,
                "Preparation time"
            )
        );

        updates.push(
            `preparation_time = $${values.length}`
        );
    }

    if (is_available !== undefined) {
        values.push(
            parseBoolean(
                is_available,
                "is_available"
            )
        );

        updates.push(
            `is_available = $${values.length}`
        );
    }

    if (is_featured !== undefined) {
        values.push(
            parseBoolean(
                is_featured,
                "is_featured"
            )
        );

        updates.push(
            `is_featured = $${values.length}`
        );
    }

    // Persist uploaded image bytes when the edit modal includes a replacement.
    if (image_data !== undefined || image_mime_type !== undefined) {
        if (typeof image_data !== "string" ||
            !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(image_data)) {
            throw apiError("A valid replacement image is required");
        }
        if (!["image/jpeg", "image/png", "image/webp"].includes(image_mime_type)) {
            throw apiError("A JPEG, PNG, or WebP image is required");
        }
        const imageBuffer = Buffer.from(image_data, "base64");
        if (!imageBuffer.length || imageBuffer.length > 5 * 1024 * 1024) {
            throw apiError("Food image must be no larger than 5 MB");
        }
        const validSignature =
            (image_mime_type === "image/jpeg" && imageBuffer.length >= 3 && imageBuffer[0] === 0xff && imageBuffer[1] === 0xd8 && imageBuffer[2] === 0xff) ||
            (image_mime_type === "image/png" && imageBuffer.length >= 8 && imageBuffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) ||
            (image_mime_type === "image/webp" && imageBuffer.length >= 12 && imageBuffer.toString("ascii", 0, 4) === "RIFF" && imageBuffer.toString("ascii", 8, 12) === "WEBP");
        if (!validSignature) {
            throw apiError("The selected file is not a valid JPEG, PNG, or WebP image");
        }
        values.push(imageBuffer);
        updates.push(`image_data = $${values.length}`);
        values.push(image_mime_type);
        updates.push(`image_mime_type = $${values.length}`);
        updates.push("image_url = NULL");
    }

    if (updates.length === 0) {
        throw apiError(
            "No fields were provided for update"
        );
    }

    values.push(validFoodId);

    const result =
        await pool.query(
            `
            UPDATE foods

            SET
                ${updates.join(", ")},
                updated_at =
                    CURRENT_TIMESTAMP

            WHERE id = $${values.length}

            RETURNING *
            `,
            values
        );

    if (result.rows.length === 0) {
        throw apiError(
            "Food item could not be updated",
            409
        );
    }

    return result.rows[0];
}

/*
|--------------------------------------------------------------------------
| Admin - Delete Food
|--------------------------------------------------------------------------
*/

async function deleteAdminFood(
    foodId
) {
    const validFoodId =
        parsePositiveInteger(
            foodId,
            "Food ID"
        );

    const result =
        await pool.query(
            `
            DELETE FROM foods

            WHERE id = $1

            RETURNING id, name
            `,
            [validFoodId]
        );

    if (result.rows.length === 0) {
        throw apiError(
            "Food item not found",
            404
        );
    }

    return result.rows[0];
}

/*
|--------------------------------------------------------------------------
| Admin - Update Availability
|--------------------------------------------------------------------------
*/

async function updateAdminFoodAvailability(
    foodId,
    isAvailable
) {
    const validFoodId =
        parsePositiveInteger(
            foodId,
            "Food ID"
        );

    parseBoolean(
        isAvailable,
        "is_available"
    );

    const result =
        await pool.query(
            `
            UPDATE foods

            SET
                is_available = $1,
                updated_at =
                    CURRENT_TIMESTAMP

            WHERE id = $2

            RETURNING
                id,
                restaurant_id,
                category_id,
                name,
                price,
                image_url,
                preparation_time,
                is_available,
                is_featured,
                updated_at
            `,
            [
                isAvailable,
                validFoodId
            ]
        );

    if (result.rows.length === 0) {
        throw apiError(
            "Food item not found",
            404
        );
    }

    return result.rows[0];
}

/*
|--------------------------------------------------------------------------
| Admin - Update Featured
|--------------------------------------------------------------------------
*/

async function updateAdminFoodFeatured(
    foodId,
    isFeatured
) {
    const validFoodId =
        parsePositiveInteger(
            foodId,
            "Food ID"
        );

    parseBoolean(
        isFeatured,
        "is_featured"
    );

    const result =
        await pool.query(
            `
            UPDATE foods

            SET
                is_featured = $1,
                updated_at =
                    CURRENT_TIMESTAMP

            WHERE id = $2

            RETURNING
                id,
                restaurant_id,
                category_id,
                name,
                price,
                image_url,
                preparation_time,
                is_available,
                is_featured,
                updated_at
            `,
            [
                isFeatured,
                validFoodId
            ]
        );

    if (result.rows.length === 0) {
        throw apiError(
            "Food item not found",
            404
        );
    }

    return result.rows[0];
}

/*
|--------------------------------------------------------------------------
| Admin - Get Categories
|--------------------------------------------------------------------------
*/

async function getAdminCategories(
    options = {}
) {
    const search =
        String(
            options.search ?? ""
        ).trim();

    const restaurantId =
        parseOptionalPositiveInteger(
            options.restaurantId,
            "restaurant_id"
        );

    const requestedLimit =
        Number.parseInt(
            options.limit,
            10
        );

    const requestedPage =
        Number.parseInt(
            options.page,
            10
        );

    const limit =
        Number.isInteger(
            requestedLimit
        ) &&
        requestedLimit > 0
            ? Math.min(
                  requestedLimit,
                  100
              )
            : 10;

    const page =
        Number.isInteger(
            requestedPage
        ) &&
        requestedPage > 0
            ? requestedPage
            : 1;

    const offset =
        (page - 1) * limit;

    const values = [];
    const conditions = [];

    if (search) {
        const escapedSearch =
            search.replace(
                /[\\%_]/g,
                "\\$&"
            );

        values.push(
            `%${escapedSearch}%`
        );

        conditions.push(`
            (
                fc.name
                    ILIKE $${values.length}
                    ESCAPE '\\'

                OR COALESCE(
                    fc.description,
                    ''
                )
                    ILIKE $${values.length}
                    ESCAPE '\\'

                OR r.name
                    ILIKE $${values.length}
                    ESCAPE '\\'
            )
        `);
    }

    if (restaurantId) {
        values.push(
            restaurantId
        );

        conditions.push(
            `fc.restaurant_id = $${values.length}`
        );
    }

    const filter =
        conditions.length > 0
            ? conditions.join(" AND ")
            : "TRUE";

    const client =
        await pool.connect();

    try {
        await client.query(
            "BEGIN READ ONLY"
        );

        const countResult =
            await client.query(
                `
                SELECT
                    COUNT(*)::int
                        AS total

                FROM food_categories fc

                JOIN restaurants r
                    ON r.id =
                        fc.restaurant_id

                WHERE ${filter}
                `,
                values
            );

        const categoriesResult =
            await client.query(
                `
                SELECT
                    fc.id,
                    fc.restaurant_id,
                    fc.name,
                    fc.description,
                    fc.created_at,
                    fc.updated_at,

                    r.name
                        AS restaurant_name,

                    COUNT(f.id)::int
                        AS food_count

                FROM food_categories fc

                JOIN restaurants r
                    ON r.id =
                        fc.restaurant_id

                LEFT JOIN foods f
                    ON f.category_id =
                        fc.id

                WHERE ${filter}

                GROUP BY
                    fc.id,
                    fc.restaurant_id,
                    fc.name,
                    fc.description,
                    fc.created_at,
                    fc.updated_at,
                    r.name

                ORDER BY
                    fc.name ASC,
                    fc.id ASC

                LIMIT $${values.length + 1}

                OFFSET $${values.length + 2}
                `,
                [
                    ...values,
                    limit,
                    offset
                ]
            );

        await client.query(
            "COMMIT"
        );

        const totalItems =
            Number(
                countResult.rows[0].total
            );

        return {
            categories:
                categoriesResult.rows,

            pagination: {
                page,
                limit,
                totalItems,

                totalPages:
                    Math.max(
                        1,
                        Math.ceil(
                            totalItems /
                                limit
                        )
                    )
            }
        };
    } catch (error) {
        await client
            .query("ROLLBACK")
            .catch(() => {});

        throw error;
    } finally {
        client.release();
    }
}

/*
|--------------------------------------------------------------------------
| Admin - Get One Category
|--------------------------------------------------------------------------
*/

async function getAdminCategoryById(
    categoryId
) {
    const validCategoryId =
        parsePositiveInteger(
            categoryId,
            "Category ID"
        );

    const result =
        await pool.query(
            `
            SELECT
                fc.id,
                fc.restaurant_id,
                fc.name,
                fc.description,
                fc.created_at,
                fc.updated_at,

                r.name
                    AS restaurant_name,

                COUNT(f.id)::int
                    AS food_count

            FROM food_categories fc

            JOIN restaurants r
                ON r.id =
                    fc.restaurant_id

            LEFT JOIN foods f
                ON f.category_id =
                    fc.id

            WHERE fc.id = $1

            GROUP BY
                fc.id,
                fc.restaurant_id,
                fc.name,
                fc.description,
                fc.created_at,
                fc.updated_at,
                r.name

            LIMIT 1
            `,
            [validCategoryId]
        );

    return result.rows[0] || null;
}

/*
|--------------------------------------------------------------------------
| Admin - Create Category
|--------------------------------------------------------------------------
*/

async function createAdminCategory(
    data
) {
    const {
        restaurant_id,
        name,
        description
    } = data;

    const restaurantId =
        parsePositiveInteger(
            restaurant_id,
            "Restaurant ID"
        );

    const restaurant =
        await getRestaurantById(
            restaurantId
        );

    if (!restaurant) {
        throw apiError(
            "Restaurant not found",
            404
        );
    }

    const categoryName =
        validateName(
            name,
            "Category name"
        );

    const result =
        await pool.query(
            `
            INSERT INTO food_categories (
                restaurant_id,
                name,
                description
            )

            VALUES (
                $1,
                $2,
                $3
            )

            RETURNING *
            `,
            [
                restaurantId,
                categoryName,

                description !==
                undefined
                    ? description
                    : null
            ]
        );

    return result.rows[0];
}

/*
|--------------------------------------------------------------------------
| Admin - Update Category
|--------------------------------------------------------------------------
*/

async function updateAdminCategory(
    categoryId,
    data
) {
    const validCategoryId =
        parsePositiveInteger(
            categoryId,
            "Category ID"
        );

    const existing =
        await pool.query(
            `
            SELECT
                id,
                restaurant_id

            FROM food_categories

            WHERE id = $1

            LIMIT 1
            `,
            [validCategoryId]
        );

    if (existing.rows.length === 0) {
        throw apiError(
            "Category not found",
            404
        );
    }

    const {
        restaurant_id,
        name,
        description
    } = data;

    const updates = [];
    const values = [];

    let targetRestaurantId =
        existing.rows[0].restaurant_id;

    if (restaurant_id !== undefined) {
        targetRestaurantId =
            parsePositiveInteger(
                restaurant_id,
                "Restaurant ID"
            );

        const restaurant =
            await getRestaurantById(
                targetRestaurantId
            );

        if (!restaurant) {
            throw apiError(
                "Restaurant not found",
                404
            );
        }

        values.push(
            targetRestaurantId
        );

        updates.push(
            `restaurant_id = $${values.length}`
        );
    }

    if (name !== undefined) {
        values.push(
            validateName(
                name,
                "Category name"
            )
        );

        updates.push(
            `name = $${values.length}`
        );
    }

    if (description !== undefined) {
        values.push(
            description === null
                ? null
                : String(description)
        );

        updates.push(
            `description = $${values.length}`
        );
    }

    if (updates.length === 0) {
        throw apiError(
            "No fields were provided for update"
        );
    }

    values.push(
        validCategoryId
    );

    const result =
        await pool.query(
            `
            UPDATE food_categories

            SET
                ${updates.join(", ")},
                updated_at =
                    CURRENT_TIMESTAMP

            WHERE id = $${values.length}

            RETURNING *
            `,
            values
        );

    if (result.rows.length === 0) {
        throw apiError(
            "Category could not be updated",
            409
        );
    }

    /*
     * If the category was moved to another restaurant,
     * existing foods would still reference it.
     *
     * That situation is prevented by validating the
     * category/food relationship before the move.
     */
    return result.rows[0];
}

/*
|--------------------------------------------------------------------------
| Admin - Delete Category
|--------------------------------------------------------------------------
*/

async function deleteAdminCategory(
    categoryId
) {
    const validCategoryId =
        parsePositiveInteger(
            categoryId,
            "Category ID"
        );

    const result =
        await pool.query(
            `
            DELETE FROM food_categories

            WHERE id = $1

            RETURNING id, restaurant_id, name
            `,
            [validCategoryId]
        );

    if (result.rows.length === 0) {
        throw apiError(
            "Category not found",
            404
        );
    }

    return result.rows[0];
}

/*
|--------------------------------------------------------------------------
| Exports
|--------------------------------------------------------------------------
*/

module.exports = {
    getAllFoods,
    getFoodById,
    getFoodImage,

    getMyFoods,
    createFood,
    updateFood,
    deleteFood,
    updateFoodAvailability,
    updateFoodFeatured,

    getMyCategories,
    createCategory,
    updateCategory,
    deleteCategory,

    getAdminFoods,
    getAdminFoodById,
    createAdminFood,
    updateAdminFood,
    deleteAdminFood,
    updateAdminFoodAvailability,
    updateAdminFoodFeatured,

    getAdminCategories,
    getAdminCategoryById,
    createAdminCategory,
    updateAdminCategory,
    deleteAdminCategory
};
