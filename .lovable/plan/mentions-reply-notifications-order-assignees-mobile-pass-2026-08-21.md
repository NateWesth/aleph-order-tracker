# @Mentions, Reply Notifications, Order Assignees + Mobile Pass

## 1. @mentions in order comments

- Typing `@` in an order item comment (and in order updates/messages) opens an inline picker of approved teammates, filtered as you type.
- Selected names are stored with the comment and rendered as highlighted chips in the thread.
- Mentioned users get a notification: "Nathan mentioned you on Order ORD-1042".

## 2. Reply + mention notifications

- Replying to a comment notifies the original comment author (unless it's you).
- Mentions notify every mentioned user once per comment.
- Both land in the existing Notification Center under the "Comments & notes" tab, deep-linking to the order and item.

## 3. Order assignee

- New "Assigned to" field on orders, editable from the order details dialog and from the order row quick edit.
- Assignee avatar/initials shown on order cards and in the order table so everyone sees who is handling what.
- Assigning someone notifies them ("You were assigned Order ORD-1042"); reassignment notifies the new owner.
- Filter on the Orders board: All / Assigned to me / Unassigned.

## 4. Mobile

Bring the above to mobile in a mobile-suited form:

- Mention picker becomes a bottom sheet with large tap targets instead of a floating dropdown.
- Comment composer becomes a full-width sticky sheet with the keyboard, respecting safe-area insets.
- Assignee picker uses the same bottom-sheet pattern; assignee shows as a compact initials chip on order cards.
- Notification Center panel goes full-screen on small viewports with the existing two tabs.

## 5. Mobile scrolling fix

Diagnosis (confirmed by reading the shell and stylesheet): the dashboard shell is rendered as a fixed-height `h-[100dvh] overflow-hidden` container whose `<main>` is the intended scroll region, but `src/index.css` later forces `.app-shell`, `.app-shell > div`, `.app-shell main` and `.app-page-stage` to `height: auto !important; overflow-y: visible !important`. So neither the shell nor `main` can own the scroll, and on touch devices the page ends up with no working scroll owner.

Fix: pick one scroll owner and remove the contradiction.

- Desktop keeps the current behaviour: `main` scrolls independently (columns stay pinned).
- Mobile: let the document scroll — shell height becomes auto, `main` stops being a clipped viewport, and `overscroll-behavior` / `touch-action` are set so vertical panning always works.
- Remove leftover blanket `!important` overrides in `index.css` that fight the shell layout, and keep `-webkit-overflow-scrolling: touch` on genuine inner scrollers (dialogs, comment feeds, board columns).
- Verify by driving the preview at a mobile viewport and confirming the Orders, Buying Sheet, PO Tracking and Settings pages scroll to the bottom.

## Technical notes

- Migration: add `assigned_to uuid` to `public.orders` (nullable, references `profiles.id` logically, indexed) and a `mentioned_user_ids uuid[]` column on `order_item_comments` and `order_updates`; RLS unchanged (existing order-scoped policies cover them). Grants included for `authenticated`/`service_role` on any new object.
- Notifications reuse the existing `notifications` table with new `type` values `comment_mention`, `comment_reply`, `order_assigned`, inserted from database triggers (SECURITY DEFINER, `SET search_path = public`) so they fire regardless of client.
- Mention parsing stores user ids explicitly rather than re-parsing text, so renames don't break links.
- Mobile sheets use the existing shadcn `Sheet` primitive plus `useIsMobile()`.
- No changes to Zoho sync, commission or buying-sheet logic.
