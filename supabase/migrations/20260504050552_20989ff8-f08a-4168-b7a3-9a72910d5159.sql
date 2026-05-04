
-- 1. Fix privilege escalation on user_roles
DROP POLICY IF EXISTS "basic_user_roles_access" ON public.user_roles;
CREATE POLICY "Users can view their own role"
  ON public.user_roles
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- 2. Lock down zoho_sync_log
DROP POLICY IF EXISTS "System can manage sync log" ON public.zoho_sync_log;
CREATE POLICY "Admins can manage sync log"
  ON public.zoho_sync_log
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- 3. Restrict client_invitations public reads
DROP POLICY IF EXISTS "Anyone can read invitation by token" ON public.client_invitations;
-- Acceptance happens via send-client-invite / portal flow using service role; no public SELECT needed.

-- 4. Restrict commission/financial data to admins
DROP POLICY IF EXISTS "Authenticated users can view commission payouts" ON public.commission_payouts;
DROP POLICY IF EXISTS "Authenticated users can view commission line overrides" ON public.commission_line_overrides;
DROP POLICY IF EXISTS "Authenticated users can view commission report cache" ON public.commission_report_cache;
DROP POLICY IF EXISTS "Authenticated users can view reps" ON public.reps;
DROP POLICY IF EXISTS "Authenticated users can view rep assignments" ON public.rep_company_assignments;

CREATE POLICY "Admins can view commission payouts"
  ON public.commission_payouts FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can view commission line overrides"
  ON public.commission_line_overrides FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can view commission report cache"
  ON public.commission_report_cache FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can view reps"
  ON public.reps FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can view rep assignments"
  ON public.rep_company_assignments FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

-- 5. Order activity log integrity
DROP POLICY IF EXISTS "System can insert activity logs" ON public.order_activity_log;
CREATE POLICY "Users can log activity for accessible orders"
  ON public.order_activity_log
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = order_activity_log.order_id
        AND (
          o.user_id = auth.uid()
          OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.company_id = o.company_id)
          OR public.has_role(auth.uid(), 'admin'::app_role)
        )
    )
  );
