const pool = require('../config/database');

const createReviewInDb = async (userId, restaurant_id, order_id, rating, comment) => {
    const query = `
        INSERT INTO reviews (customer_id, restaurant_id, order_id, rating, comment)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING *;
    `;
    const values = [userId, restaurant_id, order_id || null, rating, comment || ''];
    const result = await pool.query(query, values);
    return result.rows[0];
};

const getReviewsByRestaurantId = async (restaurantId) => {
    const query = `
        SELECT reviews.*, users.username AS customer_name
        FROM reviews
        JOIN users ON reviews.customer_id = users.id
        WHERE restaurant_id = $1
        ORDER BY created_at DESC;
    `;
    const result = await pool.query(query, [restaurantId]);
    return result.rows;
};

const getReviewById = async (id) => {
    const result = await pool.query('SELECT * FROM reviews WHERE id = $1', [id]);
    return result.rows[0];
};

const deleteReviewFromDb = async (id) => {
    await pool.query('DELETE FROM reviews WHERE id = $1', [id]);
};

module.exports = {
    createReviewInDb,
    getReviewsByRestaurantId,
    getReviewById,
    deleteReviewFromDb
};