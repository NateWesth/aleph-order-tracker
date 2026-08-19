# Essential performance and reliability update

## What changed

- Realtime refreshes are coalesced. A burst of database events now produces one refresh, and a second refresh only runs if another event arrived while the first was in progress.
- Scheduled database polling was removed from Orders, Progress, Processing, Completed, Files, Activity, Overdue Alerts and Commission. These pages use Realtime plus focus/reconnect recovery.
- Duplicate legacy Realtime subscriptions were removed from the main operational pages.
- Orders Board relationship queries now load concurrently instead of as a long sequential chain.
- Buying Sheet lead-time and reliability calculations share one recent dataset, historical analytics are bounded to twelve months, and the first calculation waits for its insight maps.
- PDF and Excel libraries load only when an export is requested. The initial Completed page JavaScript chunk fell from about 341 KB to 59 KB in the production build.
- A global recovery screen prevents an unexpected component render error from leaving users on a blank screen.
- Offline messaging now accurately tells users to reconnect before saving.
- A database migration adds indexes for the filters and joins used most frequently by operational pages.

## Deployment

Deploy the app normally and apply all pending Supabase migrations:

```bash
supabase db push
```

The relevant migration is:

```text
supabase/migrations/20260819113000_essential_performance_indexes.sql
```

No scheduled job is required. Realtime remains the normal update path.
