-- User-relevant operational notifications: route movement and overdue assigned
-- fulfillment. The overdue generator is idempotent for 24 hours per entity.

CREATE OR REPLACE FUNCTION public.notify_dispatch_route_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.driver_id IS DISTINCT FROM NEW.driver_id THEN
    IF OLD.driver_id IS NOT NULL THEN
      INSERT INTO public.notifications (user_id, type, title, message, metadata)
      VALUES (OLD.driver_id, 'fulfillment_unassigned', 'Route assignment removed',
        'You are no longer assigned to ' || NEW.name || '.',
        jsonb_build_object('kind','route','entity_type','route','entity_id',NEW.id));
    END IF;
    IF NEW.driver_id IS NOT NULL THEN
      INSERT INTO public.notifications (user_id, type, title, message, metadata)
      VALUES (NEW.driver_id, 'fulfillment_assigned', 'Route assigned to you',
        NEW.name || ' is scheduled for ' || to_char(NEW.route_date, 'DD Mon YYYY') || '.',
        jsonb_build_object('kind','route','entity_type','route','entity_id',NEW.id));
    END IF;
  ELSIF NEW.driver_id IS NOT NULL AND (
    OLD.route_date IS DISTINCT FROM NEW.route_date OR
    OLD.status IS DISTINCT FROM NEW.status OR
    OLD.stops IS DISTINCT FROM NEW.stops
  ) THEN
    INSERT INTO public.notifications (user_id, type, title, message, metadata)
    VALUES (NEW.driver_id, 'route_changed', 'Your route changed',
      NEW.name || ' was updated. Open Dispatch to review the latest stops and status.',
      jsonb_build_object('kind','route','entity_type','route','entity_id',NEW.id));
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_dispatch_route_change ON public.dispatch_routes;
CREATE TRIGGER trg_notify_dispatch_route_change
AFTER UPDATE OF driver_id, route_date, status, stops ON public.dispatch_routes
FOR EACH ROW EXECUTE FUNCTION public.notify_dispatch_route_change();

CREATE OR REPLACE FUNCTION public.generate_my_overdue_fulfillment_notifications()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target uuid := auth.uid();
  inserted_count integer := 0;
  row_count_value integer := 0;
BEGIN
  IF target IS NULL THEN RETURN 0; END IF;

  INSERT INTO public.notifications (user_id, type, title, message, order_id, order_number, metadata)
  SELECT target, 'overdue_fulfillment', 'Delivery overdue',
    'Delivery ' || o.order_number || ' is overdue and still assigned to you.',
    o.id, o.order_number,
    jsonb_build_object('kind','delivery','entity_type','delivery','entity_id',o.id)
  FROM public.orders o
  WHERE o.fulfillment_assigned_to = target
    AND o.fulfillment_scheduled_for < now()
    AND o.completed_date IS NULL
    AND COALESCE(o.fulfillment_status, 'pending') <> 'completed'
    AND NOT EXISTS (
      SELECT 1 FROM public.notifications n
      WHERE n.user_id = target AND n.type = 'overdue_fulfillment'
        AND n.order_id = o.id AND n.created_at > now() - interval '24 hours'
    );
  GET DIAGNOSTICS row_count_value = ROW_COUNT;
  inserted_count := inserted_count + row_count_value;

  INSERT INTO public.notifications (user_id, type, title, message, order_number, metadata)
  SELECT target, 'overdue_fulfillment', 'Collection overdue',
    'Supplier collection ' || pcs.purchase_order_number || ' is overdue and still assigned to you.',
    pcs.purchase_order_number,
    jsonb_build_object('kind','collection','entity_type','collection','entity_id',pcs.purchase_order_id,'purchase_order_id',pcs.purchase_order_id)
  FROM public.po_collection_state pcs
  WHERE pcs.assigned_to = target
    AND pcs.scheduled_for < now()
    AND pcs.completed_at IS NULL
    AND COALESCE(pcs.status, 'pending') <> 'collected'
    AND NOT EXISTS (
      SELECT 1 FROM public.notifications n
      WHERE n.user_id = target AND n.type = 'overdue_fulfillment'
        AND n.metadata->>'purchase_order_id' = pcs.purchase_order_id
        AND n.created_at > now() - interval '24 hours'
    );
  GET DIAGNOSTICS row_count_value = ROW_COUNT;
  RETURN inserted_count + row_count_value;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.notify_dispatch_route_change() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.generate_my_overdue_fulfillment_notifications() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.generate_my_overdue_fulfillment_notifications() TO authenticated;
GRANT EXECUTE ON FUNCTION public.notify_dispatch_route_change() TO service_role;
