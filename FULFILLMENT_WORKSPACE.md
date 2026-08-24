# Delivery & Collection Workspace

Added August 2026.

## What was added

- New **Delivery & Collection** workspace in the admin navigation.
- Orders automatically appear when at least one line item has quantity in the existing `ready-for-delivery` bucket (`qty_invoiced - qty_completed > 0`).
- Two routing lanes: **Delivery** and **Collection**.
- Manual route switching, assignment, scheduling, status and fulfillment notes.
- Shared global setting for automatic assignment and default route.
- Automatic assignment balances new ready orders across approved internal users by current open fulfillment workload.
- Database trigger handles automatic routing/assignment even when the workspace is not open.
- Manual routing is protected by `fulfillment_routed_at`, so later-ready line items do not overwrite a user's route decision.
- Completing a delivery/collection advances actual ready item quantities into `qty_completed`. Partial orders remain active; fully completed orders move to History.
- Fulfillment assignment uses `fulfillment_assigned_to` and does not overwrite the existing general `assigned_to` order owner.
- Realtime order/item changes refresh the workspace automatically.

## Database migration

Apply:

`supabase/migrations/20260824102000_fulfillment_workspace.sql`

before using the new workspace against a hosted database.
