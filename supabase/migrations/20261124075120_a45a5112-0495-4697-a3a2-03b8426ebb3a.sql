CREATE OR REPLACE FUNCTION public.reconcile_completed_order_items() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
 IF lower(coalesce(NEW.status,'')) IN ('delivered','completed') OR NEW.completed_date IS NOT NULL THEN
   UPDATE public.order_items SET
     qty_on_po = greatest(coalesce(quantity,0),0),
     qty_received = greatest(coalesce(quantity,0),0),
     qty_invoiced = greatest(coalesce(quantity,0),0),
     qty_completed = greatest(coalesce(quantity,0),0),
     progress_stage = 'completed', stock_status = 'in-stock',
     completed_at = coalesce(completed_at, NEW.completed_date, now())
   WHERE order_id = NEW.id AND (progress_stage IS DISTINCT FROM 'completed' OR qty_completed IS DISTINCT FROM greatest(coalesce(quantity,0),0) OR qty_on_po IS DISTINCT FROM greatest(coalesce(quantity,0),0) OR qty_received IS DISTINCT FROM greatest(coalesce(quantity,0),0) OR qty_invoiced IS DISTINCT FROM greatest(coalesce(quantity,0),0) OR completed_at IS NULL);
 END IF;
 RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION public.reconcile_completed_order_items() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER reconcile_completed_order_items AFTER INSERT OR UPDATE OF status, completed_date ON public.orders FOR EACH ROW EXECUTE FUNCTION public.reconcile_completed_order_items();
CREATE OR REPLACE FUNCTION public.complete_order_from_item_counters() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE parent public.orders%ROWTYPE; finished_at timestamptz;
BEGIN
 SELECT * INTO parent FROM public.orders WHERE id=NEW.order_id FOR UPDATE;
 IF NOT FOUND OR parent.completed_date IS NOT NULL OR lower(coalesce(parent.status,'')) IN ('delivered','completed','cancelled','canceled') THEN RETURN NEW; END IF;
 IF EXISTS (SELECT 1 FROM public.order_items WHERE order_id=NEW.order_id AND quantity>0)
 AND NOT EXISTS (SELECT 1 FROM public.order_items WHERE order_id=NEW.order_id AND quantity>0 AND coalesce(qty_completed,0)<quantity) THEN
   SELECT max(completed_at) INTO finished_at FROM public.order_items WHERE order_id=NEW.order_id;
   UPDATE public.orders SET status='delivered', completed_date=coalesce(finished_at,now()) WHERE id=NEW.order_id;
 END IF;
 RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION public.complete_order_from_item_counters() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER zz_complete_order_from_item_counters AFTER INSERT OR UPDATE OF quantity,qty_completed ON public.order_items FOR EACH ROW EXECUTE FUNCTION public.complete_order_from_item_counters();
-- Preserve historic order dates while correcting only contradictory item records.
UPDATE public.order_items i SET qty_on_po=greatest(coalesce(i.quantity,0),0), qty_received=greatest(coalesce(i.quantity,0),0), qty_invoiced=greatest(coalesce(i.quantity,0),0), qty_completed=greatest(coalesce(i.quantity,0),0), progress_stage='completed',stock_status='in-stock',completed_at=coalesce(i.completed_at,o.completed_date,o.updated_at,o.created_at)
FROM public.orders o WHERE i.order_id=o.id AND (lower(coalesce(o.status,'')) IN ('delivered','completed') OR o.completed_date IS NOT NULL)
AND (i.progress_stage IS DISTINCT FROM 'completed' OR i.qty_completed IS DISTINCT FROM greatest(coalesce(i.quantity,0),0) OR i.qty_on_po IS DISTINCT FROM greatest(coalesce(i.quantity,0),0) OR i.qty_received IS DISTINCT FROM greatest(coalesce(i.quantity,0),0) OR i.qty_invoiced IS DISTINCT FROM greatest(coalesce(i.quantity,0),0) OR i.completed_at IS NULL);
-- Only genuinely fully completed active orders qualify for automatic History.
UPDATE public.orders o SET status='delivered',completed_date=coalesce((SELECT max(i.completed_at) FROM public.order_items i WHERE i.order_id=o.id),now())
WHERE o.completed_date IS NULL AND lower(coalesce(o.status,'')) NOT IN ('delivered','completed','cancelled','canceled')
AND EXISTS(SELECT 1 FROM public.order_items i WHERE i.order_id=o.id AND i.quantity>0)
AND NOT EXISTS(SELECT 1 FROM public.order_items i WHERE i.order_id=o.id AND i.quantity>0 AND coalesce(i.qty_completed,0)<i.quantity);