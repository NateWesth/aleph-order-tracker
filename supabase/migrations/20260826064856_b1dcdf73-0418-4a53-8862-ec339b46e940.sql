CREATE OR REPLACE FUNCTION public.capture_collection_timeline()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  event_title text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    event_title := 'Supplier movement created';
  ELSIF NEW.status IS DISTINCT FROM OLD.status THEN
    event_title := 'Supplier movement moved to ' || replace(NEW.status, '_', ' ');
  ELSIF NEW.collection_method IS DISTINCT FROM OLD.collection_method THEN
    event_title := CASE WHEN NEW.collection_method = 'supplier-delivery' THEN 'Supplier will deliver' ELSE 'Collection pickup selected' END;
  ELSIF NEW.is_urgent IS DISTINCT FROM OLD.is_urgent THEN
    event_title := CASE WHEN NEW.is_urgent THEN 'Supplier movement marked urgent' ELSE 'Supplier movement priority normalised' END;
  ELSIF NEW.assigned_to IS DISTINCT FROM OLD.assigned_to THEN
    event_title := CASE WHEN NEW.assigned_to IS NULL THEN 'Supplier movement unassigned' ELSE 'Supplier movement assigned' END;
  ELSIF NEW.scheduled_for IS DISTINCT FROM OLD.scheduled_for THEN
    event_title := CASE WHEN NEW.scheduled_for IS NULL THEN 'Supplier schedule cleared' ELSE 'Supplier movement scheduled' END;
  ELSE
    RETURN NEW;
  END IF;

  INSERT INTO public.fulfillment_timeline_events(entity_type, entity_id, event_type, title, metadata, actor_id)
  VALUES ('collection', NEW.purchase_order_id, 'status', event_title,
    jsonb_build_object('purchaseOrderNumber', NEW.purchase_order_number, 'status', NEW.status, 'method', NEW.collection_method), auth.uid());
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.capture_collection_timeline() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_collection_fulfillment_timeline ON public.po_collection_state;
CREATE TRIGGER trg_collection_fulfillment_timeline
AFTER INSERT OR UPDATE OF status, collection_method, is_urgent, assigned_to, scheduled_for ON public.po_collection_state
FOR EACH ROW EXECUTE FUNCTION public.capture_collection_timeline();

CREATE OR REPLACE FUNCTION public.capture_exception_timeline()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.fulfillment_timeline_events(entity_type, entity_id, order_id, event_type, title, description, metadata, actor_id)
  VALUES ('exception', NEW.id::text, NEW.order_id, 'exception',
    CASE WHEN TG_OP = 'INSERT' THEN 'Exception raised: ' || NEW.title ELSE 'Exception updated: ' || NEW.title END,
    NEW.description,
    jsonb_build_object('severity', NEW.severity, 'status', NEW.status, 'entityType', NEW.entity_type, 'entityId', NEW.entity_id),
    auth.uid());
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.capture_exception_timeline() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.capture_order_fulfillment_timeline() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_exception_timeline ON public.operations_exceptions;
CREATE TRIGGER trg_exception_timeline
AFTER INSERT OR UPDATE OF status, severity, assigned_to, resolution ON public.operations_exceptions
FOR EACH ROW EXECUTE FUNCTION public.capture_exception_timeline();

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['dispatch_routes','operations_exceptions','fulfillment_timeline_events','operational_saved_views']
  LOOP
    EXECUTE format('ALTER TABLE public.%I REPLICA IDENTITY FULL', t);
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    END IF;
  END LOOP;
END $$;