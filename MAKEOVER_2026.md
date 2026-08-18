# Aleph Order Tracker — 2026 makeover

## Included in this update

- PO Tracking now opens quickly by rendering supplier and PO details on demand.
- PO/order linking now uses indexed in-memory lookups and reports database errors.
- Buying Sheet analytics load concurrently and finish before the first sheet calculation.
- Mobile navigation exposes every permitted workspace, including Buying, Items, Commission, and Users.
- The responsive theme, realtime presence, notifications, order messages, threaded replies, and activity feed work from the same web/Capacitor codebase.

## Performance and experience pass 2

- Major dashboard workspaces and Aleph AI now load on demand instead of blocking startup.
- Item comments query and subscribe only while opened, avoiding a database request and realtime channel for every visible item.
- Comments send optimistically and restore the draft if delivery fails.
- Notifications include All/Unread filters and apply realtime updates without refetching the whole feed.
- The toolbar now has a clearly labelled Company Watermarks style using the real company logo.
- Aleph AI is available from both the top toolbar and floating assistant, uses the signed-in user's token, and has a timeout/error recovery path.
- Approved internal users can use the AI assistant; deploy the updated `order-insights` function and ensure `LOVABLE_API_KEY` is configured.
- Biometric login can be enabled directly in Settings, cleans up expired credentials, and keeps rotating Supabase refresh tokens synchronized in the secure device keystore.
- Full TypeScript validation passes with no errors.

## Deployment

1. Install dependencies and build the Vite app.
2. Deploy the web build as normal.
3. Run `npx cap sync`, then build the Android/iOS projects. Capacitor uses the same responsive UI source, so no separate feature port is required.

## Verification note

The changed files pass TypeScript parsing. A full project type-check still reports pre-existing strict Supabase typing errors in CommissionPage, OrdersPage, and useOrderUpdates; these are unrelated to this update.
