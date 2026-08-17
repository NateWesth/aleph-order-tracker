CREATE TABLE IF NOT EXISTS public.buying_sheet_cache (
  id text PRIMARY KEY,
  payload jsonb NOT NULL,
  fetched_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.buying_sheet_cache TO authenticated;
GRANT ALL ON public.buying_sheet_cache TO service_role;
ALTER TABLE public.buying_sheet_cache ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "Authenticated can read buying sheet cache" ON public.buying_sheet_cache FOR SELECT TO authenticated USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;