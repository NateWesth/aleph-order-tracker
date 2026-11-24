CREATE OR REPLACE FUNCTION public.reconcile_operational_leave_cover()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.orders o
  SET assigned_to = public.effective_operational_owner(c.purchasing_invoicing_user_id)
  FROM public.companies c
  WHERE o.company_id = c.id
    AND c.purchasing_invoicing_user_id IS NOT NULL
    AND o.completed_date IS NULL
    AND coalesce(o.status, '') NOT IN ('completed', 'delivered', 'cancelled')
    AND o.assigned_to IS DISTINCT FROM public.effective_operational_owner(c.purchasing_invoicing_user_id);
END;
$$;
REVOKE ALL ON FUNCTION public.reconcile_operational_leave_cover() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reconcile_operational_leave_cover() TO service_role;