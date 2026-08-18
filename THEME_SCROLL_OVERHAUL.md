# Aleph UI / Theme / Scroll Overhaul

This build includes:

- Global document-wheel fallback so normal page content scrolls regardless of pointer position.
- Nested dialogs/popovers/ScrollAreas keep their own scrolling and do not scroll the page behind them.
- One document-level vertical scroll owner; app shell/main cannot become trapped vertical scroll regions.
- Theme preferences load synchronously before the first render and persist as one atomic localStorage object.
- Backward compatibility with the original individual theme localStorage keys.
- New toolbar styles: Classic, Dark, Logo Wall, Midnight, Glass.
- Logo Wall uses the original Aleph logo image as repeated low-opacity watermarks; logo colours are not altered.
- New workspace surface styles: Clean, Soft Depth, Layered Glass, High Contrast.
- New page backgrounds: Aurora, Minimal, Mesh, Midnight.
- New accent colours: Midnight Navy, Executive Gold, Electric Cyan, Magenta, in addition to the existing themes.
- Shared Card and PageHeader components redesigned for a cleaner, less cluttered hierarchy across admin pages.
- Settings page previews and uses the toolbar theme immediately.
- Existing Orders, Buying Sheet, Commission, realtime comments, drag/drop and business logic retained.
