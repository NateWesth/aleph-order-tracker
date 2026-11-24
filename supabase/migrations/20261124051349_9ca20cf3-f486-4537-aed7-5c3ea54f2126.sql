CREATE OR REPLACE FUNCTION public.sync_client_operational_orders()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.purchasing_invoicing_user_id IS NOT NULL
     AND (TG_OP = 'INSERT' OR OLD.purchasing_invoicing_user_id IS DISTINCT FROM NEW.purchasing_invoicing_user_id) THEN
    UPDATE public.orders
    SET assigned_to = NEW.purchasing_invoicing_user_id
    WHERE company_id = NEW.id
      AND completed_date IS NULL
      AND coalesce(status, '') NOT IN ('completed', 'delivered', 'cancelled')
      AND assigned_to IS DISTINCT FROM public.effective_operational_owner(NEW.purchasing_invoicing_user_id);
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.sync_client_operational_orders() FROM PUBLIC, anon, authenticated;