## Apply Uploaded Project Archive As-Is

Apply the uploaded `aleph-order-tracker_6.zip` to the project without modifying any of its contents.

### Scope

- The archive contains 381 files covering `src/`, `supabase/`, config files, and other project assets.
- It also includes the missing `OrderItemsFloatingBubble.tsx` component, which resolves the current runtime import error in `OrdersPage.tsx`.

### Steps

1. **Safety check**: Confirm the archive contains no `.git` metadata before copying.
2. **Apply files**: Use `rsync` to copy the archive contents into `/dev-server/`, excluding `.git` and any lock files that should remain project-managed.
3. **Verify build**: Run the typecheck/build command to ensure the applied code compiles cleanly.
4. **Verify preview**: Load the preview to confirm the app renders without runtime errors.

### Notes

- No code changes will be made to the uploaded files.
- Existing project files will be overwritten by the archive versions where paths match.
- After applying, any currently reported runtime errors related to missing imports should be resolved automatically.
