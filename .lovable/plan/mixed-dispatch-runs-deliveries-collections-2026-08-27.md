# Mixed Dispatch Runs — Deliveries + Collections

Apply the uploaded `Aleph_Order_Tracker_Mixed_Dispatch_Full.zip` update, which lets a single dispatch run combine customer deliveries and supplier collections, and teaches the app which "area" each client/supplier belongs to.

## What it adds

- Dispatch runs can mix **Deliveries** and **Collections**; each stop is labelled by type.
- Route planner lets users pick delivery and collection work together in one run.
- Dispatch areas (e.g. East Rand, Jet Park, Midrand) are saved against the **company** or **vendor**, not the individual order/PO — assign once, and future work inherits it automatically.
- Optional navigation address override per company/vendor (useful for supplier collections).
- Suggested stop order groups by saved area, then similar address text, then urgency/schedule; Google Maps preview follows that order.
- "Plan dispatch run" entry point from the Operations Control Tower.

## Steps

1. Run migration `20260827073000_dispatch_area_learning.sql`, creating `dispatch_areas` and `dispatch_area_links` with row-level security, grants, update timestamps, and live sync enabled.
2. Copy the four changed app files from the archive (no edits to their contents):
   - `src/components/admin/OperationsControlTower.tsx`
   - `src/components/admin/FulfillmentPage.tsx`
   - `src/pages/AdminDashboard.tsx`
   - `src/integrations/supabase/types.ts`
3. Confirm the build and typecheck are clean and the preview renders.

## Notes

- The archive contains no `.git` metadata; only the files above differ from the current project.
- Access rules: any signed-in team member can view and manage dispatch areas and their company/vendor links.
