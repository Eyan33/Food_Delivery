const pool = require("../../config/database");

const MAX_BIGINT =
    9223372036854775807n;

function createError(
    message,
    statusCode = 400
) {
    const error = new Error(message);
    error.statusCode = statusCode;
    return error;
}

function requireId(
    value,
    label
) {
    const id = String(value);

    if (
        !/^[1-9]\d*$/.test(id) ||
        BigInt(id) > MAX_BIGINT
    ) {
        throw createError(
            `${label} must be a positive integer`
        );
    }

    return id;
}

function optionalId(
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

    return requireId(
        value,
        label
    );
}

function validateCategoryData(
    data,
    { requireName = false } = {}
) {
    if (
        !data ||
        typeof data !== "object" ||
        Array.isArray(data)
    ) {
        throw createError(
            "Category data must be a JSON object"
        );
    }

    const hasName =
        Object.prototype.hasOwnProperty.call(
            data,
            "name"
        );

    const hasDescription =
        Object.prototype.hasOwnProperty.call(
            data,
            "description"
        );

    if (
        requireName &&
        !hasName
    ) {
        throw createError(
            "Category name is required"
        );
    }

    let name;

    if (hasName) {
        if (
            typeof data.name !== "string" ||
            !data.name.trim()
        ) {
            throw createError(
                "Category name must be a non-empty string"
            );
        }

        name =
            data.name.trim();

        if (
            name.length > 100
        ) {
            throw createError(
                "Category name must be 100 characters or fewer"
            );
        }
    }

    if (
        hasDescription &&
        data.description !== null &&
        typeof data.description !== "string"
    ) {
        throw createError(
            "Category description must be a string or null"
        );
    }

    if (
        !requireName &&
        !hasName &&
        !hasDescription
    ) {
        throw createError(
            "At least one of name or description must be provided"
        );
    }

    return {
        hasName,
        name,

        hasDescription,
        description:
            data.description
    };
}

/*
|--------------------------------------------------------------------------
| Public / Restaurant
|--------------------------------------------------------------------------
*/

/*
 * Get all categories for a restaurant
 */
async function getCategoriesByRestaurantId(
    restaurantId
) {
    const id =
        requireId(
            restaurantId,
            "Restaurant ID"
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
                fc.updated_at

            FROM food_categories fc

            WHERE fc.restaurant_id = $1

            ORDER BY fc.created_at ASC
            `,
            [id]
        );

    return result.rows;
}

/*
 * Get one category
 */
async function getCategoryById(
    categoryId
) {
    const id =
        requireId(
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

                r.name AS restaurant_name

            FROM food_categories fc

            JOIN restaurants r
                ON r.id =
                    fc.restaurant_id

            WHERE fc.id = $1

            LIMIT 1
            `,
            [id]
        );

    return (
        result.rows[0] ||
        null
    );
}

/*
 * Get categories belonging to restaurant owner
 */
async function getCategoriesByOwnerId(
    ownerId
) {
    const id =
        requireId(
            ownerId,
            "Owner ID"
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
                fc.updated_at

            FROM food_categories fc

            JOIN restaurants r
                ON r.id =
                    fc.restaurant_id

            WHERE r.owner_id = $1

            ORDER BY fc.created_at ASC
            `,
            [id]
        );

    return result.rows;
}

/*
 * Create category for authenticated owner's restaurant
 */
async function createCategory(
    ownerId,
    data
) {
    const owner =
        requireId(
            ownerId,
            "Owner ID"
        );

    const fields =
        validateCategoryData(
            data,
            {
                requireName: true
            }
        );

    const restaurantResult =
        await pool.query(
            `
            SELECT
                id

            FROM restaurants

            WHERE owner_id = $1

            LIMIT 1
            `,
            [owner]
        );

    if (
        restaurantResult.rows.length === 0
    ) {
        throw createError(
            "Restaurant profile not found",
            404
        );
    }

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
                restaurantResult.rows[0].id,

                fields.name,

                fields.hasDescription
                    ? fields.description
                    : null
            ]
        );

    return result.rows[0];
}

/*
 * Update category only when it belongs
 * to the authenticated owner
 */
async function updateCategory(
    ownerId,
    categoryId,
    data
) {
    const owner =
        requireId(
            ownerId,
            "Owner ID"
        );

    const id =
        requireId(
            categoryId,
            "Category ID"
        );

    const fields =
        validateCategoryData(
            data
        );

    const assignments = [];
    const values = [];

    if (fields.hasName) {
        values.push(
            fields.name
        );

        assignments.push(
            `name = $${values.length}`
        );
    }

    if (fields.hasDescription) {
        values.push(
            fields.description
        );

        assignments.push(
            `description = $${values.length}`
        );
    }

    values.push(id);

    const categoryIndex =
        values.length;

    values.push(owner);

    const ownerIndex =
        values.length;

    const result =
        await pool.query(
            `
            UPDATE food_categories fc

            SET
                ${assignments.join(", ")},
                updated_at =
                    CURRENT_TIMESTAMP

            FROM restaurants r

            WHERE fc.id =
                    $${categoryIndex}

              AND fc.restaurant_id =
                    r.id

              AND r.owner_id =
                    $${ownerIndex}

            RETURNING fc.*
            `,
            values
        );

    if (
        result.rows.length === 0
    ) {
        throw createError(
            "Category not found or you do not have permission to modify it",
            404
        );
    }

    return result.rows[0];
}

/*
 * Delete only an owner's category,
 * and prevent deletion while it has foods
 */
async function deleteCategory(
    ownerId,
    categoryId
) {
    const owner =
        requireId(
            ownerId,
            "Owner ID"
        );

    const id =
        requireId(
            categoryId,
            "Category ID"
        );

    const result =
        await pool.query(
            `
            DELETE FROM food_categories fc

            WHERE fc.id = $1

              AND EXISTS (
                  SELECT 1

                  FROM restaurants r

                  WHERE r.id =
                        fc.restaurant_id

                    AND r.owner_id = $2
              )

              AND NOT EXISTS (
                  SELECT 1

                  FROM foods f

                  WHERE f.category_id =
                        fc.id
              )

            RETURNING
                fc.id,
                fc.name
            `,
            [
                id,
                owner
            ]
        );

    if (
        result.rows.length > 0
    ) {
        return result.rows[0];
    }

    const ownedCategory =
        await pool.query(
            `
            SELECT
                fc.id

            FROM food_categories fc

            WHERE fc.id = $1

              AND EXISTS (
                  SELECT 1

                  FROM restaurants r

                  WHERE r.id =
                        fc.restaurant_id

                    AND r.owner_id =
                        $2
              )

            LIMIT 1
            `,
            [
                id,
                owner
            ]
        );

    if (
        ownedCategory.rows.length === 0
    ) {
        throw createError(
            "Category not found or you do not have permission to delete it",
            404
        );
    }

    throw createError(
        "Cannot delete this category because it contains food items",
        409
    );
}

/*
|--------------------------------------------------------------------------
| Admin - Get All Categories
|--------------------------------------------------------------------------
|
| Features:
| - Search
| - Restaurant filter
| - Pagination
| - Statistics
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
        optionalId(
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
        (page - 1) *
        limit;

    const values = [];
    const conditions = [];

    /*
     * Search
     */
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
                fc.name
                    ILIKE ${placeholder}
                    ESCAPE '\\'

                OR COALESCE(
                    fc.description,
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
            )
        `);
    }

    /*
     * Restaurant filter
     */
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

        /*
         * Statistics
         */
        const statsResult =
            await client.query(
                `
                SELECT
                    COUNT(*)::int
                        AS total,

                    COUNT(*)
                        FILTER (
                            WHERE food_count > 0
                        )::int
                        AS with_foods,

                    COUNT(*)
                        FILTER (
                            WHERE food_count = 0
                        )::int
                        AS empty,

                    COUNT(*)
                        FILTER (
                            WHERE ${filter}
                        )::int
                        AS filtered

                FROM (
                    SELECT
                        fc.id,
                        fc.name,
                        fc.description,
                        fc.restaurant_id,

                        COUNT(f.id)::int
                            AS food_count

                    FROM food_categories fc

                    JOIN restaurants r
                        ON r.id =
                            fc.restaurant_id

                    LEFT JOIN foods f
                        ON f.category_id =
                            fc.id

                    GROUP BY
                        fc.id

                ) category_stats
                `,
                values
            );

        /*
         * Category list
         */
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
                    fc.created_at DESC,
                    fc.id DESC

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
            },

            statistics: {
                total:
                    Number(
                        stats.total
                    ),

                withFoods:
                    Number(
                        stats.with_foods
                    ),

                empty:
                    Number(
                        stats.empty
                    )
            }
        };
    } catch (error) {
        await client
            .query(
                "ROLLBACK"
            )
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
    const id =
        requireId(
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

                r.is_active
                    AS restaurant_is_active,

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
                r.name,
                r.is_active

            LIMIT 1
            `,
            [id]
        );

    return (
        result.rows[0] ||
        null
    );
}

/*
|--------------------------------------------------------------------------
| Admin - Create Category
|--------------------------------------------------------------------------
*/
async function createAdminCategory(
    data
) {
    if (
        !data ||
        typeof data !== "object" ||
        Array.isArray(data)
    ) {
        throw createError(
            "Category data must be a JSON object"
        );
    }

    const restaurantId =
        requireId(
            data.restaurant_id,
            "Restaurant ID"
        );

    const fields =
        validateCategoryData(
            data,
            {
                requireName: true
            }
        );

    const restaurant =
        await pool.query(
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

    if (
        restaurant.rows.length === 0
    ) {
        throw createError(
            "Restaurant not found",
            404
        );
    }

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
                fields.name,
                fields.hasDescription
                    ? fields.description
                    : null
            ]
        );

    return result.rows[0];
}

/*
|--------------------------------------------------------------------------
| Admin - Update Category
|--------------------------------------------------------------------------
|
| Supports:
| - name
| - description
| - restaurant_id
|
| A category cannot be moved to another restaurant
| while foods are still attached to it.
|--------------------------------------------------------------------------
*/
async function updateAdminCategory(
    categoryId,
    data
) {
    const id =
        requireId(
            categoryId,
            "Category ID"
        );

    if (
        !data ||
        typeof data !== "object" ||
        Array.isArray(data)
    ) {
        throw createError(
            "Category data must be a JSON object"
        );
    }

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
            [id]
        );

    if (
        existing.rows.length === 0
    ) {
        throw createError(
            "Category not found",
            404
        );
    }

    const currentRestaurantId =
        String(
            existing.rows[0].restaurant_id
        );

    const fields =
        validateCategoryData(
            data
        );

    const assignments = [];
    const values = [];

    let targetRestaurantId =
        currentRestaurantId;

    /*
     * Restaurant change
     */
    if (
        Object.prototype.hasOwnProperty.call(
            data,
            "restaurant_id"
        )
    ) {
        targetRestaurantId =
            requireId(
                data.restaurant_id,
                "Restaurant ID"
            );

        const restaurant =
            await pool.query(
                `
                SELECT
                    id,
                    name,
                    is_active

                FROM restaurants

                WHERE id = $1

                LIMIT 1
                `,
                [targetRestaurantId]
            );

        if (
            restaurant.rows.length === 0
        ) {
            throw createError(
                "Restaurant not found",
                404
            );
        }

        /*
         * Do not move a category that
         * already has foods attached.
         */
        if (
            targetRestaurantId !==
            currentRestaurantId
        ) {
            const foodCheck =
                await pool.query(
                    `
                    SELECT
                        1

                    FROM foods

                    WHERE category_id =
                        $1

                    LIMIT 1
                    `,
                    [id]
                );

            if (
                foodCheck.rows.length > 0
            ) {
                throw createError(
                    "Cannot move this category to another restaurant while food items are attached to it",
                    409
                );
            }

            values.push(
                targetRestaurantId
            );

            assignments.push(
                `restaurant_id = $${values.length}`
            );
        }
    }

    /*
     * Name
     */
    if (fields.hasName) {
        values.push(
            fields.name
        );

        assignments.push(
            `name = $${values.length}`
        );
    }

    /*
     * Description
     */
    if (
        fields.hasDescription
    ) {
        values.push(
            fields.description
        );

        assignments.push(
            `description = $${values.length}`
        );
    }

    if (
        assignments.length === 0
    ) {
        throw createError(
            "No fields were provided for update"
        );
    }

    values.push(id);

    const result =
        await pool.query(
            `
            UPDATE food_categories

            SET
                ${assignments.join(", ")},
                updated_at =
                    CURRENT_TIMESTAMP

            WHERE id =
                $${values.length}

            RETURNING *
            `,
            values
        );

    if (
        result.rows.length === 0
    ) {
        throw createError(
            "Category could not be updated",
            409
        );
    }

    return result.rows[0];
}

/*
|--------------------------------------------------------------------------
| Admin - Delete Category
|--------------------------------------------------------------------------
|
| Prevents deletion when foods are attached.
|--------------------------------------------------------------------------
*/
async function deleteAdminCategory(
    categoryId
) {
    const id =
        requireId(
            categoryId,
            "Category ID"
        );

    /*
     * Check category exists.
     */
    const existing =
        await pool.query(
            `
            SELECT
                id,
                name

            FROM food_categories

            WHERE id = $1

            LIMIT 1
            `,
            [id]
        );

    if (
        existing.rows.length === 0
    ) {
        throw createError(
            "Category not found",
            404
        );
    }

    /*
     * Prevent deleting a category
     * that still contains food items.
     */
    const foodCheck =
        await pool.query(
            `
            SELECT
                COUNT(*)::int
                    AS food_count

            FROM foods

            WHERE category_id = $1
            `,
            [id]
        );

    const foodCount =
        Number(
            foodCheck.rows[0].food_count
        );

    if (foodCount > 0) {
        throw createError(
            "Cannot delete this category because it contains food items",
            409
        );
    }

    const result =
        await pool.query(
            `
            DELETE FROM food_categories

            WHERE id = $1

            RETURNING
                id,
                restaurant_id,
                name
            `,
            [id]
        );

    if (
        result.rows.length === 0
    ) {
        throw createError(
            "Category could not be deleted",
            409
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
    getCategoriesByRestaurantId,
    getCategoryById,
    getCategoriesByOwnerId,
    createCategory,
    updateCategory,
    deleteCategory,

    getAdminCategories,
    getAdminCategoryById,
    createAdminCategory,
    updateAdminCategory,
    deleteAdminCategory
};
