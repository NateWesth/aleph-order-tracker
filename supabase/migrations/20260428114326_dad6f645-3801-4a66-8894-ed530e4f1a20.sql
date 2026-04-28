CREATE TABLE public.commission_line_overrides (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  rep_id UUID NOT NULL,
  invoice_id TEXT NOT NULL,
  line_index INTEGER NOT NULL,
  sell_rate NUMERIC,
  cost NUMERIC,
  sub_total NUMERIC,
  commission_rate NUMERIC,
  commission NUMERIC,
  note TEXT,
  created_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (rep_id, invoice_id, line_index)
);

ALTER TABLE public.commission_line_overrides ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage commission line overrides"
ON public.commission_line_overrides
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Authenticated users can view commission line overrides"
ON public.commission_line_overrides
FOR SELECT
TO authenticated
USING (auth.uid() IS NOT NULL);

CREATE TRIGGER update_commission_line_overrides_updated_at
BEFORE UPDATE ON public.commission_line_overrides
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_commission_line_overrides_rep_invoice
ON public.commission_line_overrides (rep_id, invoice_id);