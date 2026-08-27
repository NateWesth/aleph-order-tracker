# Aleph Clarity Cleanup — Round 6

This pass intentionally removes visual noise rather than adding features.

## Default experience changes
- Main navigation now shows only seven core workspaces: Today, My Work, Orders, Delivery & Collection, Buying, Control Tower, History.
- Clients, Suppliers, PO Tracking, Items, Stats, Commission and Users are available under More tools.
- Operations Intelligence is removed from normal navigation/command search so heuristic information is no longer presented as day-to-day truth.
- Persistent Operations Pulse bar removed.
- Buying Sheet intelligence banner removed.
- Commission margin-intelligence banner removed.
- Header actions reduced to the controls used frequently.
- Today page simplified to factual database-backed counts only.
- Control Tower reduced to Today, Routes, Exceptions and Activity.
- Control Tower inferred health score removed.
- Control Tower filters only appear on the Exceptions view.
- Saved-view controls removed from the main Control Tower surface.

## Preserved
- Existing orders, purchasing, commission, dispatch, comments, assignments and notifications.
- Intelligence/automation source code and database structures are not deleted, so they can be reintroduced selectively later.
- Existing Aleph brand/logo colours.

## Validation
`npx tsc --noEmit` passes after the cleanup.
