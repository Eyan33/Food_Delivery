"use strict";

const pool = require("../../config/database");

const ACCOUNT_CONFIG = {
    customer: {
        select: `SELECT
                    jsonb_build_object(
                        'user', to_jsonb(u),
                        'addresses', COALESCE((
                            SELECT jsonb_agg(to_jsonb(a) ORDER BY a.id)
                            FROM public.addresses a WHERE a.user_id = u.id
                        ), '[]'::jsonb),
                        'carts', COALESCE((
                            SELECT jsonb_agg(
                                to_jsonb(c) || jsonb_build_object(
                                    'items', COALESCE((
                                        SELECT jsonb_agg(to_jsonb(ci) ORDER BY ci.id)
                                        FROM public.cart_items ci WHERE ci.cart_id = c.id
                                    ), '[]'::jsonb)
                                ) ORDER BY c.id
                            )
                            FROM public.carts c WHERE c.user_id = u.id
                        ), '[]'::jsonb),
                        'favorites', COALESCE((
                            SELECT jsonb_agg(to_jsonb(f) ORDER BY f.id)
                            FROM public.favorites f WHERE f.user_id = u.id
                        ), '[]'::jsonb),
                        'reviews', COALESCE((
                            SELECT jsonb_agg(to_jsonb(rv) ORDER BY rv.id)
                            FROM public.reviews rv WHERE rv.customer_id = u.id
                        ), '[]'::jsonb),
                        'orders', COALESCE((
                            SELECT jsonb_agg(
                                to_jsonb(o) || jsonb_build_object(
                                    'items', COALESCE((
                                        SELECT jsonb_agg(to_jsonb(oi) ORDER BY oi.id)
                                        FROM public.order_items oi WHERE oi.order_id = o.id
                                    ), '[]'::jsonb),
                                    'payments', COALESCE((
                                        SELECT jsonb_agg(to_jsonb(p) ORDER BY p.id)
                                        FROM public.payments p WHERE p.order_id = o.id
                                    ), '[]'::jsonb)
                                ) ORDER BY o.id
                            )
                            FROM public.orders o WHERE o.customer_id = u.id
                        ), '[]'::jsonb)
                    ) AS account_data,
                    u.id AS account_id,
                    concat_ws(' ', u.first_name, u.last_name) AS account_label
                 FROM public.users u
                 WHERE u.id = $1 AND u.role = 'customer'
                 FOR UPDATE OF u`,
        delete: `DELETE FROM public.users WHERE id = $1 AND role = 'customer'`
    },
    rider: {
        select: `SELECT
                    jsonb_build_object(
                        'user', to_jsonb(u),
                        'rider_profile', to_jsonb(rp),
                        'assigned_orders', COALESCE((
                            SELECT jsonb_agg(to_jsonb(o) ORDER BY o.id)
                            FROM public.orders o WHERE o.rider_id = u.id
                        ), '[]'::jsonb)
                    ) AS account_data,
                    u.id AS account_id,
                    concat_ws(' ', u.first_name, u.last_name) AS account_label
                 FROM public.users u
                 LEFT JOIN public.rider_profiles rp ON rp.user_id = u.id
                 WHERE u.id = $1 AND u.role = 'rider'
                 FOR UPDATE OF u`,
        delete: `DELETE FROM public.users WHERE id = $1 AND role = 'rider'`
    },
    restaurant: {
        select: `SELECT
                    jsonb_build_object(
                        'restaurant', to_jsonb(r),
                        'owner_account', to_jsonb(u),
                        'categories', COALESCE((
                            SELECT jsonb_agg(to_jsonb(fc) ORDER BY fc.id)
                            FROM public.food_categories fc WHERE fc.restaurant_id = r.id
                        ), '[]'::jsonb),
                        'foods', COALESCE((
                            SELECT jsonb_agg(to_jsonb(f) ORDER BY f.id)
                            FROM public.foods f WHERE f.restaurant_id = r.id
                        ), '[]'::jsonb),
                        'favorites', COALESCE((
                            SELECT jsonb_agg(to_jsonb(fav) ORDER BY fav.id)
                            FROM public.favorites fav WHERE fav.restaurant_id = r.id
                        ), '[]'::jsonb),
                        'reviews', COALESCE((
                            SELECT jsonb_agg(to_jsonb(rv) ORDER BY rv.id)
                            FROM public.reviews rv WHERE rv.restaurant_id = r.id
                        ), '[]'::jsonb),
                        'orders', COALESCE((
                            SELECT jsonb_agg(
                                to_jsonb(o) || jsonb_build_object(
                                    'items', COALESCE((
                                        SELECT jsonb_agg(to_jsonb(oi) ORDER BY oi.id)
                                        FROM public.order_items oi WHERE oi.order_id = o.id
                                    ), '[]'::jsonb),
                                    'payments', COALESCE((
                                        SELECT jsonb_agg(to_jsonb(p) ORDER BY p.id)
                                        FROM public.payments p WHERE p.order_id = o.id
                                    ), '[]'::jsonb)
                                ) ORDER BY o.id
                            )
                            FROM public.orders o WHERE o.restaurant_id = r.id
                        ), '[]'::jsonb),
                        'notifications', COALESCE((
                            SELECT jsonb_agg(to_jsonb(rn) ORDER BY rn.id)
                            FROM public.restaurant_notifications rn WHERE rn.restaurant_id = r.id
                        ), '[]'::jsonb),
                        'notification_preferences', (
                            SELECT to_jsonb(rnp) FROM public.restaurant_notification_preferences rnp
                            WHERE rnp.restaurant_id = r.id
                        )
                    ) AS account_data,
                    r.id AS account_id,
                    r.name AS account_label,
                    r.owner_id
                 FROM public.restaurants r
                 JOIN public.users u ON u.id = r.owner_id
                 WHERE r.id = $1
                 FOR UPDATE OF r, u`,
        delete: `DELETE FROM public.restaurants WHERE id = $1`
    }
};

async function permanentlyDeleteAccount(req, res) {
    const type = String(req.params.type || "").trim().toLowerCase();
    const id = String(req.params.id || "").trim();
    const reason = String(req.body?.reason || "").trim();

    if (!Object.prototype.hasOwnProperty.call(ACCOUNT_CONFIG, type)) {
        return res.status(400).json({ success: false, message: "Account type must be customer, restaurant, or rider." });
    }
    if (!/^[1-9][0-9]*$/.test(id)) {
        return res.status(400).json({ success: false, message: "Account ID must be a positive integer." });
    }
    if (reason.length > 1000) {
        return res.status(400).json({ success: false, message: "Deletion reason must be 1,000 characters or fewer." });
    }

    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        const config = ACCOUNT_CONFIG[type];
        const found = await client.query(config.select, [id]);
        if (!found.rows.length) {
            await client.query("ROLLBACK");
            return res.status(404).json({ success: false, message: "No ${type} account was found for ID " + id + "." });
        }
        const account = found.rows[0];
        const snapshot = account.account_data;
        const label = account.account_label || type + " #" + id;

        // Archive the account and relevant related records before changing any live data.
        await client.query(
            `INSERT INTO public.deleted_accounts
                (original_account_id, account_type, account_label, account_data, deleted_by, deletion_reason)
             VALUES ($1, $2, $3, $4::jsonb, $5, $6)`,
            [account.account_id, type, label, JSON.stringify(snapshot), req.user?.id || null, reason || null]
        );

        // Orders reference customer and restaurant with RESTRICT constraints. Their
        // items/payments are captured above before these parent orders are removed.
        // Rider deletion intentionally does not remove orders; its FK sets rider_id NULL.
        if (type === "customer") {
            await client.query("DELETE FROM public.orders WHERE customer_id = $1", [id]);
        } else if (type === "restaurant") {
            await client.query("DELETE FROM public.orders WHERE restaurant_id = $1", [id]);
        }

        await client.query(config.delete, [id]);

        // Remove the restaurant owner's login only when no other restaurant remains.
        if (type === "restaurant" && account.owner_id) {
            const remainingRestaurants = await client.query(
                "SELECT 1 FROM public.restaurants WHERE owner_id = $1 LIMIT 1",
                [account.owner_id]
            );
            if (remainingRestaurants.rowCount === 0) {
                await client.query(
                    "DELETE FROM public.users WHERE id = $1 AND role = 'restaurant'",
                    [account.owner_id]
                );
            }
        }

        await client.query("COMMIT");
        return res.status(200).json({
            success: true,
            message: type.charAt(0).toUpperCase() + type.slice(1) + " permanently deleted and archived.",
            data: { account_type: type, original_account_id: Number(id), account_label: label }
        });
    } catch (error) {
        try { await client.query("ROLLBACK"); } catch (_) {}
        console.error("Permanent account deletion failed:", error);
        if (error.code === "23503") {
            return res.status(409).json({
                success: false,
                message: "Deletion was blocked by a related database record. No changes were committed; the account and archive transaction were rolled back."
            });
        }
        return res.status(500).json({
            success: false,
            message: "Permanent deletion failed. No changes were committed. Check the server logs for details."
        });
    } finally {
        client.release();
    }
}

module.exports = { permanentlyDeleteAccount };
