# Aleph Order Tracker — 2026 makeover

## Included in this update

- PO Tracking now opens quickly by rendering supplier and PO details on demand.
- PO/order linking now uses indexed in-memory lookups and reports database errors.
- Buying Sheet analytics load concurrently and finish before the first sheet calculation.
- Mobile navigation exposes every permitted workspace, including Buying, Items, Commission, and Users.
- The responsive theme, realtime presence, notifications, order messages, threaded replies, and activity feed work from the same web/Capacitor codebase.

## Deployment

1. Install dependencies and build the Vite app.
2. Deploy the web build as normal.
3. Run `npx cap sync`, then build the Android/iOS projects. Capacitor uses the same responsive UI source, so no separate feature port is required.

## Verification note

The changed files pass TypeScript parsing. A full project type-check still reports pre-existing strict Supabase typing errors in CommissionPage, OrdersPage, and useOrderUpdates; these are unrelated to this update.
