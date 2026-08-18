# Manual Rail + Performance Update

This update was applied to `aleph-order-tracker (13).zip`, which is now the source of truth for future work.

## What changed

- Replaced hover-driven sidebar expansion with a manual expand/collapse control.
- Added a smooth spring-style width, content, icon, and page-canvas transition.
- Remembers each user's sidebar preference across reloads.
- Added `Ctrl/Cmd + \` as a fast sidebar toggle.
- Added an expanded-sidebar workspace filter.
- Keeps notification indicators visible while the rail is collapsed.
- Added direct Quick Actions and Preferences controls to the rail footer.
- Prefetches lazy workspace code when users hover, focus, or touch a destination.
- Restores the last accessible workspace after reload.
- Remembers each workspace's scroll position while moving between pages.
- Added reduced-motion fallbacks for accessibility.

## Verification

- Full TypeScript project check passed.
- Production application bundle completed successfully (3,950 modules transformed).
- Compiled assets include the manual state, persistence, search, animation, and reduced-motion rules.
