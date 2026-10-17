"use strict";

/*
 * Minimal fixed-window rate limiter (in memory).
 *
 * Good enough for a single Render instance. If you later scale to
 * several instances, each keeps its own counters; switch to a shared
 * store (e.g. Render Key Value) at that point.
 */

const MAX_TRACKED_KEYS = 100000;

function createRateLimiter({
    windowMs,
    max,
    message = "Too many requests. Please try again later.",
    keyGenerator = (req) => req.ip,
    skipSuccessfulRequests = false,
}) {
    const hits = new Map();

    const sweeper = setInterval(() => {
        const now = Date.now();

        for (const [key, entry] of hits) {
            if (entry.resetAt <= now) {
                hits.delete(key);
            }
        }
    }, Math.min(windowMs, 60000));

    sweeper.unref();

    function middleware(req, res, next) {
        const now = Date.now();
        const key = String(keyGenerator(req) || "unknown");

        let entry = hits.get(key);

        if (!entry || entry.resetAt <= now) {
            if (!entry && hits.size >= MAX_TRACKED_KEYS) {
                // Drop the oldest tracked key so memory stays bounded.
                hits.delete(hits.keys().next().value);
            }

            entry = { count: 0, resetAt: now + windowMs };
            hits.set(key, entry);
        }

        entry.count += 1;

        const resetSeconds = Math.max(1, Math.ceil((entry.resetAt - now) / 1000));

        res.setHeader("RateLimit-Limit", String(max));
        res.setHeader("RateLimit-Remaining", String(Math.max(0, max - entry.count)));
        res.setHeader("RateLimit-Reset", String(resetSeconds));

        if (entry.count > max) {
            res.setHeader("Retry-After", String(resetSeconds));

            return res.status(429).json({
                success: false,
                message,
            });
        }

        if (skipSuccessfulRequests) {
            const trackedEntry = entry;

            res.on("finish", () => {
                if (res.statusCode < 400 && trackedEntry.count > 0) {
                    trackedEntry.count -= 1;
                }
            });
        }

        return next();
    }

    middleware.reset = () => hits.clear();

    return middleware;
}

module.exports = { createRateLimiter };
