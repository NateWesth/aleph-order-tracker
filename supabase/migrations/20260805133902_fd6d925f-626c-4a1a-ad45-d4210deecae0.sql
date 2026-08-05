CREATE TABLE IF NOT EXISTS public.po_tracking_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payload jsonb NOT NULL,
  fetched_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.po_tracking_cache TO authenticated;
GRANT ALL ON public.po_tracking_cache TO service_role;
ALTER TABLE public.po_tracking_cache ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can read PO tracking cache"
ON public.po_tracking_cache FOR SELECT TO authenticated USING (true);