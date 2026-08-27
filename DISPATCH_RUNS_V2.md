# Mixed Dispatch Runs — Deliveries + Collections

## What changed

- Dispatch runs can contain both customer **Deliveries** and supplier **Collections**.
- Every stop stores `stopType` (`delivery` or `collection`) and is labelled accordingly in Dispatch Runs.
- Route planning can be opened from Operations Control Tower using **Plan dispatch run**.
- The route planner itself lets users select from both delivery and collection work at once.
- Persistent dispatch areas are stored against the **company** or **vendor**, not the individual order/PO.
- The first time a client/supplier is routed, users assign an area (for example `East Rand`, `Jet Park`, `Midrand`).
- Future deliveries/collections for that same company/vendor inherit the saved area automatically.
- An optional navigation address override can be saved on the same link, useful for supplier collections.
- Suggested route order groups by saved area, then nearby address text, then urgency/schedule.
- Google Maps preview uses the resulting combined stop order when navigation addresses are available.

## Database migration

Apply:

`supabase/migrations/20260827073000_dispatch_area_learning.sql`

This creates:

- `dispatch_areas`
- `dispatch_area_links`

Both tables are realtime-enabled and shared across authenticated users.
