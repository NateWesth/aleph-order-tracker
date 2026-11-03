ALTER TABLE public.companies ADD COLUMN purchasing_invoicing_user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL;
CREATE INDEX companies_purchasing_invoicing_user_idx ON public.companies(purchasing_invoicing_user_id) WHERE purchasing_invoicing_user_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.guard_client_operational_assignment()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF (TG_OP = 'INSERT' AND NEW.purchasing_invoicing_user_id IS NOT NULL)
     OR (TG_OP = 'UPDATE' AND OLD.purchasing_invoicing_user_id IS DISTINCT FROM NEW.purchasing_invoicing_user_id) THEN
    IF NOT public.is_admin() THEN
      RAISE EXCEPTION 'Only administrators can link clients to purchasing and invoicing users';
    END IF;
    IF NEW.purchasing_invoicing_user_id IS NOT NULL AND NOT public.is_user_approved(NEW.purchasing_invoicing_user_id) THEN
      RAISE EXCEPTION 'Choose an approved team member';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER guard_client_operational_assignment BEFORE INSERT OR UPDATE OF purchasing_invoicing_user_id ON public.companies FOR EACH ROW EXECUTE FUNCTION public.guard_client_operational_assignment();

CREATE OR REPLACE FUNCTION public.apply_client_operational_assignment()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE linked_user uuid;
BEGIN
  -- Lock the client row to serialize new orders with an administrator changing its link.
  SELECT purchasing_invoicing_user_id INTO linked_user FROM public.companies WHERE id = NEW.company_id FOR SHARE;
  IF linked_user IS NOT NULL THEN
    NEW.assigned_to := linked_user;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER apply_client_operational_assignment BEFORE INSERT OR UPDATE OF company_id, assigned_to ON public.orders FOR EACH ROW EXECUTE FUNCTION public.apply_client_operational_assignment();

CREATE OR REPLACE FUNCTION public.sync_client_operational_orders()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.purchasing_invoicing_user_id IS NOT NULL AND (TG_OP = 'INSERT' OR OLD.purchasing_invoicing_user_id IS DISTINCT FROM NEW.purchasing_invoicing_user_id) THEN
    UPDATE public.orders SET assigned_to = NEW.purchasing_invoicing_user_id
    WHERE company_id = NEW.id AND assigned_to IS DISTINCT FROM NEW.purchasing_invoicing_user_id;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER sync_client_operational_orders AFTER INSERT OR UPDATE OF purchasing_invoicing_user_id ON public.companies FOR EACH ROW EXECUTE FUNCTION public.sync_client_operational_orders();
REVOKE ALL ON FUNCTION public.guard_client_operational_assignment() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.apply_client_operational_assignment() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sync_client_operational_orders() FROM PUBLIC, anon, authenticated;