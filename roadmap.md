# Roadmap

- [x] Sweep sharpening-related lists, comments, timers, notifications and reports; fix shared recovery/pagination failures without changing settled records or permissions; 20 regression tests, job-save safety suite and desktop/mobile fixture flows passed

- [x] Repair sharpening cross-user sync, reconnect recovery and shared saved-time refresh; 15 regression tests and separate desktop/mobile fixture screens passed
- [ ] Verify sharpening sync with real signed-in staff accounts — external unmanaged sign-in is unavailable in the sandbox

- [x] Sweep reorder, timer, assignment screens and background functions; fix sibling failures without changing settled records

- [x] Verify and fix staff reorder item/quantity visibility
- [x] Verify and fix finished repair/sharpening time visibility
- [x] Verify and fix misleading bulk assignment success for linked clients
- [ ] Verify these three fixes with real signed-in staff data — external unmanaged sign-in is unavailable; regression tests, compilation and desktop/mobile fixture flows passed

- [x] Review foundations and prepare the operations expansion plan
- [x] Give step-by-step guidance for the Zoho Books connection
- [ ] Smart route sequencing and complete Google Maps/Waze export
- [ ] Temporary purchasing/invoicing delegation preserving master client links
- [ ] Client portal live progress, delivery receipt downloads and reorder requests
- [ ] Reviewed draft Zoho PO creation from Buying Sheet recommendations
- [x] Manual Zoho inventory refresh and Buying Sheet depletion warnings from fresh stock and demand
- [x] Enable automatic low-stock notifications to all approved staff at seven days of remaining stock after fresh Zoho updates; deduplicate unresolved warnings and ignore stale inventory
- [ ] Verify seven-day stock notifications in the signed-in app and on staff devices — external unmanaged sign-in and physical devices are unavailable in the sandbox
- [x] Dated supplier bill price history and purchasing warnings (from saved bills; supplier names fill in as bills are re-read)
- [ ] Auditable job costs including vendor bills, waste and labour
- [ ] Driver-consented live GPS, admin fleet map and route ETA
- [ ] WhatsApp automated status queries — current app setup cannot receive messages; requires a supported receiving architecture decision
- [ ] Secure client quote and specification change approval links
- [ ] Technician Start/Pause/Finish time tracking and kiosk view

- [x] Add On route-only Route complete controls and quantity-based full/partial/none outcomes
- [x] Test guarded, retry-safe route completion and verify available preview checks
- [ ] Verify Route complete while signed in — external unmanaged authentication prevents authenticated sandbox checks

- [x] Add admin-managed client links for automatic purchasing/invoicing order assignments, separate from reps and dispatch
- [x] Test assignment scope, permissions, existing orders and future orders; check compilation and deployed triggers
- [ ] Verify client assignment dialog while signed in — external unmanaged sign-in is unavailable in the sandbox

- [x] Repair board-wide Select all and multi-order completion/delete/other actions
- [x] Test bulk selection and mutation results; check compilation
- [ ] Verify bulk order controls while signed in — external unmanaged sign-in is unavailable in the sandbox

- [x] Add third-position On route lane, restricted driver actions and explicit completion persistence
- [x] Test dispatch transition rules and check compilation
- [ ] Verify On route controls while signed in — external unmanaged sign-in is unavailable in the sandbox

- [x] Repair COD link display and statement cache refresh; test link, relink and unlink handling

- [x] Apply cost-based commission caps to both rep options, update labels, and deploy
- [x] Verify capped calculations and client/server agreement with regression tests

- [x] Stop supplier-bill reads failing mid-scan (saved bill copy, retries, auto-continue) so SKU costs actually refresh
- [ ] Confirm SKU costs on a refreshed statement — needs a signed-in refresh; sandbox sign-in unavailable

- [x] Diagnose remaining missing bill costs and Sune’s missing commission
- [x] Fix N/A-name SKU matching, exact miscellaneous-description matching, and show a current-month action for empty statements
- [ ] Confirm remaining vendor costs and Sune’s refreshed October payout — requires authenticated Zoho statement refresh; external unmanaged sign-in unavailable

- [x] Repair SKU matching for commission vendor-bill costs and verify regressions
- [ ] Verify refreshed commission statement while signed in — external unmanaged sign-in unavailable in the sandbox

- [x] Repair native app navigation, installed recognition and notification setup
- [x] Verify notification preference behavior
- [ ] Test Android permissions and Back on a physical device — requires rebuilt APK; sandbox cannot run Android
- [ ] Closed-app Android push — Firebase connection declined; needs connection and Android Firebase configuration

- [x] Repair Buying Sheet buttons, fullscreen overlays, and action feedback
- [x] Run Buying Sheet button regression checks

- [x] Fix Buying Sheet loading, quantities, and controls
- [x] Run Buying Sheet regression checks
- [x] Deduct invoiced units and live open-PO units on the Buying Sheet
- [x] Add an explicit Zoho inventory refresh and fresh-stock depletion warnings (approved 23 Nov); keep missing/stale stock unknown.
- [ ] Verify Buying Sheet while signed in — external unmanaged sign-in is unavailable to the test environment.

- [x] Fix phone edits not appearing on desktop
- [x] Restore Order Lab loading and actions
- [x] Run saving and Order Lab regression checks

- [x] workshop list+detail redesign (board groups + centered bubble matching Collections & Deliveries)
- [x] remove duplicate public/index.html
- [x] bulk-move supplier collections without errors
