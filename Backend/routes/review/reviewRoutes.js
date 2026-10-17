const express = require('express');
const router = express.Router();
const { 
    createReview, 
    getRestaurantReviews, 
    deleteReview 
} = require('../../controllers/reviews/reviewController');
const authMiddleware = require('../../middleware/auth/authMiddleware');
const authorizeRoles = require('../../middleware/auth/roleMiddleware');

// Public endpoints
router.get('/restaurant/:restaurantId', getRestaurantReviews);

// Protected endpoints (Requires authentication)
router.post('/', authMiddleware, authorizeRoles('customer'), createReview);
router.delete('/:id', authMiddleware, deleteReview);

module.exports = router;