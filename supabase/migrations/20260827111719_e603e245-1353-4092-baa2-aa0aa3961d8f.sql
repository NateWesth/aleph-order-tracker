-- Fulfillment assignment notifications
CREATE OR REPLACE FUNCTION public.notify_fulfillment_assignment()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.fulfillment_assigned_to IS NOT DISTINCT FROM OLD.fulfillment_assigned_to THEN RETURN NEW; END IF;
  IF OLD.fulfillment_assigned_to IS NOT NULL THEN
    INSERT INTO public.notifications (user_id, type, title, message, order_id, order_number, metadata)
    VALUES (OLD.fulfillment_assigned_to,'fulfillment_unassigned','Delivery unassigned','Delivery ' || COALESCE(NEW.order_number,'') || ' is no longer assigned to you.',NEW.id,NEW.order_number,jsonb_build_object('kind','delivery','previous_assignee',OLD.fulfillment_assigned_to,'new_assignee',NEW.fulfillment_assigned_to));
  END IF;
  IF NEW.fulfillment_assigned_to IS NOT NULL THEN
    INSERT INTO public.notifications (user_id, type, title, message, order_id, order_number, metadata)
    VALUES (NEW.fulfillment_assigned_to,'fulfillment_assigned','Delivery assigned to you','You were assigned delivery ' || COALESCE(NEW.order_number,'') || '.',NEW.id,NEW.order_number,jsonb_build_object('kind','delivery','previous_assignee',OLD.fulfillment_assigned_to,'new_assignee',NEW.fulfillment_assigned_to));
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_notify_fulfillment_assignment ON public.orders;
CREATE TRIGGER trg_notify_fulfillment_assignment
AFTER UPDATE OF fulfillment_assigned_to ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.notify_fulfillment_assignment();

CREATE OR REPLACE FUNCTION public.notify_po_collection_assignment()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE old_assignee uuid := CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE OLD.assigned_to END;
BEGIN
  IF NEW.assigned_to IS NOT DISTINCT FROM old_assignee THEN RETURN NEW; END IF;
  IF old_assignee IS NOT NULL THEN
    INSERT INTO public.notifications (user_id, type, title, message, order_number, metadata)
    VALUES (old_assignee,'fulfillment_unassigned','Collection unassigned','Supplier collection ' || COALESCE(NEW.purchase_order_number,'') || ' is no longer assigned to you.',NEW.purchase_order_number,jsonb_build_object('kind','collection','purchase_order_id',NEW.purchase_order_id,'previous_assignee',old_assignee,'new_assignee',NEW.assigned_to));
  END IF;
  IF NEW.assigned_to IS NOT NULL THEN
    INSERT INTO public.notifications (user_id, type, title, message, order_number, metadata)
    VALUES (NEW.assigned_to,'fulfillment_assigned','Collection assigned to you','You were assigned supplier collection ' || COALESCE(NEW.purchase_order_number,'') || '.',NEW.purchase_order_number,jsonb_build_object('kind','collection','purchase_order_id',NEW.purchase_order_id,'previous_assignee',old_assignee,'new_assignee',NEW.assigned_to));
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_notify_po_collection_assignment ON public.po_collection_state;
CREATE TRIGGER trg_notify_po_collection_assignment
AFTER INSERT OR UPDATE OF assigned_to ON public.po_collection_state
FOR EACH ROW EXECUTE FUNCTION public.notify_po_collection_assignment();

-- Operations intelligence automation rules
CREATE TABLE IF NOT EXISTS public.operational_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  trigger_type text NOT NULL,
  action_type text NOT NULL,
  configuration jsonb NOT NULL DEFAULT '{}'::jsonb,
  enabled boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS operational_rules_enabled_idx ON public.operational_rules(enabled, trigger_type);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.operational_rules TO authenticated;
GRANT ALL ON public.operational_rules TO service_role;
ALTER TABLE public.operational_rules ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated users can view operational rules" ON public.operational_rules;
CREATE POLICY "Authenticated users can view operational rules" ON public.operational_rules FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Admins manage operational rules" ON public.operational_rules;
CREATE POLICY "Admins manage operational rules" ON public.operational_rules FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE OR REPLACE FUNCTION public.touch_operational_rules_updated_at() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;
DROP TRIGGER IF EXISTS trg_operational_rules_updated_at ON public.operational_rules;
CREATE TRIGGER trg_operational_rules_updated_at BEFORE UPDATE ON public.operational_rules FOR EACH ROW EXECUTE FUNCTION public.touch_operational_rules_updated_at();

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='operational_rules') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.operational_rules;
  END IF;
END $$;
NOTIFY pgrst, 'reload schema';