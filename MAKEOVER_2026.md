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

## Visual and workflow pass 3

- Every top-toolbar style now includes upright company-logo watermarks in a scattered composition; the Company Watermarks style increases their emphasis without skewing the logo.
- Wheel input is normalized for pixel, line, and page devices and accelerated with a safe maximum distance.
- Aleph AI is anchored to the viewport bottom-right with mobile safe-area offsets and a dynamic maximum panel height.
- Loading screens keep their skeleton context but center an animated Aleph logo with two orbiting chasers.
- Item notes are visible below item names and comment counts load independently before the realtime comment panel opens.
- A migration restores the item-comments table, permissions, indexes, and realtime publication in environments where it was missing.
- Buying Sheet fullscreen uses the browser Fullscreen API, stays above the app chrome, and falls back to app fullscreen on iOS/PWA browsers.
- Duplicate supplier filter chips were removed; the supplier selector remains the single clear control.
- Shared buttons, cards, tables, tabs, inputs, page widths, borders, mobile spacing, and toolbar navigation received a quieter app-wide refinement.

## Brand art pass 4

- Toolbar watermarks now use twenty larger company logos in a dense, irregular doodle-style composition instead of sparse rows.
- All marks remain upright and preserve the original logo proportions.
- The loading animation is now an Aleph-logo ouroboros: a bright large logo head continuously chases a progressively smaller fading tail around a circular path.

## Workspace architecture pass 5

- Replaced the crowded desktop toolbar tabs with a persistent left workspace rail. Tablet retains a compact switcher and mobile retains bottom navigation.
- Rebuilt shared page headers as command centres with larger identity icons, stronger hierarchy, stat tiles, and a dedicated action/filter dock.
- Reworked every shared table into a separated data deck. Desktop rows read as individual records; mobile rows automatically become labelled responsive cards.
- Increased wheel scrolling to a 3.25x pixel multiplier, 68px line steps, near-full-page paging, and a 1200px safety cap.
- Watermarks are now included with every toolbar theme. The old watermark-only theme choice was replaced with one persistent show/hide control.
- Tightened the toolbar watermark composition to 31 overlapping, irregularly placed logos for a compressed doodle effect.
- Enlarged the home logo control and themed global search to match each toolbar with a lighter surface and readable theme-aware text.
- Replaced the orbit loader with a single-logo progressive reveal: no ring, dots, duplicated logos, or surrounding decoration.
- Made item comments visible directly in the Orders item bubble, Progress item table, and Item Progress Board on desktop and mobile.
- Batched order/item comment counts into the Orders query and added glowing comment activity badges to parent order cards.
- Added database-backed item-comment broadcasts that create parent-order activity and realtime notifications for other approved users.

## Deployment

1. Install dependencies and build the Vite app.
2. Deploy the web build as normal.
3. Run `npx cap sync`, then build the Android/iOS projects. Capacitor uses the same responsive UI source, so no separate feature port is required.

## Verification note

The full application TypeScript check and Tailwind CSS compilation pass without errors.
