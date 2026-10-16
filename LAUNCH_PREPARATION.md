# FoodDelivery — Launch Preparation

This ZIP is a source-code handoff, not a claim that the application has already been deployed or passed end-to-end production testing.

## Included changes in this preparation pass

- Centralized frontend API base selection in `Frontend/assets/js/api-config.js`.
  - Localhost uses `http://localhost:5000/api`.
  - Production defaults to same-origin `/api`, which requires a reverse proxy routing `/api` to the Express backend.
  - If frontend and backend are hosted separately, change `productionApiBase` in that file to `https://YOUR-BACKEND-DOMAIN/api`.
- Added a CORS origin allowlist in `Backend/server.js`.
- Added `Backend/.env.example` and excluded real `.env` files from this archive.
- Added configurable PostgreSQL SSL and connection timeouts in `Backend/config/database.js`.
- Changed checkout to default to cash on delivery and disabled the unintegrated M-Pesa choice for this launch target.
- Checkout attempts to create a payment record after order creation and handles a duplicate payment by verifying the existing payment record.
- Fixed JSON serialization for the rider profile password-change request.
- Included the provided PostgreSQL schema as `food_delivery_schema.sql` at the project root.

## Before deploying

1. Create a production PostgreSQL database and restore `food_delivery_schema.sql` into a **new/empty** database. Do not overwrite a database with live data.
2. Set environment variables on the backend host. Start from `Backend/.env.example`; never upload a real `.env`.
3. Set a strong, unique `JWT_SECRET`. Rotate any credentials that were previously shared in archives or chats.
4. Set `CORS_ORIGINS` to the exact production frontend origin(s), comma-separated.
5. If using a separate frontend and backend host, configure `productionApiBase` in `Frontend/assets/js/api-config.js` and ensure backend CORS allows the frontend origin.
6. Ensure the production host routes `/api` to Express if using the default same-origin `/api` setting.
7. Run `npm install` in `Backend`, then `npm start`.
8. Verify `GET /api/health` on the deployed backend.
9. Test login, browse restaurants, checkout with cash on delivery, payment record creation, restaurant order handling, rider delivery, admin totals, and cancellation in staging.

## Environment variables

Required:
- `DB_HOST`
- `DB_NAME`
- `DB_USER`
- `DB_PASSWORD`
- `JWT_SECRET`

Usually required/configured:
- `PORT` (the host usually supplies this)
- `DB_PORT` (defaults to 5432)
- `DB_SSL=true` when required by the database provider
- `CORS_ORIGINS`
- `JWT_EXPIRES_IN`
- `DASHBOARD_TIME_ZONE`

## Known items that still require verification or implementation

- No live deployment was performed from this environment.
- The real production database connection, frontend host, reverse proxy, HTTPS and CORS must be verified after choosing hosting.
- Cash payment records are created as `pending`; the operational workflow for confirming cash collection at delivery must be tested and may need a dedicated rider collection endpoint/UI. Do not treat `pending` cash as collected revenue.
- If payment record creation fails after the order has been created, checkout tells the customer not to submit the order again; support/admin must inspect that order and create or reconcile its payment record.
- M-Pesa/card processing is not integrated; M-Pesa is disabled in checkout for this cash-only launch configuration.
- Emergency-contact persistence and rider avatar upload are not connected.
- Automated end-to-end tests against a real PostgreSQL database still need to be run.
- Review all admin reporting queries against the chosen business rule for revenue and cancelled orders before accepting real orders.

## Archive hygiene

`node_modules`, `.env` files, Git metadata, logs and coverage directories are omitted from the ZIP. Run `npm install` in `Backend` after extracting.
