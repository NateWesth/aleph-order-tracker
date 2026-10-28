# Roadmap

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
- [ ] Current stock on hand — Zoho stock levels are not stored anywhere in the app (last snapshot 19 Aug); needs user decision on a stock refresh.
- [ ] Verify Buying Sheet while signed in — external unmanaged sign-in is unavailable to the test environment.

- [x] Fix phone edits not appearing on desktop
- [x] Restore Order Lab loading and actions
- [x] Run saving and Order Lab regression checks

- [x] workshop list+detail redesign (board groups + centered bubble matching Collections & Deliveries)
- [x] remove duplicate public/index.html
- [x] bulk-move supplier collections without errors
