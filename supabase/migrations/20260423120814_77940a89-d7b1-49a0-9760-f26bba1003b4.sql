CREATE TABLE IF NOT EXISTS public.commission_payouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rep_id uuid NOT NULL REFERENCES public.reps(id) ON DELETE CASCADE,
  period_month date NOT NULL,
  invoice_id text NOT NULL,
  invoice_number text,
  customer_name text,
  invoice_date date,
  sub_total numeric NOT NULL DEFAULT 0,
  commission_rate numeric NOT NULL DEFAULT 0,
  commission_amount numeric NOT NULL DEFAULT 0,
  line_items jsonb NOT NULL DEFAULT '[]'::jsonb,
  locked_by uuid,
  locked_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (rep_id, invoice_id)
);

CREATE INDEX IF NOT EXISTS idx_commission_payouts_rep_period
  ON public.commission_payouts (rep_id, period_month);

CREATE INDEX IF NOT EXISTS idx_commission_payouts_invoice
  ON public.commission_payouts (invoice_id);

ALTER TABLE public.commission_payouts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage commission payouts"
  ON public.commission_payouts
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Authenticated users can view commission payouts"
  ON public.commission_payouts
  FOR SELECT
  TO authenticated
  USING (auth.uid() IS NOT NULL);