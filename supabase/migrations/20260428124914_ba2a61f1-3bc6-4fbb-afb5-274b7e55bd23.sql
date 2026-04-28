CREATE TABLE IF NOT EXISTS public.commission_report_cache (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  period_month DATE NOT NULL,
  rep_id UUID NULL,
  date_start DATE NOT NULL,
  date_end DATE NOT NULL,
  report JSONB NOT NULL,
  zoho_cost_prices JSONB NOT NULL DEFAULT '{}'::jsonb,
  refreshed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (period_month, rep_id)
);

ALTER TABLE public.commission_report_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view commission report cache"
ON public.commission_report_cache
FOR SELECT
TO authenticated
USING (auth.uid() IS NOT NULL);

CREATE POLICY "Admins can manage commission report cache"
ON public.commission_report_cache
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE INDEX IF NOT EXISTS idx_commission_report_cache_period
ON public.commission_report_cache (period_month, rep_id);

CREATE TRIGGER update_commission_report_cache_updated_at
BEFORE UPDATE ON public.commission_report_cache
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();