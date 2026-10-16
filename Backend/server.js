const express = require("express");
const cors = require("cors");
require("dotenv").config();

const pool = require("./config/database");
const authRoutes = require("./routes/auth/authRoutes");
const restaurantRoutes = require("./routes/restaurant/restaurantRoutes");
const foodRoutes = require("./routes/food/foodRoutes");
const categoryRoutes = require("./routes/category/categoryRoutes");
const orderRoutes = require("./routes/order/orderRoutes");
const paymentRoutes = require("./routes/payments/paymentRoutes");
const cartRoutes = require("./routes/cart/cartRoutes");
const addressRoutes = require("./routes/address/addressRoutes");
const customerRoutes = require("./routes/customer/customerRoutes");
const adminRoutes = require("./routes/admin/adminRoutes");
const riderRoutes = require("./routes/rider/riderRoutes");
const reviewRoutes = require('./routes/review/reviewRoutes');

const app = express();

const PORT = process.env.PORT || 5000;

/*
 * Middleware
 */

/*
 * CORS: configure CORS_ORIGINS as a comma-separated list of exact
 * frontend origins in production, for example:
 * CORS_ORIGINS=https://food.example.com,https://www.food.example.com
 *
 * In local development, only localhost frontend origins are allowed
 * when CORS_ORIGINS is not configured.
 */
const configuredOrigins = (process.env.CORS_ORIGINS || "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

const developmentOrigins = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:5500",
    "http://127.0.0.1:5500",
    "http://localhost:5501",
    "http://127.0.0.1:5501",
    "http://localhost:8080",
    "http://127.0.0.1:8080",
];

const allowedOrigins = configuredOrigins.length
    ? configuredOrigins
    : developmentOrigins;

app.use(cors({
    origin(origin, callback) {
        // Permit non-browser clients (curl, server-to-server health checks).
        if (!origin || allowedOrigins.includes(origin)) {
            return callback(null, true);
        }

        return callback(new Error("Origin is not allowed by CORS"));
    },
    credentials: true,
}));

app.use(express.json());

app.use(
    express.urlencoded({
        extended: true,
    }),
);

/*
 * Basic route
 */

app.get("/", (req, res) => {
    res.json({
        success: true,
        message: "FoodDelivery API is running",
    });
});

/*
 * Database health check
 */

app.get("/api/health", async (req, res) => {
    try {
        const result = await pool.query("SELECT NOW() AS current_time");

        res.json({
            success: true,
            message: "API and PostgreSQL are connected",
            database_time: result.rows[0].current_time,
        });
    } catch (error) {
        console.error("Database health check failed:", error);

        res.status(500).json({
            success: false,
            message: "Database connection failed",
        });
    }
});

/*
 * Authentication routes
 */

app.use("/api/auth", authRoutes);

/*
 * Order routes
 */

app.use("/api/orders", orderRoutes);

/*
 * Food routes
 */

app.use("/api/foods", foodRoutes);

/*
 * Category routes
 */

app.use("/api/categories", categoryRoutes);

/*
 * Restaurant routes
 */

app.use("/api/restaurants", restaurantRoutes);

/*
 * Payment routes
 */

app.use("/api/payments", paymentRoutes);

/*
 * Cart routes
 */

app.use("/api/cart", cartRoutes);

/*
 * Address routes
 */

app.use("/api/addresses", addressRoutes);

/*
 * Customer routes
 */

app.use("/api/customers", customerRoutes);

/*
 * Admin routes
 */

app.use("/api/admins", adminRoutes);

/*
 * Rider routes
 */

app.use("/api/riders", riderRoutes);

/*
 * Review routes
 */

app.use("/api/reviews", reviewRoutes);

/*
 * 404 handler
 */

app.use((req, res) => {
    res.status(404).json({
        success: false,
        message: "Route not found",
    });
});

/*
 * Start server
 */

app.listen(PORT, () => {
    console.log(`FoodDelivery API running on http://localhost:${PORT}`);
});
