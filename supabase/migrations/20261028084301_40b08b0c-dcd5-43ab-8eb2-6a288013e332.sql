CREATE TABLE public.commission_bill_cache (
  bill_id text PRIMARY KEY,
  bill_date date,
  last_modified_time text,
  line_items jsonb NOT NULL DEFAULT '[]'::jsonb,
  fetched_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.commission_bill_cache TO service_role;
ALTER TABLE public.commission_bill_cache ENABLE ROW LEVEL SECURITY;
CREATE INDEX commission_bill_cache_date_idx ON public.commission_bill_cache (bill_date DESC);