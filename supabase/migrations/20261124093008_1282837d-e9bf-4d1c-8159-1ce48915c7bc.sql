CREATE OR REPLACE FUNCTION public.auto_route_ready_fulfillment()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE cfg public.fulfillment_settings%ROWTYPE; candidate uuid; old_ready numeric := 0; new_ready numeric := 0;
BEGIN
 IF NOT EXISTS (SELECT 1 FROM public.orders WHERE id=NEW.order_id AND completed_date IS NULL AND lower(coalesce(status,'')) NOT IN ('completed','delivered','cancelled','canceled')) THEN RETURN NEW; END IF;
 new_ready := GREATEST(0, LEAST(COALESCE(NEW.qty_invoiced,0),COALESCE(NEW.quantity,0))-LEAST(COALESCE(NEW.qty_completed,0),COALESCE(NEW.quantity,0)));
 IF TG_OP='UPDATE' THEN old_ready:=GREATEST(0,LEAST(COALESCE(OLD.qty_invoiced,0),COALESCE(OLD.quantity,0))-LEAST(COALESCE(OLD.qty_completed,0),COALESCE(OLD.quantity,0))); END IF;
 IF new_ready<=0 OR old_ready>0 THEN RETURN NEW; END IF;
 SELECT * INTO cfg FROM public.fulfillment_settings WHERE id=true;
 IF COALESCE(cfg.auto_assign_enabled,false) THEN
   SELECT p.id INTO candidate FROM public.profiles p
   JOIN public.user_roles ur ON ur.user_id=p.id
   LEFT JOIN public.orders o ON o.fulfillment_assigned_to=p.id
     AND COALESCE(o.fulfillment_status,'pending')<>'completed'
     AND o.completed_date IS NULL AND lower(coalesce(o.status,'')) NOT IN ('completed','delivered','cancelled','canceled')
   WHERE COALESCE(p.approved,false)=true AND ur.role IN ('admin'::public.app_role,'user'::public.app_role)
   GROUP BY p.id,p.full_name ORDER BY COUNT(o.id) ASC,p.full_name NULLS LAST,p.id LIMIT 1;
 END IF;
 UPDATE public.orders SET fulfillment_method='delivery',fulfillment_assigned_to=COALESCE(fulfillment_assigned_to,candidate),
   fulfillment_status=CASE WHEN fulfillment_status='ready-for-collection' THEN 'pending' ELSE COALESCE(fulfillment_status,'pending') END,
   fulfillment_routed_at=COALESCE(fulfillment_routed_at,now())
 WHERE id=NEW.order_id AND completed_date IS NULL AND lower(coalesce(status,'')) NOT IN ('completed','delivered','cancelled','canceled');
 RETURN NEW;
END; $$;
DO $$
DECLARE original text; replacement text;
BEGIN
 SELECT pg_get_functiondef('public.get_buying_sheet_live_coverage()'::regprocedure) INTO original;
 replacement:=replace(original,'WHERE o.completed_date IS NULL','WHERE o.completed_date IS NULL AND lower(coalesce(o.status,'''')) NOT IN (''completed'',''delivered'',''cancelled'',''canceled'')');
 replacement:=replace(replacement,'NOT IN (''void'',''draft'')','NOT IN (''void'',''draft'',''cancelled'',''canceled'')');
 IF replacement=original THEN RAISE EXCEPTION 'Coverage guard insertion did not match; no change applied'; END IF;
 EXECUTE replacement;
END; $$;