const express = require("express");

const categoryController =
    require("../../controllers/category/categoryController");

const authenticateToken =
    require("../../middleware/auth/authMiddleware");

const authorizeRoles =
    require("../../middleware/auth/roleMiddleware");
const auditAdminAction =
    require("../../middleware/adminAuditMiddleware");

const router = express.Router();

/*
|--------------------------------------------------------------------------
| Admin Routes
|--------------------------------------------------------------------------
|
| Fixed admin paths come before /:id.
|
*/

/*
 * Admin - Get all categories
 *
 * GET /api/categories/admin
 */
router.get(
    "/admin",
    authenticateToken,
    authorizeRoles("admin"),
    categoryController.getAdminCategories
);

/*
 * Admin - Get one category
 *
 * GET /api/categories/admin/:id
 */
router.get(
    "/admin/:id",
    authenticateToken,
    authorizeRoles("admin"),
    categoryController.getAdminCategory
);

/*
 * Admin - Create category
 *
 * POST /api/categories/admin
 */
router.post(
    "/admin",
    authenticateToken,
    authorizeRoles("admin"),
    auditAdminAction,
    categoryController.createAdminCategory
);

/*
 * Admin - Update category
 *
 * PUT /api/categories/admin/:id
 */
router.put(
    "/admin/:id",
    authenticateToken,
    authorizeRoles("admin"),
    auditAdminAction,
    categoryController.updateAdminCategory
);

/*
 * Admin - Delete category
 *
 * DELETE /api/categories/admin/:id
 */
router.delete(
    "/admin/:id",
    authenticateToken,
    authorizeRoles("admin"),
    auditAdminAction,
    categoryController.deleteAdminCategory
);

/*
|--------------------------------------------------------------------------
| Public Routes
|--------------------------------------------------------------------------
*/

/*
 * Get categories for a restaurant
 *
 * GET /api/categories/restaurant/:restaurantId
 */
router.get(
    "/restaurant/:restaurantId",
    categoryController.getRestaurantCategories
);

/*
 * Get one category
 *
 * GET /api/categories/:id
 */
router.get(
    "/:id",
    categoryController.getCategory
);

/*
|--------------------------------------------------------------------------
| Restaurant Owner Routes
|--------------------------------------------------------------------------
*/

/*
 * Get my restaurant categories
 *
 * GET /api/categories/owner/me
 */
router.get(
    "/owner/me",
    authenticateToken,
    authorizeRoles("restaurant"),
    categoryController.getMyCategories
);

/*
 * Create category
 *
 * POST /api/categories
 */
router.post(
    "/",
    authenticateToken,
    authorizeRoles("restaurant"),
    categoryController.createCategory
);

/*
 * Update category
 *
 * PUT /api/categories/:id
 */
router.put(
    "/:id",
    authenticateToken,
    authorizeRoles("restaurant"),
    categoryController.updateCategory
);

/*
 * Delete category
 *
 * DELETE /api/categories/:id
 */
router.delete(
    "/:id",
    authenticateToken,
    authorizeRoles("restaurant"),
    categoryController.deleteCategory
);

module.exports = router;
