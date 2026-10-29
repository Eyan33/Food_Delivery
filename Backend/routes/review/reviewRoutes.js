const express = require('express');
const router = express.Router();
const { 
    createReview, 
    getMyOrderReviews,
    getRestaurantReviews, 
    deleteReview 
} = require('../../controllers/reviews/reviewController');
const authMiddleware = require('../../middleware/auth/authMiddleware');
const authorizeRoles = require('../../middleware/auth/roleMiddleware');
const adminController = require('../../controllers/admin/adminController');

// Public endpoints
router.get('/restaurant/:restaurantId', getRestaurantReviews);

// Admin review moderation
router.get('/admin', authMiddleware, authorizeRoles('admin'), adminController.getReviews);
router.patch('/admin/:id/visibility', authMiddleware, authorizeRoles('admin'), adminController.updateReviewVisibility);

// Protected endpoints (Requires authentication)
router.get('/my-orders', authMiddleware, authorizeRoles('customer'), getMyOrderReviews);
router.post('/', authMiddleware, authorizeRoles('customer'), createReview);
router.delete('/:id', authMiddleware, deleteReview);

module.exports = router;