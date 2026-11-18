# Aleph operations expansion

## Scope
Add all eleven requested capabilities in coordinated phases, extending existing workspaces rather than creating duplicate systems. Preserve current commission rules, client master assignments, approved-team access, and quantity-based Route complete outcomes.

## Existing foundations
- Driver Route already exports Google Maps routes and individual Waze stops, but long routes currently lose stops from the single Google Maps link.
- Temporary cover already exposes an owner's work in a colleague's My Work page; it does not replace enforced purchasing/invoicing ownership.
- The invited-client portal already lists orders, but item access and receipt access need company-scoped permissions and live refresh.
- Buying Sheet already calculates restock priorities. Operations Intelligence has price ranges from purchase orders, not dated supplier-bill history.
- Fabrication already has material costing and manual hours; extend those records for audited costs and timer sessions.
- Fleet currently records fuel and service history, not live location.

## Phase 1 — Team cover and workshop time
**Temporary delegation:** Administrators choose a covering teammate and start/end dates for purchasing/invoicing. Existing and future active client orders use the effective delegate while the master client link remains unchanged. Cancelled or expired cover restores the master owner, including when no one opens the app. Reject overlapping cover and delegate chains. Do not change reps, collections or deliveries.

**Technician kiosk:** Add Start, Pause and Finish controls for Sharpening, Repairs and Fabrication. Persist timer sessions across reloads, prevent duplicate running sessions per technician, and provide audited corrections. Use a signed-in tablet view, with recorded technician identity rather than an anonymous public kiosk. Time contributes to job costs without automatically marking the job completed.

## Phase 2 — Purchasing and stock intelligence
**Supplier price history:** Read dated vendor bill lines into durable price history, retaining vendor, item identity, quantity, discount and VAT-exclusive unit cost. Compare like-for-like units; never merge unrelated generic items. Show trends and increases alongside Buying Sheet recommendations, with visible incomplete-history states.

**Direct Zoho POs:** Select recommendation lines, group by supplier, review quantities, rates and references, then create draft purchase orders in Zoho Books. Require explicit confirmation, approved-team authorization, valid Zoho vendor/item mapping and duplicate protection. Read back created PO numbers and refresh local coverage; never send orders to suppliers automatically.

**Depletion alerts:** Refresh real Zoho stock snapshots before deriving days of cover. Allow per-SKU critical flags, configurable warning thresholds and recipient selection. Scheduled checks generate deduplicated notifications through the existing push pipeline; email uses the existing mail service. Stale or missing stock must show as unknown, not as zero. Notifications identify snapshot age and avoid repeated alerts for the same unresolved condition.

## Phase 3 — Client self-service and approvals
**Portal:** Invited, signed-in clients see only their company's orders and live item progress. Add private delivery receipt downloads and reorder requests copied from selected historical lines. Reorders enter a staff review queue; clients cannot directly create supplier POs or change order status. Include request status and duplicate-submission protection.

**Digital approval:** Staff send a narrowly scoped, expiring approval link for a specific repair quote or fabrication specification version. The page shows only the proposed quote/change and supports approve or decline with an audit record. A changed proposal invalidates older links; retries cannot approve twice. Keep existing internal administrative approval separate. Email delivery first; WhatsApp delivery only after a Business connection and approved template are ready.

## Phase 4 — Job profitability
Link actual vendor bill lines, labour sessions/rates and scrap/offcut costs to orders or workshop jobs. Prevent double-counting bill allocations and materials already charged. Show estimated versus actual VAT-exclusive revenue, cost, profit and margin, with breakdowns and evidence. Missing costs remain visibly incomplete. Snapshot labour rates on entries so future rate changes do not rewrite past jobs. These costs do not alter commission calculations.

## Phase 5 — Routes and live fleet
**Route ordering:** Keep existing stop order by default. An explicit sequencing command proposes an order using the driver's current location and road travel times, with review before saving. Respect optional area assignments and do not silently regroup unassigned stops. Missing addresses remain visible and excluded from calculations. Split Google Maps exports into clearly numbered route legs so every stop is included; Waze supports navigation to individual stops, not equivalent multi-stop routing.

**Live fleet:** Drivers explicitly start/stop location sharing for an active run. Administrators see location, last update, accuracy, completed stops and estimated arrival times. Only assigned drivers publish their own location. Stop sharing when the run ends; show stale/offline locations honestly. Start with foreground sharing; reliable locked-screen/background Android tracking requires native permissions, implementation and a new APK. Limit retained location data and expose tracking state to drivers.

Google Maps routing and ETA lookups can incur usage charges. Require authenticated, capped requests, cached/deduplicated locations and no per-render route polling. Live Maps validation is unavailable in the sandbox; validate on an authorized deployed origin.

## WhatsApp status bot — blocked capability
The current React/Vite app setup cannot receive incoming WhatsApp messages through the available connector, so connecting a number alone will not enable a bot. Do not ship a pretend bot or unauthenticated order lookup. A supported receiving architecture must be chosen before this part can be implemented. Once supported, verify the sender against an authorized client/rep identity, restrict results to permitted companies, and use approved templates outside the 24-hour reply window. Company names alone must never grant access to orders, invoices or driver locations.

## Services and deployment requirements
- Preserve the existing external Supabase project; do not attempt to replace it with Lovable Cloud.
- No workspace service connections were available during review. Reuse the existing Zoho integration if its credentials and permissions support the required reads/writes; otherwise use the Zoho Books connection setup.
- The live app uses `app.alepheng.co.za`. Lovable-managed Google Maps browser keys do not support custom domains. Before connecting Maps, prepare a user-owned Google Cloud key with billing, required APIs and root/subdomain restrictions; keep server and browser credentials appropriately separated.
- Email and automated schedules require verified existing configuration. WhatsApp needs a Business phone number, Meta verification, a supported receiver and approved message templates.

## Technical approach
- Extend existing delegation, workshop, dispatch, portal and procurement modules; add focused shared helpers for effective ownership, timer sessions, cost allocations and route exports.
- Use approved-team or company-scoped RLS, explicit table grants, validated authenticated functions, and `SET search_path = public` on security-definer functions.
- Handle delegation start/end with a scheduled reconciliation plus enforced effective ownership on writes. Keep cancellation and restoration transactional.
- Use idempotency keys and revision checks for PO creation, reorder requests, approvals, timers and route changes.
- Keep connector credentials server-only; preserve existing push delivery and private signed-download storage.
- Add concrete tests for authorization, delegation boundaries/restoration, timer state transitions, duplicate POs, stock freshness, cost allocation, approval expiry/versioning, and complete route exports.

## Completion checks
Run affected tests and check preview compilation after each phase. Verify real signed-in central flows where access allows it. Authenticated end-to-end checks are currently unavailable for this external Supabase project; do not describe signed-out checks as successful client or staff verification. Report connection, device and deployed-origin checks separately from completed code.

Approval covers this scope and staged implementation; it does not approve provider charges, production PO submission, or unsupported WhatsApp receiving infrastructure.