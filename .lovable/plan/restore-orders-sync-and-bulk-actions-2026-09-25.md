# Restore Orders Sync and Bulk Actions

## Goal
Make current Zoho sales orders appear reliably on the Orders page and make right-click selection/actions dependable.

## Changes
- Correct the Zoho full sync so it imports sales orders and their line items, rather than treating supplier purchase orders as customer orders.
- Add a visible Orders-page refresh control that runs the sales-order sync and then reloads the board, with clear success or failure feedback.
- Keep completed orders off the active board, while ensuring every non-completed order is placed in a visible stage.
- Move right-click handling outside the drag listener conflict and make the menu select the clicked order before group actions.
- Put Select order, Select column/group, Assign, Status, Urgency, Tag, and Delete in the right-click flow; keep confirmations for deletion.
- Verify the import and menu interactions, then check type safety and the current preview build status.

## Technical details
- Reuse the existing authenticated Zoho connection and service-side sales-order mapping.
- Preserve current RLS and admin checks; no new tables are required.
- Keep touch checkboxes/overflow actions as the mobile fallback because phones do not have right-click.
