
-- =============================================================
-- Wave 4: Payout approval workflow, adjustments log, historical
-- rate/assignment tracking for the commission report.
-- =============================================================

-- ---------- 1. Historical rate tracking ----------------------
CREATE TABLE public.rep_rate_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rep_id UUID NOT NULL REFERENCES public.reps(id) ON DELETE CASCADE,
  commission_rate NUMERIC NOT NULL,
  commission_method TEXT NOT NULL,
  effective_from TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID
);
CREATE INDEX rep_rate_history_rep_effective_idx
  ON public.rep_rate_history (rep_id, effective_from DESC);

GRANT SELECT ON public.rep_rate_history TO authenticated;
GRANT ALL ON public.rep_rate_history TO service_role;
ALTER TABLE public.rep_rate_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "commission editors read rate history"
  ON public.rep_rate_history FOR SELECT TO authenticated
  USING (public.can_edit_commission(auth.uid()));

CREATE POLICY "admins manage rate history"
  ON public.rep_rate_history FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- Backfill from current reps
INSERT INTO public.rep_rate_history (rep_id, commission_rate, commission_method, effective_from, created_at)
SELECT id, commission_rate, commission_method, created_at, created_at
FROM public.reps;

-- Trigger: append new snapshot whenever rep's rate or method changes
CREATE OR REPLACE FUNCTION public.log_rep_rate_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF (TG_OP = 'INSERT') THEN
    INSERT INTO public.rep_rate_history (rep_id, commission_rate, commission_method, effective_from, created_by)
    VALUES (NEW.id, NEW.commission_rate, NEW.commission_method, now(), auth.uid());
  ELSIF (OLD.commission_rate IS DISTINCT FROM NEW.commission_rate
         OR OLD.commission_method IS DISTINCT FROM NEW.commission_method) THEN
    INSERT INTO public.rep_rate_history (rep_id, commission_rate, commission_method, effective_from, created_by)
    VALUES (NEW.id, NEW.commission_rate, NEW.commission_method, now(), auth.uid());
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_log_rep_rate_change
  AFTER INSERT OR UPDATE ON public.reps
  FOR EACH ROW EXECUTE FUNCTION public.log_rep_rate_change();

-- ---------- 2. Historical assignment tracking ----------------
CREATE TABLE public.rep_company_assignment_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rep_id UUID NOT NULL,
  company_id UUID NOT NULL,
  commission_rate NUMERIC,
  effective_from TIMESTAMPTZ NOT NULL DEFAULT now(),
  effective_to TIMESTAMPTZ,
  change_type TEXT NOT NULL DEFAULT 'assigned',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID
);
CREATE INDEX rep_company_hist_company_idx
  ON public.rep_company_assignment_history (company_id, effective_from DESC);
CREATE INDEX rep_company_hist_rep_idx
  ON public.rep_company_assignment_history (rep_id, effective_from DESC);

GRANT SELECT ON public.rep_company_assignment_history TO authenticated;
GRANT ALL ON public.rep_company_assignment_history TO service_role;
ALTER TABLE public.rep_company_assignment_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "commission editors read assignment history"
  ON public.rep_company_assignment_history FOR SELECT TO authenticated
  USING (public.can_edit_commission(auth.uid()));

CREATE POLICY "admins manage assignment history"
  ON public.rep_company_assignment_history FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- Backfill from current assignments
INSERT INTO public.rep_company_assignment_history
  (rep_id, company_id, commission_rate, effective_from, change_type, created_at)
SELECT rep_id, company_id, commission_rate, created_at, 'assigned', created_at
FROM public.rep_company_assignments;

-- Track assignment lifecycle: assign / rate-change / unassign
CREATE OR REPLACE FUNCTION public.log_rep_company_assignment_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF (TG_OP = 'INSERT') THEN
    -- Close any lingering open history rows for the same (rep, company)
    UPDATE public.rep_company_assignment_history
      SET effective_to = now()
      WHERE rep_id = NEW.rep_id AND company_id = NEW.company_id
        AND effective_to IS NULL;
    INSERT INTO public.rep_company_assignment_history
      (rep_id, company_id, commission_rate, effective_from, change_type, created_by)
    VALUES (NEW.rep_id, NEW.company_id, NEW.commission_rate, now(), 'assigned', auth.uid());
  ELSIF (TG_OP = 'UPDATE') THEN
    IF OLD.commission_rate IS DISTINCT FROM NEW.commission_rate THEN
      UPDATE public.rep_company_assignment_history
        SET effective_to = now()
        WHERE rep_id = NEW.rep_id AND company_id = NEW.company_id
          AND effective_to IS NULL;
      INSERT INTO public.rep_company_assignment_history
        (rep_id, company_id, commission_rate, effective_from, change_type, created_by)
      VALUES (NEW.rep_id, NEW.company_id, NEW.commission_rate, now(), 'rate_change', auth.uid());
    END IF;
  ELSIF (TG_OP = 'DELETE') THEN
    UPDATE public.rep_company_assignment_history
      SET effective_to = now()
      WHERE rep_id = OLD.rep_id AND company_id = OLD.company_id
        AND effective_to IS NULL;
    INSERT INTO public.rep_company_assignment_history
      (rep_id, company_id, commission_rate, effective_from, effective_to, change_type, created_by)
    VALUES (OLD.rep_id, OLD.company_id, OLD.commission_rate, now(), now(), 'unassigned', auth.uid());
  END IF;
  RETURN COALESCE(NEW, OLD);
END $$;

CREATE TRIGGER trg_log_rep_company_assignment_change
  AFTER INSERT OR UPDATE OR DELETE ON public.rep_company_assignments
  FOR EACH ROW EXECUTE FUNCTION public.log_rep_company_assignment_change();

-- Helper: resolve which rep owned a company on a given date
CREATE OR REPLACE FUNCTION public.resolve_rep_for_company_as_of(_company_id UUID, _as_of TIMESTAMPTZ)
RETURNS TABLE(rep_id UUID, commission_rate NUMERIC)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT h.rep_id, h.commission_rate
  FROM public.rep_company_assignment_history h
  WHERE h.company_id = _company_id
    AND h.effective_from <= _as_of
    AND (h.effective_to IS NULL OR h.effective_to > _as_of)
    AND h.change_type <> 'unassigned'
  ORDER BY h.effective_from DESC
  LIMIT 1;
$$;

-- Helper: resolve rep-level rate/method effective on a date
CREATE OR REPLACE FUNCTION public.resolve_rep_rate_as_of(_rep_id UUID, _as_of TIMESTAMPTZ)
RETURNS TABLE(commission_rate NUMERIC, commission_method TEXT)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT h.commission_rate, h.commission_method
  FROM public.rep_rate_history h
  WHERE h.rep_id = _rep_id AND h.effective_from <= _as_of
  ORDER BY h.effective_from DESC
  LIMIT 1;
$$;

-- ---------- 3. Payout approval workflow ----------------------
CREATE TABLE public.commission_payout_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rep_id UUID NOT NULL REFERENCES public.reps(id) ON DELETE CASCADE,
  period_month DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','approved','paid','void')),
  invoice_count INTEGER NOT NULL DEFAULT 0,
  gross_commission NUMERIC NOT NULL DEFAULT 0,
  adjustments_total NUMERIC NOT NULL DEFAULT 0,
  net_payout NUMERIC NOT NULL DEFAULT 0,
  notes TEXT,
  created_by UUID,
  approved_by UUID,
  approved_at TIMESTAMPTZ,
  paid_by UUID,
  paid_at TIMESTAMPTZ,
  paid_reference TEXT,
  voided_by UUID,
  voided_at TIMESTAMPTZ,
  void_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX commission_payout_batches_rep_period_idx
  ON public.commission_payout_batches (rep_id, period_month DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.commission_payout_batches TO authenticated;
GRANT ALL ON public.commission_payout_batches TO service_role;
ALTER TABLE public.commission_payout_batches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "commission editors read batches"
  ON public.commission_payout_batches FOR SELECT TO authenticated
  USING (public.can_edit_commission(auth.uid()));

CREATE POLICY "commission editors insert batches"
  ON public.commission_payout_batches FOR INSERT TO authenticated
  WITH CHECK (public.can_edit_commission(auth.uid()));

CREATE POLICY "admins update batches"
  ON public.commission_payout_batches FOR UPDATE TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY "admins delete batches"
  ON public.commission_payout_batches FOR DELETE TO authenticated
  USING (public.is_admin());

CREATE TRIGGER trg_commission_payout_batches_updated_at
  BEFORE UPDATE ON public.commission_payout_batches
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Link existing per-invoice payouts into batches
ALTER TABLE public.commission_payouts
  ADD COLUMN batch_id UUID REFERENCES public.commission_payout_batches(id) ON DELETE SET NULL;
CREATE INDEX commission_payouts_batch_idx ON public.commission_payouts (batch_id);

-- ---------- 4. Adjustments / dispute log ---------------------
CREATE TABLE public.commission_adjustments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rep_id UUID NOT NULL REFERENCES public.reps(id) ON DELETE CASCADE,
  period_month DATE NOT NULL,
  batch_id UUID REFERENCES public.commission_payout_batches(id) ON DELETE SET NULL,
  invoice_id TEXT,
  invoice_number TEXT,
  line_index INTEGER,
  adjustment_type TEXT NOT NULL DEFAULT 'correction'
    CHECK (adjustment_type IN ('dispute','bonus','clawback','correction','manual')),
  amount NUMERIC NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open','approved','applied','rejected')),
  reason TEXT NOT NULL,
  note TEXT,
  created_by UUID,
  resolved_by UUID,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX commission_adjustments_rep_period_idx
  ON public.commission_adjustments (rep_id, period_month DESC);
CREATE INDEX commission_adjustments_status_idx
  ON public.commission_adjustments (status);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.commission_adjustments TO authenticated;
GRANT ALL ON public.commission_adjustments TO service_role;
ALTER TABLE public.commission_adjustments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "commission editors read adjustments"
  ON public.commission_adjustments FOR SELECT TO authenticated
  USING (public.can_edit_commission(auth.uid()));

CREATE POLICY "commission editors insert adjustments"
  ON public.commission_adjustments FOR INSERT TO authenticated
  WITH CHECK (public.can_edit_commission(auth.uid()));

CREATE POLICY "commission editors update own open adjustments"
  ON public.commission_adjustments FOR UPDATE TO authenticated
  USING (
    public.is_admin()
    OR (public.can_edit_commission(auth.uid())
        AND created_by = auth.uid()
        AND status = 'open')
  )
  WITH CHECK (
    public.is_admin()
    OR (public.can_edit_commission(auth.uid())
        AND created_by = auth.uid()
        AND status = 'open')
  );

CREATE POLICY "admins delete adjustments"
  ON public.commission_adjustments FOR DELETE TO authenticated
  USING (public.is_admin());

CREATE TRIGGER trg_commission_adjustments_updated_at
  BEFORE UPDATE ON public.commission_adjustments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
