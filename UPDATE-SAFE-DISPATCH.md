# Safe dispatch and collaboration — upgrades 2, 3, 4 and 5

This is a changed-files overlay for the latest Aleph (13) project plus the previous Scenario Planner update. It is not a replacement project. Keep all other project files.

## Installation

1. Back up your project and database. Copy the archive's src, supabase and tests folders into the matching folders in the project root (beside package.json), merging folders and replacing the included files. Do not put them inside another src folder. This file belongs in the project root.
2. Apply supabase/migrations/20260909120000_safe_dispatch_and_collaboration.sql to a staging Supabase project first, then your production project through your normal migration process. Apply all earlier project migrations first. The new UI requires this migration.
3. Run npm run typecheck and npm run build. No application dependencies changed. In the restricted verification environment, npm run build:verify used the same production Vite/PWA configuration without the sandbox-incompatible config loader.
4. Deploy the web build immediately after the migration and have users refresh/reopen the installed app. Older clients cannot use the unchecked collection command after this migration. Rebuild/sync your existing Capacitor package if distributing a native build.
5. Test with two approved staff accounts: edit the same workshop job, dismiss/refresh a collection, save a partial handover, and finish the remaining quantities. Nothing in this package has been applied to your live database or deployed.

## What changed

- Permanent collection dismissal records survive state deletion and re-import. Relevant changes to a dismissed PO are flagged for explicit review; they never silently put it back on the board. Restore still respects the existing three-week/outstanding filters.
- Device draft recovery for new orders, workshop forms, movement notes, supplier collection quantities, customer handovers and comment composers. Drafts are scoped to the signed-in account, expire after seven days, and are clearly labelled as device-only, not a team save. Storage failures are visible.
- Revision-checked saves for repair/sharpening edits and dispatch metadata/notes. Conflict review shows the latest saved values beside your changes. Batch moves and route creation fail together if a selected record changed.
- Partial customer handovers record exact selected quantities with immutable receipt history. Supplier collections and customer handovers use receipt IDs, server-side quantity validation and safe retries. Final completion happens only after every order item is complete. Receipt history loads only when opened.
- New order creation saves the order, items and PO links in one transaction. Failed saves keep the draft; retrying the same confirmed request does not create another order.
- Receipt recovery remains available if a supplier PO leaves the active queue before this device receives confirmation.

## Important behaviour and boundaries

- Device drafts are not offline database replication. Reconnect and explicitly submit them. A successful network reconnection alone never means all edits were saved.
- Old offline operations are retained under the existing aleph-offline-operations-v1 device-storage key, but automatic replay is paused: those entries lack an actor, record revision and receipt ID. Reconcile them against the live records before re-entering anything. Do not clear browser storage until they have been reviewed. No old entries are deleted by this update.
- Unsaved drafts are local to this browser/device; clearing browser data removes them. Use separate browser profiles on shared devices. Parallel edits in multiple tabs should use different records.
- Conflict checks apply to the updated workshop and dispatch write paths, not every legacy editor in the entire application. Older clients should be refreshed.
- This is additive: existing completed work/history is not purged. Previously deleted dismissal records cannot be reconstructed unless a saved dismissed state still exists. Service-role administrators retain normal database privileges.
- The migration adds collection_dismissals, dispatch_receipts, collection_receipt_requests and order_draft_requests, with restricted access and supporting transaction functions. New dismissal and receipt tables are added to Realtime when that publication exists.

## Verification

- TypeScript typecheck passed.
- Production build and generated PWA/service-worker build passed. The existing large-main-chunk warning remains.
- Local PostgreSQL-engine tests passed for dismissal persistence/review, stale-edit rejection, whitelists, exact partial completion, invalid/stale quantities, idempotent receipt replay, immutable receipts, atomic order creation and batch rollback.
- Headless browser fixture checks passed for draft reload/recovery, failed-save retention, successful-save cleanup, conflict review/cancellation, latest-revision retry, identical receipt retry after reload, mobile width and lazy receipt loading.
- The previous 18 Scenario Planner/pagination tests and desktop/mobile browser checks passed.
- Browser previews used mock data, not your live Supabase/Zoho account. Local database tests use a minimal schema fixture, not a complete production RLS/integration audit. Run the staging smoke test above before rollout.

To rerun the isolated database tests without changing application dependencies:

    npm --prefix tests/workflow-safety install
    npm --prefix tests/workflow-safety test

These tests create an in-memory PostgreSQL database only. They do not connect to your account or send notifications.
