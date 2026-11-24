# Reorder, saved work and assignment review

## Rules
- Staff must see the items and quantities requested, including after review.
- Finished work must remain visible on its job and any existing hours/cost/print view.
- Assignment success means the selected person was saved; client ownership and leave delegates remain authoritative.
- Automatic ownership changes must leave settled records untouched.

## Places read and outcomes

### Reorders
- `Portal.tsx`: active and completed order cards share `PortalReorder`; changed orders and item reads to bounded pagination so selectable items are not truncated.
- `PortalReorder.tsx`: dialog saves edited quantities with original item identities and verifies a returned request. Follows the rule.
- `PortalReorderQueue.tsx`, mounted by `ContinuityPanel.tsx` on `MyWorkPage.tsx`: shows names/code/description and requested quantities; changed capped reads to pagination and added read-only reviewed/accepted/declined views. Review actions still apply only to pending requests.
- `portalReorderDetails.ts`: resolves only within the source order; missing/moved/deleted identities are explicit, never substituted with another item.
- `validate_portal_reorder`: live definition validates original order/item ownership and quantities and protects saved lines during review. Unchanged.
- Search found no reorder reader/writer in edge functions or scheduled jobs.

### Workshop time
- `RepairsPage.tsx` outstanding/warranty/history and `SharpeningPage.tsx` active/history detail panels: mount the same timer and saved-session ledger. Read code; controlled timer interactions passed.
- `WorkshopTimer.tsx`, including kiosk: loads finished sessions separately from active time, includes technician/date/hours and saved rate costs, supports a fresh session after finish. Controlled finish/reopen/start/kiosk checks passed.
- `FabricationPage.tsx`: Hours worked, Job costing & profit and print use fabrication time entries. Changed entries to pagination and added explicit reload after timer finish, independent of Realtime configuration. Existing manual entries and historical rates remain unchanged.
- `fabricationPdf.ts`: totals and Hours worked table consume the same loaded entries. Follows the rule; no saved/exported PDF was regenerated.
- Live public timer wrapper and private command: persistent serialized sessions, saved hourly rates, technician ownership, idempotent finish. Unchanged.
- Live `capture_finished_fabrication_timer`: inserts hours and rate snapshot once; repairs/sharpening use the durable session ledger directly. Unchanged.
- Morning/afternoon reports list job deadlines and ownership, not labour totals; they do not discard or claim to report saved hours. No timer/reorder edge-function consumers found.

### Assignments
- Orders board/list toolbar and list context menu converge on `BulkActionsBar` and `updateSelectedOrderAssignment`: returned assignees verified; linked owner/delegate overrides cause an error and selection remains. Controlled interaction passed.
- Client Companies `CompanyTable`, `ClientOrderAssignmentDialog`: master link shown; saved master ID verified. Confirmation now explains current leave delegates and unchanged closed orders.
- `OperationalLeaveCover`: guarded insert/update with row confirmation. Existing settings unchanged.
- `ContinuityPanel` responsibility cover and `MyWorkPage`: separate shared-view delegation, not a permanent purchasing/invoicing reassignment. Copy already states ownership is not permanently changed. Unchanged.
- Live `guard_client_operational_assignment`, `apply_client_operational_assignment`, `effective_operational_owner`, `validate_operational_leave_cover`, `sync_operational_leave_cover`: validated master/delegate handling; unchanged.
- Live `sync_client_operational_orders`: previously updated closed orders when relinking; now excludes settled status and completed date. No data backfill.
- Live `reconcile_operational_leave_cover` and existing minute schedule: now also exclude dated-complete orders during handover/restoration. Schedule unchanged, no new job.
- Live `notify_order_assignment` and `notify_workshop_assignment`: notify the actually persisted assignee. Unchanged.
- `FreshDispatchPage` individual/context-menu/bulk/modal saves use revision-checked `save_dispatch_document`, which validates approved assignees and raises on conflicts. Follows the rule; separate from client purchasing ownership.
- `FulfillmentPage` individual, automatic assignment and route-plan batch paths use conflict-checked workflow saves. Mixed bulk stop assignment previously swallowed a collection save returning false; now fails without clearing selection.
- Repairs/sharpening assignment forms and right-click bulk commands use `useConflictSave`; failures are counted. Live `save_workflow_record`/`save_workflow_batch` check locked revisions and return saved rows/rollback conflicts. Unchanged.
- Fabrication assignment uses returned rows or explicit admin review; no client-link override applies. Unchanged.
- `create_order_draft_safe` and `split_order_items` insert orders through the master-owner trigger; `merge_orders` moves items without claiming a new assignee. Original reorder identity becoming unavailable is explicitly shown. Unchanged.
- Morning/afternoon reports read saved owners; afternoon handovers filter actual assignees. Unchanged.

## Verification and limits
- 19 targeted tests passed, including isolated database relink/cover/restoration checks proving settled rows unchanged and 1,001-request/item reads.
- Build feedback passed.
- Controlled-data desktop (1341×855) and phone (390×844) checks passed for portal quantity edit → staff display → review → read-only reviewed display; saved time → reopen → new timer; kiosk; all three timer entity types; overridden assignment with retained selection.
- Real signed-in staff/portal flows remain unavailable because authentication is externally unmanaged. Physical devices, real scheduled handovers, emails, and a real fabrication PDF after finishing remain unverified.
- Existing security warnings predate this change; permissions, settings, and production example/settled data were not changed.