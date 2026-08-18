# Aleph UI / Scrolling Makeover

## Key changes
- Main admin shell now uses natural document scrolling instead of nested `overflow-y-auto` scrolling.
- Orders board columns use natural page height instead of fixed-height nested ScrollArea regions.
- Desktop navigation wraps instead of horizontally scrolling.
- Remaining admin/order horizontal overflow wrappers were removed from the page-level experience.
- Global app-shell containment prevents page-level horizontal scrolling and makes tables/cells wrap responsively.
- Commission and Buying Sheet makeover files from the coordinated redesign are installed in the real project paths.
- Existing Aleph logo asset and brand colour variables are preserved.
- Activity feed sidebar remains sticky below the live-measured header height.
- Realtime order-item comment UI and Buying Sheet backend fixes from the prior update remain included.

## Verification
- Parsed 239 TypeScript/TSX files with TypeScript transpilation: 0 syntax-error files.
