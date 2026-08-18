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

## Viewport and page-layout correction pass 6

- Changed the desktop Control Centre from sticky document content to a fixed viewport rail beneath the measured toolbar height; the main workspace now reserves its width independently.
- Rendered Aleph AI through a document-body portal and enforced viewport-fixed positioning, safe-area offsets, and top-level stacking for both the bubble and open panel.
- Converted ordinary desktop entity tables into actual responsive card-grid page bodies. Items, Clients, Suppliers, Users, History, PO lines, and eligible Commission records now present each record as a labelled card rather than a spreadsheet row.
- Added page-specific workspace accents and command surfaces so each operational area has distinct structure and visual identity.
- Preserved the Buying Sheet procurement table only in its optional Data view, where side-by-side quantities are required for editing; Queue and Suppliers remain the primary workflow views.
- Reframed the Orders Board controls as a dedicated command surface while retaining its drag-and-drop workflow columns.

## Operational page workspaces pass 7

- Added a live order-journey navigator above the Orders Board. Each stage reports its current order count and jumps directly to the matching drag-and-drop lane.
- Rebuilt PO Tracking as a focused supplier workbench: a persistent supplier queue controls one detailed PO workspace instead of rendering every supplier's full contents at once. This also reduces initial DOM work on large accounts.
- Replaced the Items, Clients, Suppliers, and Users desktop spreadsheets with purpose-built catalogue, company, supplier, profile, and approval cards while preserving every edit, delete, approval, role, and access action.
- Turned completed-order History into a visual monthly timeline with collapsible order groups.
- Gave Analytics a composed insight canvas with a period switcher, KPI ribbon, primary chart stage, and ranking panels.
- Strengthened the Buying Sheet and Commission internal work areas without altering the global toolbar, Control Centre, watermark, search, or Aleph AI placement.
- Added responsive horizontal stage and supplier navigation for mobile while retaining the shared Capacitor codebase.

## Fixed shell, board scrolling, and live sync pass 8

- Locked the desktop application frame to the viewport. The company header, toolbar, Control Centre, and Activity rail no longer move with page content.
- Made the active page canvas the only ordinary vertical scroller; the Orders Board uses four independent, height-constrained column scrollers instead.
- Contained wheel and touch scrolling inside the Orders Board lane under the pointer, including at lane boundaries, so another lane or the page cannot move unexpectedly.
- Corrected the missing Suppliers mail-icon import and formally typed optional custom board colours, resolving the reported production TypeScript failures.
- Added an idempotent Realtime migration covering orders, items, POs, comments, files, activity, notifications, updates, and tags with full replica identities.
- Added reconnect, focus, online, and short polling safety nets so authorized users recover any events missed during a websocket interruption.
- Removed the fragile embedded-profile relationship from item-comment loading and enriches authors in a second indexed query, preventing schema-cache 400 errors.
- Corrected the missing React list key on Order Board cards.
- Added cached PO Tracking recovery in both the client and Edge Function so a temporary Zoho error does not blank the page.

## Operational cockpit rebuild pass 9

- Corrected the Orders scrolling model: the page canvas scrolls normally down to the physical bottom of the board, while each desktop lane is capped to the usable viewport height and owns its order-stack scrolling.
- Kept lane scroll containment exclusive to the Orders page; Buying, Commission, History, directories, PO Tracking, and Analytics retain normal page scrolling.
- Rebuilt every Orders lane with a large numbered workflow header, live order/unit/priority totals, a contained lane surface, and ticket-style order cards with clearer client, progress, item, comment, and movement hierarchy.
- Replaced the Buying Sheet's small tab strip with three substantial operational workspaces: Order Queue, Supplier Rooms, and Data Console.
- Replaced the Buying Sheet's ten equal KPI tiles with a procurement intelligence mosaic led by a large buying-requirement and demand-coverage command card.
- Rebuilt Commission as a Revenue Operations control room with a hero workspace selector and a responsive two-column representative ledger.
- Retained and strengthened the distinct catalogue cards, client directory, supplier directory, user approval lanes, supplier-focused PO workbench, History timeline, and Analytics insight canvas from the prior page architecture passes.

## Compact board and workspace reinvention pass 10

- Removed the Live Order Journey component from Orders completely.
- Replaced the Orders heading area with a compact Operations Desk command bar and reduced desktop lane headers to a short single-row summary.
- Reworked the visible Orders surface again with tighter borderless lane interiors, compact stage numbering, lightweight live totals, and a denser ticket hierarchy that gives order content more space than chrome.
- Converted the desktop Control Centre into a 64px automatic hover rail. It expands over the workspace at the left edge and collapses again when the pointer returns to page work.
- Discarded the Commission control-room hero and rebuilt the page as a statement workspace with a dark period/navigation sidebar and a separate ledger canvas.
- Rebuilt Analytics as an executive Performance Studio with its period controls in the hero, a dominant selected-period score, asymmetric KPI bento, larger primary trend stage, and paired operational intelligence panels.

## Deployment

1. Install dependencies and build the Vite app.
2. Deploy the web build as normal.
3. Run `npx cap sync`, then build the Android/iOS projects. Capacitor uses the same responsive UI source, so no separate feature port is required.

## Verification note

The full application TypeScript check and Tailwind CSS compilation pass without errors.
