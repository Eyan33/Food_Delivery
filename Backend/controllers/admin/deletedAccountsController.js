"use strict";

const pool = require("../../config/database");

async function listDeletedAccounts(req, res) {
    try {
        const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
        const limit = Math.min(100, Math.max(1, Number.parseInt(req.query.limit, 10) || 25));
        const offset = (page - 1) * limit;
        const type = String(req.query.type || "").trim();
        const search = String(req.query.search || "").trim();
        const values = [];
        const where = [];

        if (["customer", "restaurant", "rider"].includes(type)) {
            values.push(type);
            where.push("account_type = " + String.fromCharCode(36) + values.length);
        }

        if (search) {
            values.push("%" + search + "%");
            const placeholder = String.fromCharCode(36) + values.length;
            const searchableColumns = [
                "account_label",
                "deletion_reason",
                "account_type",
                "original_account_id::text",
                "account_data::text"
            ];
            const searchConditions = searchableColumns.map((column) => column + " ILIKE " + placeholder);
            where.push("(" + searchConditions.join(" OR ") + ")");
        }

        const clause = where.length ? "WHERE " + where.join(" AND ") : "";
        const count = await pool.query(
            "SELECT COUNT(*)::int AS total FROM public.deleted_accounts " + clause,
            values
        );
        const limitPlaceholder = String.fromCharCode(36) + (values.length + 1);
        const offsetPlaceholder = String.fromCharCode(36) + (values.length + 2);
        const rows = await pool.query(
            "SELECT id, original_account_id, account_type, account_label, account_data, deleted_by, deletion_reason, deleted_at " +
            "FROM public.deleted_accounts " + clause +
            " ORDER BY deleted_at DESC LIMIT " + limitPlaceholder + " OFFSET " + offsetPlaceholder,
            [...values, limit, offset]
        );

        return res.json({
            success: true,
            data: {
                accounts: rows.rows,
                pagination: {
                    page,
                    limit,
                    total: count.rows[0].total,
                    pages: Math.ceil(count.rows[0].total / limit)
                }
            }
        });
    } catch (error) {
        console.error("List deleted accounts failed:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to retrieve deleted accounts"
        });
    }
}

module.exports = { listDeletedAccounts };
