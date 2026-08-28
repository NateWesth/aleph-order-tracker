# Round 9 — Fulfillment Source Truth

This round fixes missing NEW deliveries and collections at the source rather than adding UI filters.

## Delivery fixes
- Fulfillment no longer restricts active orders to a hard-coded status list.
- Any order with no completed_date may qualify; actual deliverability is decided by qty_invoiced - qty_completed > 0.
- Control Tower uses the same rule.
- Invoice matching now also resolves top-level salesorder_id / salesorder_number fields from Zoho invoices.
- Added a lightweight recent-invoice catch-up action. It lists recent invoices but only fetches detail for invoices that are new/changed versus zoho_document_cache.

## Collection fixes
- Webhook PO normalization now matches the full PO sync semantics.
- PO lines without SKUs are no longer silently discarded from Collections.
- Outstanding collection quantity uses quantity - max(received, billed).
- Fully received / fully billed POs are removed consistently.
- Fulfillment requests a throttled PO source refresh on open, every five minutes while open, and on manual Refresh.
- The PO edge function reuses cache if it is younger than two minutes, so repeated page loads do not hammer Zoho.

## Deployment
Deploy these edge functions:
- supabase/functions/po-tracking-data
- supabase/functions/zoho-webhook (including event-cache.ts)

Then deploy the frontend.

No database migration is required for Round 9.
