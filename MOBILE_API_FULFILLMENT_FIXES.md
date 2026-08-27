# Mobile + API + Fulfillment Fixes

## Commission API usage
- Normal Commission page loads are cache-first and do not force Zoho refreshes.
- Ordinary order/order-item realtime activity no longer triggers commission Zoho refreshes.
- Missing-cost edits and commission-local changes re-read the cached report only.
- A dedicated `Refresh from Zoho` button is the only normal UI path that requests a fresh Zoho snapshot.
- Server-side 5-minute refresh suppression prevents repeat clicks/reconnects from creating API storms.
- Invoice list refresh now fetches the month once and filters eligible statuses locally instead of requesting each invoice status separately.

## Deliveries
- Active deliveries no longer disappear after 14 days.
- Active orders are restricted to open order statuses and exclude delivered/completed fulfillment work.
- A delivery appears only while it still has `qty_invoiced - qty_completed > 0`.
- Zoho draft/void/cancelled invoices no longer create ready-for-delivery quantities.
- Invoice matching no longer re-applies quantities to already delivered orders.

## Collections
- Active collections no longer disappear because the PO is older than 14 days.
- Only open, unbilled/partially-unbilled POs with a positive outstanding line quantity are shown.
- Closed/cancelled/rejected/draft/void/billed POs are excluded defensively even if an old cache row remains.
- Partial collection history is still subtracted from outstanding quantities so the balance remains active.

## Mobile
- Mobile bottom navigation is now four primary workspaces plus a More sheet instead of a horizontal desktop-style nav rail.
- Secondary workspaces, Preferences and Logout live in the mobile More sheet.
- The top bar hides non-essential desktop actions on phones.
- More compact page padding, responsive fulfillment lanes, mobile-friendly dialogs and 16px form inputs are applied globally.
- Commission tables suppress secondary desktop-only detail on narrow screens.

No brand/logo colours were changed.
