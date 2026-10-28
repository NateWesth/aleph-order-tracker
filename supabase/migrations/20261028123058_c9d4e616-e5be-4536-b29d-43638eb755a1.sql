CREATE TABLE public.commission_invoice_links (
  invoice_id text PRIMARY KEY,
  invoice_number text,
  customer_name text,
  invoice_date date,
  rep_id uuid NOT NULL REFERENCES public.reps(id) ON DELETE CASCADE,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.commission_invoice_links TO authenticated;
GRANT ALL ON public.commission_invoice_links TO service_role;
ALTER TABLE public.commission_invoice_links ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Commission editors manage invoice links" ON public.commission_invoice_links
  FOR ALL TO authenticated
  USING (public.can_edit_commission(auth.uid()))
  WITH CHECK (public.can_edit_commission(auth.uid()));
CREATE TRIGGER update_commission_invoice_links_updated_at BEFORE UPDATE ON public.commission_invoice_links
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();