CREATE OR REPLACE FUNCTION public.reconcile_completed_order_items()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
 IF TG_OP = 'UPDATE' THEN
   IF OLD.completed_date IS NOT NULL OR lower(coalesce(OLD.status,'')) IN ('delivered','completed','cancelled','canceled') THEN RETURN NEW; END IF;
 END IF;
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
DO $$
DECLARE original text; replacement text;
BEGIN
 SELECT pg_get_functiondef('public.complete_fulfillment_delivery(uuid)'::regprocedure) INTO original;
 replacement := replace(original,
 'IF NOT FOUND THEN RAISE EXCEPTION ''Order not found''; END IF;',
 'IF NOT FOUND THEN RAISE EXCEPTION ''Order not found''; END IF;
   IF target_order.completed_date IS NOT NULL OR lower(coalesce(target_order.status, '''')) IN (''completed'',''delivered'',''cancelled'',''canceled'') THEN RAISE EXCEPTION ''Order already closed; refresh''; END IF;');
 IF replacement = original THEN RAISE EXCEPTION 'Delivery guard insertion did not match; no change applied'; END IF;
 EXECUTE replacement;
END; $$;