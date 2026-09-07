# Round 10 — Continuity, Service Desk and Order Lab

## Included

- **Since You Were Away**: My Work keeps a personal checkpoint and shows new operational activity and direct notifications since that point.
- **Temporary responsibility cover**: users can delegate their work for a date range without permanently changing ownership. Covered assignments appear in the delegate's My Work page.
- **Returns & RMA**: new return intake, ownership, priorities, deadlines, statuses and completion history.
- **Loan tool register**: checkout, borrower, due dates, condition and return workflow.
- **Calibration register**: certificate details, automatic next-due calculation and due/expired status.
- **Safe order split and merge**: database transactions protect processed quantities and record order relationships and activity.
- **Approved product alternatives**: reusable product pairings with guarded substitution on untouched order lines.
- **Mistake prevention assistant**: detects duplicate order numbers, missing customers/items/descriptions, impossible quantities, unowned urgent orders and long-running orders.
- **Morning and afternoon email redesign**: responsive branded layouts, personalized greetings, exception-first content, service deadlines, direct assignments and clean PDF handovers.
- **Global discovery**: Returns, loan tools and calibration assets can be found from the top search and all new workspaces are available from the command palette.

## Deployment

1. Apply all pending migrations, including:
   `supabase/migrations/20260907120000_continuity_service_and_order_lab.sql`
2. Deploy these Edge Functions and their shared module:
   - `supabase/functions/daily-morning-report`
   - `supabase/functions/daily-afternoon-report`
   - `supabase/functions/_shared/operational-email.ts`
3. Deploy the frontend.

The scheduled functions continue using the existing `MAILGUN_API_KEY`, `MAILGUN_DOMAIN`, `MAILGUN_BASE_URL` and report preference fields. `APP_URL` is optional and defaults to the current Aleph web address.

## Verification

- `tsc -b` passes.
- The production Vite/PWA build passes with 3,969 transformed modules.
- Service Desk and Order Lab remain lazy-loaded; their production chunks are approximately 18.6 KB each before gzip.
