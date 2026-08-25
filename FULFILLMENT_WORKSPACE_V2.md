# Fulfillment Workspace V2 — Delivery + Supplier PO Collections

## Delivery
Customer sales orders remain in the Delivery lane when invoiced quantities reach Ready for Delivery. Completing a delivery advances only the ready quantities and moves the sales order to Delivery History only when the order is fully completed.

## Collection
The Collection lane is now supplier-PO based.

- Source: `po_tracking_cache`, the existing webhook-driven Zoho snapshot.
- Matching: the cache already reconciles PO lines against valid Zoho vendor bills, so the Collection lane uses only quantities that are still unbilled / not covered by a supplier invoice.
- Assignment: each PO has a persistent `po_collection_state` row and can be assigned manually or automatically to the least-loaded approved team member.
- Collection confirmation: the signed-in collector records the exact quantity collected on each PO line.
- Partial collection: every trip is archived, while any uncollected balance remains in the active Collection lane.
- Full collection: when the cumulative collected quantity reaches the current unbilled PO quantity on every line, the PO disappears from the active lane and is shown in Collection History.
- PO amendments: if a later Zoho snapshot adds new unbilled quantity, the PO can reappear because the queue is always recalculated from the live PO snapshot minus immutable collection events.

## History
The History tab contains two folders:

- Collections — every partial/full PO collection event, collector, timestamp, quantities and notes.
- Deliveries — completed customer-order deliveries.

## Database migration
Apply:

`supabase/migrations/20260824113000_po_collection_workflow.sql`

The migration also forces customer ready orders into Delivery, because Collection is no longer a customer-order routing mode.
