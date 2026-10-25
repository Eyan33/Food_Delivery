const foodService = require("../../services/food/foodService");

/*
|--------------------------------------------------------------------------
| Public - Get All Foods
|--------------------------------------------------------------------------
*/
async function getFoods(req, res) {
    try {
        const foods = await foodService.getAllFoods(req.query.restaurant_id);

        return res.status(200).json({
            success: true,
            data: { foods }
        });
    } catch (error) {
        console.error("Get foods error:", error);

        return res.status(500).json({
            success: false,
            message: "Failed to retrieve foods"
        });
    }
}

/*
|--------------------------------------------------------------------------
| Public - Get Food Image
|--------------------------------------------------------------------------
*/
async function getFoodImage(req, res) {
    try {
        const image = await foodService.getFoodImage(req.params.id);
        if (!image) {
            return res.status(404).json({ success: false, message: "Food image not found" });
        }
        res.set("Content-Type", image.image_mime_type);
        res.set("Cache-Control", "public, max-age=3600");
        res.set("X-Content-Type-Options", "nosniff");
        return res.status(200).send(image.image_data);
    } catch (error) {
        console.error("Get food image error:", error);
        return res.status(error.statusCode || 400).json({
            success: false, message: error.message || "Failed to retrieve food image"
        });
    }
}

/*
|--------------------------------------------------------------------------
| Public - Get One Food
|--------------------------------------------------------------------------
*/
async function getFood(req, res) {
    try {
        const food = await foodService.getFoodById(
            req.params.id
        );

        if (!food) {
            return res.status(404).json({
                success: false,
                message: "Food item not found"
            });
        }

        return res.status(200).json({
            success: true,
            data: { food }
        });
    } catch (error) {
        console.error("Get food error:", error);

        return res.status(500).json({
            success: false,
            message: "Failed to retrieve food"
        });
    }
}

/*
|--------------------------------------------------------------------------
| Restaurant - Get My Foods
|--------------------------------------------------------------------------
*/
async function getMyFoods(req, res) {
    try {
        const foods = await foodService.getMyFoods(
            req.user.id
        );

        return res.status(200).json({
            success: true,
            data: { foods }
        });
    } catch (error) {
        console.error("Get my foods error:", error);

        return res.status(error.statusCode || 400).json({
            success: false,
            message: error.message
        });
    }
}

/*
|--------------------------------------------------------------------------
| Restaurant - Create Food
|--------------------------------------------------------------------------
*/
async function createFood(req, res) {
    try {
        const food = await foodService.createFood(
            req.user.id,
            req.body
        );

        return res.status(201).json({
            success: true,
            message: "Food created successfully",
            data: { food }
        });
    } catch (error) {
        console.error("Create food error:", error);

        if (error.code === "23505") {
            return res.status(409).json({
                success: false,
                message: "A food item with this information already exists"
            });
        }

        return res.status(error.statusCode || 400).json({
            success: false,
            message: error.message
        });
    }
}

/*
|--------------------------------------------------------------------------
| Restaurant - Update Food
|--------------------------------------------------------------------------
*/
async function updateFood(req, res) {
    try {
        const food = await foodService.updateFood(
            req.user.id,
            req.params.id,
            req.body
        );

        return res.status(200).json({
            success: true,
            message: "Food updated successfully",
            data: { food }
        });
    } catch (error) {
        console.error("Update food error:", error);

        return res.status(error.statusCode || 400).json({
            success: false,
            message: error.message
        });
    }
}

/*
|--------------------------------------------------------------------------
| Restaurant - Delete Food
|--------------------------------------------------------------------------
*/
async function deleteFood(req, res) {
    try {
        const food = await foodService.deleteFood(
            req.user.id,
            req.params.id
        );

        return res.status(200).json({
            success: true,
            message: "Food deleted successfully",
            data: { food }
        });
    } catch (error) {
        console.error("Delete food error:", error);

        if (error.code === "23503") {
            return res.status(409).json({
                success: false,
                message: "Food item cannot be deleted because it is being used by another record"
            });
        }

        return res.status(error.statusCode || 400).json({
            success: false,
            message: error.message
        });
    }
}

/*
|--------------------------------------------------------------------------
| Restaurant - Update Food Availability
|--------------------------------------------------------------------------
*/
async function updateFoodAvailability(req, res) {
    try {
        const { is_available } = req.body;

        if (typeof is_available !== "boolean") {
            return res.status(400).json({
                success: false,
                message: "is_available must be a boolean"
            });
        }

        const food =
            await foodService.updateFoodAvailability(
                req.user.id,
                req.params.id,
                is_available
            );

        return res.status(200).json({
            success: true,
            message: is_available
                ? "Food is now available"
                : "Food is now unavailable",
            data: { food }
        });
    } catch (error) {
        console.error(
            "Update food availability error:",
            error
        );

        return res.status(error.statusCode || 400).json({
            success: false,
            message: error.message
        });
    }
}

/*
|--------------------------------------------------------------------------
| Restaurant - Update Food Featured
|--------------------------------------------------------------------------
*/
async function updateFoodFeatured(req, res) {
    try {
        const { is_featured } = req.body;

        if (typeof is_featured !== "boolean") {
            return res.status(400).json({
                success: false,
                message: "is_featured must be a boolean"
            });
        }

        const food =
            await foodService.updateFoodFeatured(
                req.user.id,
                req.params.id,
                is_featured
            );

        return res.status(200).json({
            success: true,
            message: is_featured
                ? "Food marked as featured"
                : "Food removed from featured",
            data: { food }
        });
    } catch (error) {
        console.error(
            "Update food featured error:",
            error
        );

        return res.status(error.statusCode || 400).json({
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
            await foodService.getMyCategories(
                req.user.id
            );

        return res.status(200).json({
            success: true,
            data: { categories }
        });
    } catch (error) {
        console.error(
            "Get categories error:",
            error
        );

        return res.status(error.statusCode || 400).json({
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
            await foodService.createCategory(
                req.user.id,
                req.body
            );

        return res.status(201).json({
            success: true,
            message: "Category created successfully",
            data: { category }
        });
    } catch (error) {
        console.error(
            "Create category error:",
            error
        );

        if (error.code === "23505") {
            return res.status(409).json({
                success: false,
                message: "A category with this name already exists"
            });
        }

        return res.status(error.statusCode || 400).json({
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
            await foodService.updateCategory(
                req.user.id,
                req.params.id,
                req.body
            );

        return res.status(200).json({
            success: true,
            message: "Category updated successfully",
            data: { category }
        });
    } catch (error) {
        console.error(
            "Update category error:",
            error
        );

        if (error.code === "23505") {
            return res.status(409).json({
                success: false,
                message: "A category with this name already exists"
            });
        }

        return res.status(error.statusCode || 400).json({
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
            await foodService.deleteCategory(
                req.user.id,
                req.params.id
            );

        return res.status(200).json({
            success: true,
            message: "Category deleted successfully",
            data: { category }
        });
    } catch (error) {
        console.error(
            "Delete category error:",
            error
        );

        if (error.code === "23503") {
            return res.status(409).json({
                success: false,
                message: "Category cannot be deleted because food items are using it"
            });
        }

        return res.status(error.statusCode || 400).json({
            success: false,
            message: error.message
        });
    }
}

/*
|--------------------------------------------------------------------------
| Admin - Get Foods
|--------------------------------------------------------------------------
*/
async function getAdminFoods(req, res) {
    try {
        const result =
            await foodService.getAdminFoods({
                search: req.query.search,
                restaurantId: req.query.restaurant_id,
                categoryId: req.query.category_id,
                isAvailable: req.query.is_available,
                isFeatured: req.query.is_featured,
                page: req.query.page,
                limit: req.query.limit
            });

        return res.status(200).json({
            success: true,
            data: {
                foods: result.foods,
                pagination: result.pagination,
                statistics: result.statistics
            }
        });
    } catch (error) {
        console.error(
            "Admin get foods error:",
            error
        );

        return res.status(error.statusCode || 400).json({
            success: false,
            message: error.message
        });
    }
}

/*
|--------------------------------------------------------------------------
| Admin - Get One Food
|--------------------------------------------------------------------------
*/
async function getAdminFood(req, res) {
    try {
        const food =
            await foodService.getAdminFoodById(
                req.params.id
            );

        if (!food) {
            return res.status(404).json({
                success: false,
                message: "Food item not found"
            });
        }

        return res.status(200).json({
            success: true,
            data: { food }
        });
    } catch (error) {
        console.error(
            "Admin get food error:",
            error
        );

        return res.status(error.statusCode || 400).json({
            success: false,
            message: error.message
        });
    }
}

/*
|--------------------------------------------------------------------------
| Admin - Create Food
|--------------------------------------------------------------------------
*/
async function createAdminFood(req, res) {
    try {
        const food =
            await foodService.createAdminFood(
                req.body
            );

        return res.status(201).json({
            success: true,
            message: "Food created successfully",
            data: { food }
        });
    } catch (error) {
        console.error(
            "Admin create food error:",
            error
        );

        if (error.code === "23505") {
            return res.status(409).json({
                success: false,
                message: "A food item with this information already exists"
            });
        }

        return res.status(error.statusCode || 400).json({
            success: false,
            message: error.message
        });
    }
}

/*
|--------------------------------------------------------------------------
| Admin - Update Food
|--------------------------------------------------------------------------
*/
async function updateAdminFood(req, res) {
    try {
        const food =
            await foodService.updateAdminFood(
                req.params.id,
                req.body
            );

        return res.status(200).json({
            success: true,
            message: "Food updated successfully",
            data: { food }
        });
    } catch (error) {
        console.error(
            "Admin update food error:",
            error
        );

        if (error.code === "23505") {
            return res.status(409).json({
                success: false,
                message: "A food item with this information already exists"
            });
        }

        return res.status(error.statusCode || 400).json({
            success: false,
            message: error.message
        });
    }
}

/*
|--------------------------------------------------------------------------
| Admin - Delete Food
|--------------------------------------------------------------------------
*/
async function deleteAdminFood(req, res) {
    try {
        const food =
            await foodService.deleteAdminFood(
                req.params.id
            );

        return res.status(200).json({
            success: true,
            message: "Food deleted successfully",
            data: { food }
        });
    } catch (error) {
        console.error(
            "Admin delete food error:",
            error
        );

        if (error.code === "23503") {
            return res.status(409).json({
                success: false,
                message: "Food item cannot be deleted because it is being used by another record"
            });
        }

        return res.status(error.statusCode || 400).json({
            success: false,
            message: error.message
        });
    }
}

/*
|--------------------------------------------------------------------------
| Admin - Update Food Availability
|--------------------------------------------------------------------------
*/
async function updateAdminFoodAvailability(req, res) {
    try {
        const { is_available } = req.body;

        if (typeof is_available !== "boolean") {
            return res.status(400).json({
                success: false,
                message: "is_available must be a boolean"
            });
        }

        const food =
            await foodService.updateAdminFoodAvailability(
                req.params.id,
                is_available
            );

        return res.status(200).json({
            success: true,
            message: is_available
                ? "Food is now available"
                : "Food is now unavailable",
            data: { food }
        });
    } catch (error) {
        console.error(
            "Admin update food availability error:",
            error
        );

        return res.status(error.statusCode || 400).json({
            success: false,
            message: error.message
        });
    }
}

/*
|--------------------------------------------------------------------------
| Admin - Update Food Featured
|--------------------------------------------------------------------------
*/
async function updateAdminFoodFeatured(req, res) {
    try {
        const { is_featured } = req.body;

        if (typeof is_featured !== "boolean") {
            return res.status(400).json({
                success: false,
                message: "is_featured must be a boolean"
            });
        }

        const food =
            await foodService.updateAdminFoodFeatured(
                req.params.id,
                is_featured
            );

        return res.status(200).json({
            success: true,
            message: is_featured
                ? "Food marked as featured"
                : "Food removed from featured",
            data: { food }
        });
    } catch (error) {
        console.error(
            "Admin update food featured error:",
            error
        );

        return res.status(error.statusCode || 400).json({
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
            await foodService.getAdminCategories({
                search: req.query.search,
                restaurantId: req.query.restaurant_id,
                page: req.query.page,
                limit: req.query.limit
            });

        return res.status(200).json({
            success: true,
            data: {
                categories: result.categories,
                pagination: result.pagination
            }
        });
    } catch (error) {
        console.error(
            "Admin get categories error:",
            error
        );

        return res.status(error.statusCode || 400).json({
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
            await foodService.getAdminCategoryById(
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
            data: { category }
        });
    } catch (error) {
        console.error(
            "Admin get category error:",
            error
        );

        return res.status(error.statusCode || 400).json({
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
            await foodService.createAdminCategory(
                req.body
            );

        return res.status(201).json({
            success: true,
            message: "Category created successfully",
            data: { category }
        });
    } catch (error) {
        console.error(
            "Admin create category error:",
            error
        );

        if (error.code === "23505") {
            return res.status(409).json({
                success: false,
                message: "A category with this name already exists for this restaurant"
            });
        }

        return res.status(error.statusCode || 400).json({
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
            await foodService.updateAdminCategory(
                req.params.id,
                req.body
            );

        return res.status(200).json({
            success: true,
            message: "Category updated successfully",
            data: { category }
        });
    } catch (error) {
        console.error(
            "Admin update category error:",
            error
        );

        if (error.code === "23505") {
            return res.status(409).json({
                success: false,
                message: "A category with this name already exists for this restaurant"
            });
        }

        return res.status(error.statusCode || 400).json({
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
            await foodService.deleteAdminCategory(
                req.params.id
            );

        return res.status(200).json({
            success: true,
            message: "Category deleted successfully",
            data: { category }
        });
    } catch (error) {
        console.error(
            "Admin delete category error:",
            error
        );

        if (error.code === "23503") {
            return res.status(409).json({
                success: false,
                message: "Category cannot be deleted because food items are using it"
            });
        }

        return res.status(error.statusCode || 400).json({
            success: false,
            message: error.message
        });
    }
}

module.exports = {
    getFoods,
    getFood,
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
    getAdminFood,
    createAdminFood,
    updateAdminFood,
    deleteAdminFood,
    updateAdminFoodAvailability,
    updateAdminFoodFeatured,

    getAdminCategories,
    getAdminCategory,
    createAdminCategory,
    updateAdminCategory,
    deleteAdminCategory
};