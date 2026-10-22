const express = require('express');
const router = express.Router();
const { 
    createReview, 
    getRestaurantReviews, 
    deleteReview 
} = require('../../controllers/reviews/reviewController');
const authMiddleware = require('../../middleware/auth/authMiddleware');
const authorizeRoles = require('../../middleware/auth/roleMiddleware');
const adminController = require('../../controllers/admin/adminController');
const auditAdminAction = require('../../middleware/adminAuditMiddleware');

// Public endpoints
router.get('/restaurant/:restaurantId', getRestaurantReviews);

// Admin review moderation
router.get('/admin', authMiddleware, authorizeRoles('admin'), adminController.getReviews);
router.patch('/admin/:id/visibility', authMiddleware, authorizeRoles('admin'), auditAdminAction, adminController.updateReviewVisibility);

// Protected endpoints (Requires authentication)
router.post('/', authMiddleware, authorizeRoles('customer'), createReview);
router.delete('/:id', authMiddleware, auditAdminAction, deleteReview);

module.exports = router;