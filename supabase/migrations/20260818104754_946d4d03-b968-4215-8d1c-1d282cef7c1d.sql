-- 1. Companies: remove redundant/overlapping write policies
DROP POLICY IF EXISTS "Admins can manage companies" ON public.companies;
DROP POLICY IF EXISTS "Admins can insert companies" ON public.companies;
DROP POLICY IF EXISTS "Admins can update companies" ON public.companies;

-- 2. Order item comments: scope reads to users who can access the related order
DROP POLICY IF EXISTS "Authenticated users can view item comments" ON public.order_item_comments;
CREATE POLICY "Users can view comments on accessible orders"
ON public.order_item_comments
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.order_items oi
    JOIN public.orders o ON o.id = oi.order_id
    WHERE oi.id = order_item_comments.order_item_id
      AND (
        public.has_role(auth.uid(), 'admin'::app_role)
        OR o.user_id = auth.uid()
        OR o.company_id IN (
          SELECT c.id FROM public.companies c
          JOIN public.profiles p ON (p.company_code = c.code OR p.company_id = c.id)
          WHERE p.id = auth.uid()
        )
      )
  )
);

-- 3. Revoke direct API execute on internal SECURITY DEFINER routines (trigger functions)
DO $$
DECLARE fn record;
BEGIN
  FOR fn IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef
      AND pg_get_function_result(p.oid) = 'trigger'
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', fn.sig);
  END LOOP;
END $$;

-- Reporting helpers used only by edge functions (service_role)
REVOKE ALL ON FUNCTION public.resolve_rep_for_company_as_of(uuid, timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.resolve_rep_rate_as_of(uuid, timestamptz) FROM PUBLIC, anon, authenticated;

-- Role/permission helpers: signed-in users only (needed for RLS evaluation), not anonymous
REVOKE ALL ON FUNCTION public.has_role(uuid, app_role) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_admin() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_current_user_role() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_user_role(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_user_role_safe(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_user_role_simple(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_user_approved(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_edit_commission(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_unread_updates_count(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.mark_order_update_as_read(uuid, uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_current_user_role() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_user_role(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_user_role_safe(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_user_role_simple(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_user_approved(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_edit_commission(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_unread_updates_count(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.mark_order_update_as_read(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.resolve_rep_for_company_as_of(uuid, timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.resolve_rep_rate_as_of(uuid, timestamptz) TO service_role;

-- Sign-up / invitation helpers stay reachable pre-login
GRANT EXECUTE ON FUNCTION public.validate_company_code(text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_invitation_by_token(uuid) TO anon, authenticated, service_role;