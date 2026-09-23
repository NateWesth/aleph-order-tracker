# Right-click multi-actions

## What will change
- Add a right-click menu to every card on Orders, Collections, and Deliveries.
- Menu options will include selecting or deselecting the card, selecting its whole visible group/lane, opening details, assigning selected work, and deleting/removing safely.
- Right-clicking an unselected card will make it the active selection before a group action, so the bulk action bar appears immediately.
- Keep visible checkboxes for touch devices, where right-click is unavailable.

## Orders
- Add “Select this order” and “Select this group” to each order card’s context menu.
- Extend the existing bulk bar with assignment and a confirmation step before permanently deleting selected orders.
- Preserve existing status, urgency, tagging, and export actions.

## Collections & Deliveries
- Add equivalent context menus to both card types.
- Add assignment for the current selection directly in the bulk bar.
- “Delete/remove selected” will use the existing safe behavior: deliveries are removed from the dispatch plan without deleting their customer order; collections are permanently dismissed from the dispatch board without deleting the Zoho purchase order.

## Verification
- Verify right-click selection, whole-lane selection, assignment, confirmation dialogs, and clearing selection.
- Check desktop and mobile layouts, then confirm type checks and the live preview build pass.
