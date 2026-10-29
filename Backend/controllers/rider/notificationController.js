"use strict";

const pool = require("../../config/database");

async function getRiderId(userId) {
    return userId;
}

function fail(res, action, error) {
    console.error(`[rider-notifications] ${action} failed:`, error.message);
    return res.status(500).json({ success: false, message: "Could not process notifications right now." });
}

async function list(req, res) {
    try {
        const riderId = await getRiderId(req.user.id);
        const result = await pool.query(
            `SELECT id, type, title, message, order_id, target_url, created_at, read_at
             FROM public.rider_notifications
             WHERE rider_id = $1
             ORDER BY created_at DESC, id DESC
             LIMIT 50`,
            [riderId],
        );
        const unread = await pool.query(
            "SELECT COUNT(*)::int AS count FROM public.rider_notifications WHERE rider_id = $1 AND read_at IS NULL",
            [riderId],
        );
        return res.json({ success: true, data: { notifications: result.rows, unread_count: unread.rows[0].count } });
    } catch (error) {
        return fail(res, "list", error);
    }
}

async function markRead(req, res) {
    try {
        const result = await pool.query(
            `UPDATE public.rider_notifications SET read_at = COALESCE(read_at, CURRENT_TIMESTAMP)
             WHERE id = $1 AND rider_id = $2 RETURNING id`,
            [req.params.id, req.user.id],
        );
        if (!result.rowCount) return res.status(404).json({ success: false, message: "Notification not found." });
        return res.json({ success: true });
    } catch (error) {
        return fail(res, "mark read", error);
    }
}

async function markAllRead(req, res) {
    try {
        await pool.query(
            "UPDATE public.rider_notifications SET read_at = CURRENT_TIMESTAMP WHERE rider_id = $1 AND read_at IS NULL",
            [req.user.id],
        );
        return res.json({ success: true });
    } catch (error) {
        return fail(res, "mark all read", error);
    }
}

module.exports = { list, markRead, markAllRead };
