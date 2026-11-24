CREATE OR REPLACE FUNCTION public.complete_explicit_item_stage() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
 IF NEW.progress_stage='completed' AND (TG_OP='INSERT' OR OLD.progress_stage IS DISTINCT FROM 'completed') THEN
   NEW.qty_on_po:=greatest(coalesce(NEW.quantity,0),0);
   NEW.qty_received:=greatest(coalesce(NEW.quantity,0),0);
   NEW.qty_invoiced:=greatest(coalesce(NEW.quantity,0),0);
   NEW.qty_completed:=greatest(coalesce(NEW.quantity,0),0);
   NEW.stock_status:='in-stock';
   NEW.completed_at:=coalesce(NEW.completed_at,now());
   NEW.completed_by:=coalesce(NEW.completed_by,auth.uid());
 END IF;
 RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION public.complete_explicit_item_stage() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER complete_explicit_item_stage BEFORE INSERT OR UPDATE OF progress_stage ON public.order_items FOR EACH ROW EXECUTE FUNCTION public.complete_explicit_item_stage();
DROP TRIGGER zz_complete_order_from_item_counters ON public.order_items;
CREATE TRIGGER zz_complete_order_from_item_counters AFTER INSERT OR UPDATE OF quantity,qty_completed,progress_stage ON public.order_items FOR EACH ROW EXECUTE FUNCTION public.complete_order_from_item_counters();