const pool = require("../../config/database");

// Create a new review
const createReview = async (req, res) => {
    try {
        const userId = req.user.id; // Assumes auth middleware attaches the user object with id
        const { restaurant_id, order_id, rating, comment } = req.body;

        if (!restaurant_id || !rating) {
            return res
                .status(400)
                .json({ error: "Restaurant ID and rating are required." });
        }

        const query = `
            INSERT INTO reviews (customer_id, restaurant_id, order_id, rating, comment)
            VALUES ($1, $2, $3, $4, $5)
            RETURNING *;
        `;
        const values = [
            userId,
            restaurant_id,
            order_id || null,
            rating,
            comment || "",
        ];
        const newReview = await pool.query(query, values);

        res.status(201).json({
            message: "Review created successfully",
            review: newReview.rows[0],
        });
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ error: "Server error" });
    }
};

// Get all reviews for a specific restaurant
const getRestaurantReviews = async (req, res) => {
    try {
        const { restaurantId } = req.params;

        const query = `
            SELECT 
                reviews.*,
                CONCAT(users.first_name, ' ', users.last_name) AS customer_name
            FROM reviews
            JOIN users ON reviews.customer_id = users.id
            WHERE restaurant_id = $1
            ORDER BY created_at DESC;
        `;

        const reviews = await pool.query(query, [restaurantId]);
        res.status(200).json(reviews.rows);
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ error: "Server error" });
    }
};

// Delete a review (Customer or Admin)
const deleteReview = async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user.id;

        const reviewCheck = await pool.query(
            "SELECT * FROM reviews WHERE id = $1",
            [id],
        );
        if (reviewCheck.rows.length === 0) {
            return res.status(404).json({ error: "Review not found" });
        }

        // Ensure user owns the review or is an admin
        if (
            reviewCheck.rows[0].customer_id !== userId &&
            req.user.role !== "admin"
        ) {
            return res
                .status(403)
                .json({ error: "Unauthorized to delete this review" });
        }

        await pool.query("DELETE FROM reviews WHERE id = $1", [id]);
        res.status(200).json({ message: "Review deleted successfully" });
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ error: "Server error" });
    }
};

module.exports = {
    createReview,
    getRestaurantReviews,
    deleteReview,
};
