-- Notify fulfillment users when work is assigned, reassigned, or removed.
-- Covers both customer deliveries (orders) and supplier collections (PO state).

CREATE OR REPLACE FUNCTION public.notify_fulfillment_assignment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.fulfillment_assigned_to IS NOT DISTINCT FROM OLD.fulfillment_assigned_to THEN
    RETURN NEW;
  END IF;

  -- Tell the previous assignee when their delivery is removed/reassigned.
  IF OLD.fulfillment_assigned_to IS NOT NULL THEN
    INSERT INTO public.notifications (user_id, type, title, message, order_id, order_number, metadata)
    VALUES (
      OLD.fulfillment_assigned_to,
      'fulfillment_unassigned',
      'Delivery unassigned',
      'Delivery ' || COALESCE(NEW.order_number, '') || ' is no longer assigned to you.',
      NEW.id,
      NEW.order_number,
      jsonb_build_object('kind','delivery','previous_assignee',OLD.fulfillment_assigned_to,'new_assignee',NEW.fulfillment_assigned_to)
    );
  END IF;

  -- Tell the new assignee when a delivery is assigned/reassigned to them.
  IF NEW.fulfillment_assigned_to IS NOT NULL THEN
    INSERT INTO public.notifications (user_id, type, title, message, order_id, order_number, metadata)
    VALUES (
      NEW.fulfillment_assigned_to,
      'fulfillment_assigned',
      'Delivery assigned to you',
      'You were assigned delivery ' || COALESCE(NEW.order_number, '') || '.',
      NEW.id,
      NEW.order_number,
      jsonb_build_object('kind','delivery','previous_assignee',OLD.fulfillment_assigned_to,'new_assignee',NEW.fulfillment_assigned_to)
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_fulfillment_assignment ON public.orders;
CREATE TRIGGER trg_notify_fulfillment_assignment
AFTER UPDATE OF fulfillment_assigned_to ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.notify_fulfillment_assignment();

CREATE OR REPLACE FUNCTION public.notify_po_collection_assignment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  old_assignee uuid := CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE OLD.assigned_to END;
BEGIN
  IF NEW.assigned_to IS NOT DISTINCT FROM old_assignee THEN
    RETURN NEW;
  END IF;

  IF old_assignee IS NOT NULL THEN
    INSERT INTO public.notifications (user_id, type, title, message, order_number, metadata)
    VALUES (
      old_assignee,
      'fulfillment_unassigned',
      'Collection unassigned',
      'Supplier collection ' || COALESCE(NEW.purchase_order_number, '') || ' is no longer assigned to you.',
      NEW.purchase_order_number,
      jsonb_build_object('kind','collection','purchase_order_id',NEW.purchase_order_id,'previous_assignee',old_assignee,'new_assignee',NEW.assigned_to)
    );
  END IF;

  IF NEW.assigned_to IS NOT NULL THEN
    INSERT INTO public.notifications (user_id, type, title, message, order_number, metadata)
    VALUES (
      NEW.assigned_to,
      'fulfillment_assigned',
      'Collection assigned to you',
      'You were assigned supplier collection ' || COALESCE(NEW.purchase_order_number, '') || '.',
      NEW.purchase_order_number,
      jsonb_build_object('kind','collection','purchase_order_id',NEW.purchase_order_id,'previous_assignee',old_assignee,'new_assignee',NEW.assigned_to)
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_po_collection_assignment ON public.po_collection_state;
CREATE TRIGGER trg_notify_po_collection_assignment
AFTER INSERT OR UPDATE OF assigned_to ON public.po_collection_state
FOR EACH ROW EXECUTE FUNCTION public.notify_po_collection_assignment();
