const express = require("express");

const foodController = require("../../controllers/food/foodController");

const authenticateToken = require("../../middleware/auth/authMiddleware");

const authorizeRoles = require("../../middleware/auth/roleMiddleware");
const auditAdminAction = require("../../middleware/adminAuditMiddleware");

const router = express.Router();

/*
|--------------------------------------------------------------------------
| Admin Routes
|--------------------------------------------------------------------------
|
| Fixed admin paths must come before /:id.
|
*/

/*
 * Admin - Categories
 */
router.get(
  "/admin/categories",
  authenticateToken,
  authorizeRoles("admin"),
  foodController.getAdminCategories,
);

router.get(
  "/admin/categories/:id",
  authenticateToken,
  authorizeRoles("admin"),
  foodController.getAdminCategory,
);

router.post(
  "/admin/categories",
  authenticateToken,
  authorizeRoles("admin"),
  auditAdminAction,
  foodController.createAdminCategory,
);

router.put(
  "/admin/categories/:id",
  authenticateToken,
  authorizeRoles("admin"),
  auditAdminAction,
  foodController.updateAdminCategory,
);

router.delete(
  "/admin/categories/:id",
  authenticateToken,
  authorizeRoles("admin"),
  auditAdminAction,
  foodController.deleteAdminCategory,
);

/*
 * Admin - Foods
 */
router.get(
  "/admin",
  authenticateToken,
  authorizeRoles("admin"),
  foodController.getAdminFoods,
);

router.get(
  "/admin/:id",
  authenticateToken,
  authorizeRoles("admin"),
  foodController.getAdminFood,
);

router.post(
  "/admin",
  authenticateToken,
  authorizeRoles("admin"),
  auditAdminAction,
  foodController.createAdminFood,
);

router.put(
  "/admin/:id",
  authenticateToken,
  authorizeRoles("admin"),
  auditAdminAction,
  foodController.updateAdminFood,
);

router.delete(
  "/admin/:id",
  authenticateToken,
  authorizeRoles("admin"),
  auditAdminAction,
  foodController.deleteAdminFood,
);

router.patch(
  "/admin/:id/availability",
  authenticateToken,
  authorizeRoles("admin"),
  auditAdminAction,
  foodController.updateAdminFoodAvailability,
);

router.patch(
  "/admin/:id/featured",
  authenticateToken,
  authorizeRoles("admin"),
  auditAdminAction,
  foodController.updateAdminFoodFeatured,
);

/*
|--------------------------------------------------------------------------
| Restaurant Owner Routes
|--------------------------------------------------------------------------
|
| Fixed paths must come before /:id.
|
*/

router.get(
  "/restaurant/my",
  authenticateToken,
  authorizeRoles("restaurant"),
  foodController.getMyFoods,
);

router.get(
  "/categories/my",
  authenticateToken,
  authorizeRoles("restaurant"),
  foodController.getMyCategories,
);

router.post(
  "/categories",
  authenticateToken,
  authorizeRoles("restaurant"),
  foodController.createCategory,
);

router.put(
  "/categories/:id",
  authenticateToken,
  authorizeRoles("restaurant"),
  foodController.updateCategory,
);

router.delete(
  "/categories/:id",
  authenticateToken,
  authorizeRoles("restaurant"),
  foodController.deleteCategory,
);

router.post(
  "/",
  authenticateToken,
  authorizeRoles("restaurant"),
  foodController.createFood,
);

router.put(
  "/:id",
  authenticateToken,
  authorizeRoles("restaurant"),
  foodController.updateFood,
);

router.delete(
  "/:id",
  authenticateToken,
  authorizeRoles("restaurant"),
  foodController.deleteFood,
);

router.patch(
  "/:id/availability",
  authenticateToken,
  authorizeRoles("restaurant"),
  foodController.updateFoodAvailability,
);

router.patch(
  "/:id/featured",
  authenticateToken,
  authorizeRoles("restaurant"),
  foodController.updateFoodFeatured,
);

/*
|--------------------------------------------------------------------------
| Public Routes
|--------------------------------------------------------------------------
*/

router.get("/", foodController.getFoods);

router.get("/:id", foodController.getFood);

module.exports = router;
