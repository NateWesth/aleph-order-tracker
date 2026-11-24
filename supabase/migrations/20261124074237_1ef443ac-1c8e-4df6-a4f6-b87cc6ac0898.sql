CREATE TABLE public.supplier_delivery_tracking (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 supplier_id uuid NOT NULL REFERENCES public.suppliers(id),
 purchase_order_number text NOT NULL,
 ordered_date date NOT NULL,
 expected_date date NOT NULL,
 received_date date,
 cancelled boolean NOT NULL DEFAULT false,
 notes text NOT NULL DEFAULT '',
 created_by uuid NOT NULL DEFAULT auth.uid(),
 updated_by uuid NOT NULL DEFAULT auth.uid(),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(supplier_id, purchase_order_number)
);
GRANT SELECT, INSERT, UPDATE ON public.supplier_delivery_tracking TO authenticated;
GRANT DELETE ON public.supplier_delivery_tracking TO authenticated;
GRANT ALL ON public.supplier_delivery_tracking TO service_role;
ALTER TABLE public.supplier_delivery_tracking ENABLE ROW LEVEL SECURITY;
CREATE POLICY supplier_delivery_read ON public.supplier_delivery_tracking FOR SELECT TO authenticated USING (public.is_user_approved(auth.uid()) OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY supplier_delivery_add ON public.supplier_delivery_tracking FOR INSERT TO authenticated WITH CHECK ((public.is_user_approved(auth.uid()) OR public.has_role(auth.uid(), 'admin')) AND created_by = auth.uid());
CREATE POLICY supplier_delivery_edit ON public.supplier_delivery_tracking FOR UPDATE TO authenticated USING (public.is_user_approved(auth.uid()) OR public.has_role(auth.uid(), 'admin')) WITH CHECK (public.is_user_approved(auth.uid()) OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY supplier_delivery_delete ON public.supplier_delivery_tracking FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE OR REPLACE FUNCTION public.validate_supplier_delivery_tracking() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
 NEW.purchase_order_number := upper(btrim(NEW.purchase_order_number));
 IF NEW.purchase_order_number = '' OR length(NEW.purchase_order_number) > 100 THEN RAISE EXCEPTION 'Enter a PO reference of 1 to 100 characters'; END IF;
 IF NEW.ordered_date > (now() AT TIME ZONE 'Africa/Johannesburg')::date THEN RAISE EXCEPTION 'Ordered date cannot be in the future'; END IF;
 IF NEW.expected_date < NEW.ordered_date THEN RAISE EXCEPTION 'Expected date cannot precede ordered date'; END IF;
 IF NEW.received_date IS NOT NULL AND (NEW.received_date < NEW.ordered_date OR NEW.received_date > (now() AT TIME ZONE 'Africa/Johannesburg')::date) THEN RAISE EXCEPTION 'Fully received date must be between ordered date and today'; END IF;
 IF NEW.cancelled AND NEW.received_date IS NOT NULL THEN RAISE EXCEPTION 'Cancelled deliveries cannot have a fully received date'; END IF;
 IF TG_OP = 'UPDATE' THEN
   NEW.created_by := OLD.created_by; NEW.created_at := OLD.created_at;
 END IF;
 NEW.updated_by := coalesce(auth.uid(), NEW.updated_by);
 NEW.updated_at := now();
 RETURN NEW;
END; $$;
CREATE TRIGGER validate_supplier_delivery_tracking BEFORE INSERT OR UPDATE ON public.supplier_delivery_tracking FOR EACH ROW EXECUTE FUNCTION public.validate_supplier_delivery_tracking();
CREATE INDEX supplier_delivery_ordered_idx ON public.supplier_delivery_tracking(ordered_date, id);
ALTER PUBLICATION supabase_realtime ADD TABLE public.supplier_delivery_tracking;