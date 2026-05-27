
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS can_edit_commission boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.can_edit_commission(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT can_edit_commission FROM public.profiles WHERE id = _user_id),
    false
  ) OR public.has_role(_user_id, 'admin'::app_role);
$$;

-- reps
DROP POLICY IF EXISTS "Admins can manage reps" ON public.reps;
DROP POLICY IF EXISTS "Admins can view reps" ON public.reps;
CREATE POLICY "Commission editors can view reps" ON public.reps
  FOR SELECT TO authenticated USING (public.can_edit_commission(auth.uid()));
CREATE POLICY "Commission editors can manage reps" ON public.reps
  FOR ALL TO authenticated
  USING (public.can_edit_commission(auth.uid()))
  WITH CHECK (public.can_edit_commission(auth.uid()));

-- rep_company_assignments
DROP POLICY IF EXISTS "Admins can manage rep assignments" ON public.rep_company_assignments;
DROP POLICY IF EXISTS "Admins can view rep assignments" ON public.rep_company_assignments;
CREATE POLICY "Commission editors can view rep assignments" ON public.rep_company_assignments
  FOR SELECT TO authenticated USING (public.can_edit_commission(auth.uid()));
CREATE POLICY "Commission editors can manage rep assignments" ON public.rep_company_assignments
  FOR ALL TO authenticated
  USING (public.can_edit_commission(auth.uid()))
  WITH CHECK (public.can_edit_commission(auth.uid()));

-- commission_report_cache
DROP POLICY IF EXISTS "Admins can manage commission report cache" ON public.commission_report_cache;
DROP POLICY IF EXISTS "Admins can view commission report cache" ON public.commission_report_cache;
CREATE POLICY "Commission editors can view commission report cache" ON public.commission_report_cache
  FOR SELECT TO authenticated USING (public.can_edit_commission(auth.uid()));
CREATE POLICY "Commission editors can manage commission report cache" ON public.commission_report_cache
  FOR ALL TO authenticated
  USING (public.can_edit_commission(auth.uid()))
  WITH CHECK (public.can_edit_commission(auth.uid()));

-- commission_line_overrides
DROP POLICY IF EXISTS "Admins can view commission line overrides" ON public.commission_line_overrides;
DROP POLICY IF EXISTS "Admins manage commission line overrides" ON public.commission_line_overrides;
CREATE POLICY "Commission editors can view commission line overrides" ON public.commission_line_overrides
  FOR SELECT TO authenticated USING (public.can_edit_commission(auth.uid()));
CREATE POLICY "Commission editors manage commission line overrides" ON public.commission_line_overrides
  FOR ALL TO authenticated
  USING (public.can_edit_commission(auth.uid()))
  WITH CHECK (public.can_edit_commission(auth.uid()));

-- commission_payouts
DROP POLICY IF EXISTS "Admins can view commission payouts" ON public.commission_payouts;
DROP POLICY IF EXISTS "Admins manage commission payouts" ON public.commission_payouts;
CREATE POLICY "Commission editors can view commission payouts" ON public.commission_payouts
  FOR SELECT TO authenticated USING (public.can_edit_commission(auth.uid()));
CREATE POLICY "Commission editors manage commission payouts" ON public.commission_payouts
  FOR ALL TO authenticated
  USING (public.can_edit_commission(auth.uid()))
  WITH CHECK (public.can_edit_commission(auth.uid()));
