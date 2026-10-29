"use strict";

const pool = require("../../config/database");

async function getRestaurantId(userId) {
    const result = await pool.query(
        "SELECT id FROM public.restaurants WHERE owner_id = $1 LIMIT 1",
        [userId],
    );
    return result.rows[0] ? result.rows[0].id : null;
}

function handleError(res, error, action) {
    console.error(`[restaurant-notifications] ${action} failed:`, error.message);
    return res.status(500).json({
        success: false,
        message: "Could not load notifications right now.",
    });
}

async function list(req, res) {
    try {
        const restaurantId = await getRestaurantId(req.user.id);
        if (!restaurantId) {
            return res.status(404).json({ success: false, message: "Restaurant profile not found." });
        }

        const result = await pool.query(
            `SELECT id, type, title, message, order_id, target_url, created_at, read_at
             FROM public.restaurant_notifications
             WHERE restaurant_id = $1 AND read_at IS NULL
             ORDER BY created_at DESC, id DESC
             LIMIT 50`,
            [restaurantId],
        );
        const unread = await pool.query(
            "SELECT COUNT(*)::int AS count FROM public.restaurant_notifications WHERE restaurant_id = $1 AND read_at IS NULL",
            [restaurantId],
        );

        return res.json({
            success: true,
            data: { notifications: result.rows, unread_count: unread.rows[0].count },
        });
    } catch (error) {
        return handleError(res, error, "list");
    }
}

async function markRead(req, res) {
    try {
        const restaurantId = await getRestaurantId(req.user.id);
        if (!restaurantId) {
            return res.status(404).json({ success: false, message: "Restaurant profile not found." });
        }

        const result = await pool.query(
            `UPDATE public.restaurant_notifications
             SET read_at = COALESCE(read_at, CURRENT_TIMESTAMP)
             WHERE id = $1 AND restaurant_id = $2
             RETURNING id`,
            [req.params.id, restaurantId],
        );

        if (!result.rowCount) {
            return res.status(404).json({ success: false, message: "Notification not found." });
        }
        return res.json({ success: true });
    } catch (error) {
        return handleError(res, error, "mark read");
    }
}

async function markAllRead(req, res) {
    try {
        const restaurantId = await getRestaurantId(req.user.id);
        if (!restaurantId) {
            return res.status(404).json({ success: false, message: "Restaurant profile not found." });
        }

        await pool.query(
            "UPDATE public.restaurant_notifications SET read_at = CURRENT_TIMESTAMP WHERE restaurant_id = $1 AND read_at IS NULL",
            [restaurantId],
        );
        return res.json({ success: true });
    } catch (error) {
        return handleError(res, error, "mark all read");
    }
}

async function getPreferences(req, res) {
    try {
        const restaurantId = await getRestaurantId(req.user.id);
        if (!restaurantId) return res.status(404).json({ success: false, message: "Restaurant profile not found." });
        const result = await pool.query(
            `INSERT INTO public.restaurant_notification_preferences (restaurant_id)
             VALUES ($1) ON CONFLICT (restaurant_id) DO NOTHING`,
            [restaurantId],
        );
        const preferences = await pool.query(
            `SELECT new_orders, order_updates, promotions, email
             FROM public.restaurant_notification_preferences WHERE restaurant_id = $1`,
            [restaurantId],
        );
        return res.json({ success: true, data: { preferences: preferences.rows[0] } });
    } catch (error) {
        return handleError(res, error, "get preferences");
    }
}

async function updatePreferences(req, res) {
    try {
        const restaurantId = await getRestaurantId(req.user.id);
        if (!restaurantId) return res.status(404).json({ success: false, message: "Restaurant profile not found." });
        const input = req.body;
        const allowed = ["new_orders", "order_updates", "promotions", "email"];
        if (!input || typeof input !== "object" || Array.isArray(input) ||
            Object.keys(input).some(key => !allowed.includes(key)) ||
            allowed.some(key => typeof input[key] !== "boolean")) {
            return res.status(400).json({ success: false, message: "Provide boolean values for new_orders, order_updates, promotions, and email." });
        }
        const result = await pool.query(
            `INSERT INTO public.restaurant_notification_preferences
                (restaurant_id, new_orders, order_updates, promotions, email, updated_at)
             VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)
             ON CONFLICT (restaurant_id) DO UPDATE SET
                new_orders = EXCLUDED.new_orders,
                order_updates = EXCLUDED.order_updates,
                promotions = EXCLUDED.promotions,
                email = EXCLUDED.email,
                updated_at = CURRENT_TIMESTAMP
             RETURNING new_orders, order_updates, promotions, email`,
            [restaurantId, input.new_orders, input.order_updates, input.promotions, input.email],
        );
        return res.json({ success: true, data: { preferences: result.rows[0] } });
    } catch (error) {
        return handleError(res, error, "update preferences");
    }
}

module.exports = { list, markRead, markAllRead, getPreferences, updatePreferences };
