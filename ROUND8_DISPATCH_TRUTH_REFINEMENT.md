# Round 8 — Dispatch Truth & Refinement

## Correctness
- Deliveries exclude orders with `status = delivered`, any `completed_date`, or `fulfillment_status = completed`.
- Delivery readiness remains based on real line quantities: `qty_invoiced - qty_completed > 0`.
- Collections now exclude fully received POs as well as billed/closed/cancelled/draft/void POs.
- PO line collection outstanding is based on quantity minus the greater of received or billed quantity.
- Fully-collected collection state/history is authoritative and cannot be resurrected by stale cache rows.
- Open POs are no longer discarded merely because they are older than 180 days; active PO discovery can inspect up to 500 active candidates.
- One-time migration reconciles objectively completed historical deliveries and collections.

## Control Tower
- Removed hidden reconciliation/saved-view data loading from the default tower refresh.
- Current routes only: completed/cancelled routes are hidden, and stale old planned routes do not appear as active.
- Header now uses Aleph brand ribbon colours rather than the unrelated dark hero treatment.
- Overview is factual: Ready Deliveries, Ready Collections, Active Routes, Blockers.

## Deliveries & Collections UI
- Removed repeated metric/card layers from the top of the page.
- One clean Aleph-branded header, one sticky working toolbar, then the actual work lanes.
- Finished work is kept in History rather than repeated in active lanes.
