const categoryService =
    require("../../services/category/categoryService");

/*
|--------------------------------------------------------------------------
| Public - Get Categories for a Restaurant
|--------------------------------------------------------------------------
*/
async function getRestaurantCategories(req, res) {
    try {
        const categories =
            await categoryService.getCategoriesByRestaurantId(
                req.params.restaurantId
            );

        return res.status(200).json({
            success: true,
            data: {
                categories
            }
        });
    } catch (error) {
        console.error(
            "Get restaurant categories error:",
            error
        );

        return res.status(
            error.statusCode || 400
        ).json({
            success: false,
            message: error.message
        });
    }
}

/*
|--------------------------------------------------------------------------
| Public - Get One Category
|--------------------------------------------------------------------------
*/
async function getCategory(req, res) {
    try {
        const category =
            await categoryService.getCategoryById(
                req.params.id
            );

        if (!category) {
            return res.status(404).json({
                success: false,
                message: "Category not found"
            });
        }

        return res.status(200).json({
            success: true,
            data: {
                category
            }
        });
    } catch (error) {
        console.error(
            "Get category error:",
            error
        );

        return res.status(
            error.statusCode || 400
        ).json({
            success: false,
            message: error.message
        });
    }
}

/*
|--------------------------------------------------------------------------
| Restaurant - Get My Categories
|--------------------------------------------------------------------------
*/
async function getMyCategories(req, res) {
    try {
        const categories =
            await categoryService.getCategoriesByOwnerId(
                req.user.id
            );

        return res.status(200).json({
            success: true,
            data: {
                categories
            }
        });
    } catch (error) {
        console.error(
            "Get my categories error:",
            error
        );

        return res.status(
            error.statusCode || 400
        ).json({
            success: false,
            message: error.message
        });
    }
}

/*
|--------------------------------------------------------------------------
| Restaurant - Create Category
|--------------------------------------------------------------------------
*/
async function createCategory(req, res) {
    try {
        const category =
            await categoryService.createCategory(
                req.user.id,
                req.body
            );

        return res.status(201).json({
            success: true,
            message: "Category created successfully",
            data: {
                category
            }
        });
    } catch (error) {
        console.error(
            "Create category error:",
            error
        );

        if (error.code === "23505") {
            return res.status(409).json({
                success: false,
                message:
                    "A category with this name already exists"
            });
        }

        return res.status(
            error.statusCode || 400
        ).json({
            success: false,
            message: error.message
        });
    }
}

/*
|--------------------------------------------------------------------------
| Restaurant - Update Category
|--------------------------------------------------------------------------
*/
async function updateCategory(req, res) {
    try {
        const category =
            await categoryService.updateCategory(
                req.user.id,
                req.params.id,
                req.body
            );

        return res.status(200).json({
            success: true,
            message: "Category updated successfully",
            data: {
                category
            }
        });
    } catch (error) {
        console.error(
            "Update category error:",
            error
        );

        if (error.code === "23505") {
            return res.status(409).json({
                success: false,
                message:
                    "A category with this name already exists"
            });
        }

        return res.status(
            error.statusCode || 400
        ).json({
            success: false,
            message: error.message
        });
    }
}

/*
|--------------------------------------------------------------------------
| Restaurant - Delete Category
|--------------------------------------------------------------------------
*/
async function deleteCategory(req, res) {
    try {
        const category =
            await categoryService.deleteCategory(
                req.user.id,
                req.params.id
            );

        return res.status(200).json({
            success: true,
            message: "Category deleted successfully",
            data: {
                category
            }
        });
    } catch (error) {
        console.error(
            "Delete category error:",
            error
        );

        return res.status(
            error.statusCode || 400
        ).json({
            success: false,
            message: error.message
        });
    }
}

/*
|--------------------------------------------------------------------------
| Admin - Get Categories
|--------------------------------------------------------------------------
*/
async function getAdminCategories(req, res) {
    try {
        const result =
            await categoryService.getAdminCategories({
                search: req.query.search,
                restaurantId:
                    req.query.restaurant_id,
                page: req.query.page,
                limit: req.query.limit
            });

        return res.status(200).json({
            success: true,
            data: {
                categories:
                    result.categories,

                pagination:
                    result.pagination,

                statistics:
                    result.statistics
            }
        });
    } catch (error) {
        console.error(
            "Admin get categories error:",
            error
        );

        return res.status(
            error.statusCode || 400
        ).json({
            success: false,
            message: error.message
        });
    }
}

/*
|--------------------------------------------------------------------------
| Admin - Get One Category
|--------------------------------------------------------------------------
*/
async function getAdminCategory(req, res) {
    try {
        const category =
            await categoryService.getAdminCategoryById(
                req.params.id
            );

        if (!category) {
            return res.status(404).json({
                success: false,
                message: "Category not found"
            });
        }

        return res.status(200).json({
            success: true,
            data: {
                category
            }
        });
    } catch (error) {
        console.error(
            "Admin get category error:",
            error
        );

        return res.status(
            error.statusCode || 400
        ).json({
            success: false,
            message: error.message
        });
    }
}

/*
|--------------------------------------------------------------------------
| Admin - Create Category
|--------------------------------------------------------------------------
*/
async function createAdminCategory(req, res) {
    try {
        const category =
            await categoryService.createAdminCategory(
                req.body
            );

        return res.status(201).json({
            success: true,
            message: "Category created successfully",
            data: {
                category
            }
        });
    } catch (error) {
        console.error(
            "Admin create category error:",
            error
        );

        if (error.code === "23505") {
            return res.status(409).json({
                success: false,
                message:
                    "A category with this name already exists for this restaurant"
            });
        }

        return res.status(
            error.statusCode || 400
        ).json({
            success: false,
            message: error.message
        });
    }
}

/*
|--------------------------------------------------------------------------
| Admin - Update Category
|--------------------------------------------------------------------------
*/
async function updateAdminCategory(req, res) {
    try {
        const category =
            await categoryService.updateAdminCategory(
                req.params.id,
                req.body
            );

        return res.status(200).json({
            success: true,
            message: "Category updated successfully",
            data: {
                category
            }
        });
    } catch (error) {
        console.error(
            "Admin update category error:",
            error
        );

        if (error.code === "23505") {
            return res.status(409).json({
                success: false,
                message:
                    "A category with this name already exists for this restaurant"
            });
        }

        return res.status(
            error.statusCode || 400
        ).json({
            success: false,
            message: error.message
        });
    }
}

/*
|--------------------------------------------------------------------------
| Admin - Delete Category
|--------------------------------------------------------------------------
*/
async function deleteAdminCategory(req, res) {
    try {
        const category =
            await categoryService.deleteAdminCategory(
                req.params.id
            );

        return res.status(200).json({
            success: true,
            message: "Category deleted successfully",
            data: {
                category
            }
        });
    } catch (error) {
        console.error(
            "Admin delete category error:",
            error
        );

        if (error.code === "23503") {
            return res.status(409).json({
                success: false,
                message:
                    "Category cannot be deleted because it is being used by food items"
            });
        }

        return res.status(
            error.statusCode || 400
        ).json({
            success: false,
            message: error.message
        });
    }
}

module.exports = {
    getRestaurantCategories,
    getCategory,
    getMyCategories,
    createCategory,
    updateCategory,
    deleteCategory,

    getAdminCategories,
    getAdminCategory,
    createAdminCategory,
    updateAdminCategory,
    deleteAdminCategory
};
