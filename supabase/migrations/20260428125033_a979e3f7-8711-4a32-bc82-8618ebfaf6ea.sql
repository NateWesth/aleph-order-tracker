CREATE UNIQUE INDEX IF NOT EXISTS commission_report_cache_period_all_reps_unique
ON public.commission_report_cache (period_month)
WHERE rep_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS commission_report_cache_period_rep_unique
ON public.commission_report_cache (period_month, rep_id)
WHERE rep_id IS NOT NULL;