-- Additive migration. Apply before deploying the matching UI.
BEGIN;

CREATE OR REPLACE FUNCTION public.workflow_po_signature(po jsonb) RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path = public AS $$
 SELECT jsonb_build_object('status',po->>'status','receivedStatus',po->>'receivedStatus',
   'date',po->>'date','expectedDeliveryDate',po->>'expectedDeliveryDate','vendorId',po->>'vendorId',
   'lines',COALESCE((SELECT jsonb_agg(v ORDER BY v::text) FROM (
     SELECT jsonb_build_object('sku',l->>'sku','name',l->>'name','description',l->>'description',
       'quantity',l->'quantity','quantityReceived',l->'quantityReceived') v
     FROM jsonb_array_elements(CASE WHEN jsonb_typeof(po->'lines')='array' THEN po->'lines' ELSE '[]'::jsonb END) l
   ) lines),'[]'::jsonb));
$$;

CREATE TABLE public.collection_dismissals (
 purchase_order_id text PRIMARY KEY,
 purchase_order_number text NOT NULL,
 dismissed_at timestamptz NOT NULL DEFAULT now(),
 dismissed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
 active boolean NOT NULL DEFAULT true,
 dismissed_signature jsonb,
 current_signature jsonb,
 review_required boolean NOT NULL DEFAULT false,
 reviewed_at timestamptz,
 reviewed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL
);
ALTER TABLE public.collection_dismissals ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.collection_dismissals TO authenticated;
GRANT ALL ON public.collection_dismissals TO service_role;
CREATE POLICY "Approved staff can read dismissals" ON public.collection_dismissals FOR SELECT TO authenticated
 USING (EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND approved));

INSERT INTO public.collection_dismissals(purchase_order_id,purchase_order_number,dismissed_at,dismissed_by,dismissed_signature,current_signature)
SELECT s.purchase_order_id,s.purchase_order_number,s.dismissed_at,s.dismissed_by,public.workflow_po_signature(p.po),public.workflow_po_signature(p.po)
FROM public.po_collection_state s LEFT JOIN LATERAL (
 SELECT po FROM public.po_tracking_cache c CROSS JOIN LATERAL jsonb_array_elements(COALESCE(c.payload,'[]'::jsonb)) po
 WHERE c.id='00000000-0000-0000-0000-000000000003' AND po->>'purchaseOrderId'=s.purchase_order_id LIMIT 1
) p ON true WHERE s.dismissed_at IS NOT NULL;

-- Separate tombstones survive state-row deletion and protect against legacy clients.
CREATE OR REPLACE FUNCTION public.protect_collection_dismissal() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE target text; label text; snapshot jsonb; tomb public.collection_dismissals%ROWTYPE;
BEGIN
 target:=CASE WHEN TG_OP='DELETE' THEN OLD.purchase_order_id ELSE NEW.purchase_order_id END;
 label:=CASE WHEN TG_OP='DELETE' THEN OLD.purchase_order_number ELSE NEW.purchase_order_number END;
 IF TG_OP='DELETE' OR (NEW.dismissed_at IS NOT NULL AND (TG_OP='INSERT' OR OLD.dismissed_at IS NULL)) THEN
   SELECT public.workflow_po_signature(po) INTO snapshot FROM public.po_tracking_cache c
   CROSS JOIN LATERAL jsonb_array_elements(COALESCE(c.payload,'[]'::jsonb)) po
   WHERE c.id='00000000-0000-0000-0000-000000000003' AND po->>'purchaseOrderId'=target LIMIT 1;
   INSERT INTO public.collection_dismissals(purchase_order_id,purchase_order_number,dismissed_by,dismissed_signature,current_signature)
   VALUES(target,label,auth.uid(),snapshot,snapshot)
   ON CONFLICT(purchase_order_id) DO UPDATE SET active=true;
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 SELECT * INTO tomb FROM public.collection_dismissals WHERE purchase_order_id=target;
 IF tomb.active THEN NEW.dismissed_at:=tomb.dismissed_at; NEW.dismissed_by:=tomb.dismissed_by; END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER protect_collection_dismissal BEFORE INSERT OR UPDATE OR DELETE ON public.po_collection_state
 FOR EACH ROW EXECUTE FUNCTION public.protect_collection_dismissal();

CREATE OR REPLACE FUNCTION public.review_dismissed_po_changes() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NEW.id <> '00000000-0000-0000-0000-000000000003' OR jsonb_typeof(NEW.payload)<>'array' THEN RETURN NEW; END IF;
 UPDATE public.collection_dismissals d SET current_signature=public.workflow_po_signature(po),
   review_required=d.dismissed_signature IS DISTINCT FROM public.workflow_po_signature(po)
 FROM jsonb_array_elements(NEW.payload) po
 WHERE d.active AND d.purchase_order_id=po->>'purchaseOrderId'
   AND d.current_signature IS DISTINCT FROM public.workflow_po_signature(po);
 RETURN NEW;
END; $$;
CREATE TRIGGER review_dismissed_po_changes AFTER INSERT OR UPDATE OF payload ON public.po_tracking_cache
 FOR EACH ROW EXECUTE FUNCTION public.review_dismissed_po_changes();

CREATE OR REPLACE FUNCTION public.review_collection_dismissal(p_id text,p_action text,p_signature jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE tomb public.collection_dismissals%ROWTYPE;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND approved) THEN RAISE EXCEPTION 'Approved account required'; END IF;
 IF p_action NOT IN ('restore','keep') THEN RAISE EXCEPTION 'Invalid review action'; END IF;
 SELECT * INTO tomb FROM public.collection_dismissals WHERE purchase_order_id=p_id FOR UPDATE;
 IF NOT FOUND OR NOT tomb.active THEN RAISE EXCEPTION 'Dismissal is no longer active'; END IF;
 IF tomb.current_signature IS DISTINCT FROM p_signature THEN RAISE EXCEPTION 'PO changed again; refresh before reviewing'; END IF;
 UPDATE public.collection_dismissals SET active=p_action<>'restore',review_required=false,
   dismissed_signature=current_signature,reviewed_at=now(),reviewed_by=auth.uid() WHERE purchase_order_id=p_id;
 IF p_action='restore' THEN
   INSERT INTO public.po_collection_state(purchase_order_id,purchase_order_number)
   VALUES(p_id,tomb.purchase_order_number) ON CONFLICT(purchase_order_id) DO NOTHING;
   UPDATE public.po_collection_state SET dismissed_at=NULL,dismissed_by=NULL,updated_at=clock_timestamp() WHERE purchase_order_id=p_id;
 END IF;
END; $$;

-- Whitelisted, RLS-respecting compare-and-swap for editable workflow records.
CREATE OR REPLACE FUNCTION public.workflow_edit_timestamp() RETURNS trigger
LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
 IF (to_jsonb(NEW)-'updated_at'-'last_seen_at') IS DISTINCT FROM (to_jsonb(OLD)-'updated_at'-'last_seen_at')
 THEN NEW.updated_at:=GREATEST(clock_timestamp(),OLD.updated_at+interval '1 microsecond');
 ELSE NEW.updated_at:=OLD.updated_at; END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER zzzz_workflow_revision BEFORE UPDATE ON public.orders FOR EACH ROW EXECUTE FUNCTION public.workflow_edit_timestamp();
CREATE TRIGGER zzzz_workflow_revision BEFORE UPDATE ON public.sharpening_jobs FOR EACH ROW EXECUTE FUNCTION public.workflow_edit_timestamp();
CREATE TRIGGER zzzz_workflow_revision BEFORE UPDATE ON public.repair_tickets FOR EACH ROW EXECUTE FUNCTION public.workflow_edit_timestamp();
CREATE TRIGGER zzzz_workflow_revision BEFORE UPDATE ON public.po_collection_state FOR EACH ROW EXECUTE FUNCTION public.workflow_edit_timestamp();
CREATE OR REPLACE FUNCTION public.save_workflow_record(p_table text,p_id text,p_patch jsonb,p_expected_updated_at timestamptz)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE current_row jsonb; saved_row jsonb; allowed text[]; key_column text; columns_sql text;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND approved) THEN RAISE EXCEPTION 'Approved account required'; END IF;
 CASE p_table
 WHEN 'sharpening_jobs' THEN allowed:=ARRAY['date_received','job_number','customer_name','quantity','priority','order_number','assigned_to','status','deadline_date','invoiced','invoice_number','third_party_name','third_party_quantity','third_party_reference','third_party_status','notes'];
 WHEN 'repair_tickets' THEN allowed:=ARRAY['ticket_number','client','tool_code','tool_information','date_received_by_client','supplier_information','customer_information','assigned_to','priority','status','deadline_date','date_received_back_from_supplier','warranty_months','invoiced','invoice_number','notes','scrap_reason','scrapped_by'];
 WHEN 'orders' THEN allowed:=ARRAY['fulfillment_method','fulfillment_status','fulfillment_assigned_to','fulfillment_scheduled_for','fulfillment_notes','urgency'];
 WHEN 'po_collection_state' THEN allowed:=ARRAY['assigned_to','status','collection_method','is_urgent','scheduled_for','notes'];
 ELSE RAISE EXCEPTION 'Unsupported record type';
 END CASE;
 IF jsonb_typeof(p_patch)<>'object' OR p_patch='{}'::jsonb OR EXISTS(SELECT 1 FROM jsonb_object_keys(p_patch) k WHERE NOT(k=ANY(allowed))) THEN RAISE EXCEPTION 'Unsupported fields'; END IF;
 key_column:=CASE WHEN p_table='po_collection_state' THEN 'purchase_order_id' ELSE 'id' END;
 EXECUTE format('SELECT to_jsonb(t) FROM public.%I t WHERE %I::text=$1 FOR UPDATE',p_table,key_column) INTO current_row USING p_id;
 IF current_row IS NULL THEN RETURN jsonb_build_object('saved',false); END IF;
 IF p_expected_updated_at IS NULL OR (current_row->>'updated_at')::timestamptz IS DISTINCT FROM p_expected_updated_at THEN
   RETURN jsonb_build_object('conflict',true,'current',current_row);
 END IF;
 SELECT string_agg(format('%I = r.%I',k,k),',') INTO columns_sql FROM jsonb_object_keys(p_patch) k;
 EXECUTE format('UPDATE public.%I t SET %s, updated_at=clock_timestamp() FROM jsonb_populate_record(NULL::public.%I,$1) r WHERE t.%I::text=$2 RETURNING to_jsonb(t)',p_table,columns_sql,p_table,key_column)
 INTO saved_row USING p_patch,p_id;
 RETURN jsonb_build_object('saved',saved_row IS NOT NULL,'current',saved_row);
END; $$;

-- Idempotent delivery receipts: one request cannot be applied twice after a timeout.
CREATE TABLE public.dispatch_receipts (
 id uuid PRIMARY KEY,
 order_id uuid NOT NULL REFERENCES public.orders(id),
 actor_id uuid NOT NULL REFERENCES public.profiles(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 lines jsonb NOT NULL,
 notes text,
 fully_done boolean NOT NULL
);
ALTER TABLE public.dispatch_receipts ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.dispatch_receipts TO authenticated;
GRANT ALL ON public.dispatch_receipts TO service_role;
CREATE POLICY "Approved staff can read handovers" ON public.dispatch_receipts FOR SELECT TO authenticated
 USING(EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND approved));

CREATE OR REPLACE FUNCTION public.record_partial_delivery(p_request_id uuid,p_order_id uuid,p_lines jsonb,p_notes text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE o public.orders%ROWTYPE; item public.order_items%ROWTYPE; line jsonb; receipt public.dispatch_receipts%ROWTYPE;
 qty numeric; remaining numeric; done boolean; verified jsonb:='[]'::jsonb; units numeric:=0;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND approved) THEN RAISE EXCEPTION 'Approved account required'; END IF;
 IF p_request_id IS NULL THEN RAISE EXCEPTION 'Request ID required'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_request_id::text,0));
 SELECT * INTO receipt FROM public.dispatch_receipts WHERE id=p_request_id;
 IF FOUND THEN
   IF receipt.actor_id<>auth.uid() OR receipt.order_id<>p_order_id THEN RAISE EXCEPTION 'Request ID already used'; END IF;
   IF (SELECT jsonb_agg(jsonb_build_object('item_id',l->>'item_id','quantity',(l->>'quantity')::numeric) ORDER BY l->>'item_id') FROM jsonb_array_elements(receipt.lines) l)
     IS DISTINCT FROM (SELECT jsonb_agg(jsonb_build_object('item_id',l->>'item_id','quantity',(l->>'quantity')::numeric) ORDER BY l->>'item_id') FROM jsonb_array_elements(p_lines) l)
     OR receipt.notes IS DISTINCT FROM NULLIF(trim(p_notes),'') THEN RAISE EXCEPTION 'Receipt already saved with different details; review history'; END IF;
   RETURN jsonb_build_object('receipt_id',receipt.id,'fully_done',receipt.fully_done,'replayed',true);
 END IF;
 SELECT * INTO o FROM public.orders WHERE id=p_order_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Order unavailable'; END IF;
 IF o.completed_date IS NOT NULL OR lower(COALESCE(o.status,'')) IN ('completed','delivered','cancelled','canceled') THEN RAISE EXCEPTION 'Order already closed; refresh'; END IF;
 IF jsonb_typeof(p_lines) IS DISTINCT FROM 'array' OR jsonb_array_length(p_lines)=0 THEN RAISE EXCEPTION 'Choose quantities to hand over'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_lines) l GROUP BY l->>'item_id' HAVING count(*)>1) THEN RAISE EXCEPTION 'Duplicate item'; END IF;
 -- Lock all lines in a stable order before validation and changes.
 PERFORM 1 FROM public.order_items WHERE order_id=p_order_id ORDER BY id FOR UPDATE;
 FOR line IN SELECT * FROM jsonb_array_elements(p_lines) LOOP
   qty:=(line->>'quantity')::numeric;
   SELECT * INTO item FROM public.order_items WHERE id=(line->>'item_id')::uuid AND order_id=p_order_id;
   IF NOT FOUND THEN RAISE EXCEPTION 'Item does not belong to this order'; END IF;
   remaining:=GREATEST(0,LEAST(COALESCE(item.qty_invoiced,0),item.quantity)-COALESCE(item.qty_completed,0));
   IF qty IS NULL OR qty<=0 OR qty<>trunc(qty) OR qty>remaining THEN RAISE EXCEPTION 'Quantity changed or is invalid; refresh and review this handover'; END IF;
   IF (line->>'expected_completed')::numeric IS DISTINCT FROM COALESCE(item.qty_completed,0)
     OR (line->>'expected_ready')::numeric IS DISTINCT FROM remaining THEN RAISE EXCEPTION 'Another user changed these quantities; refresh and review'; END IF;
   verified:=verified||jsonb_build_array(jsonb_build_object('item_id',item.id,'name',COALESCE(NULLIF(item.description,''),item.name),'code',item.code,'quantity',qty));
   UPDATE public.order_items SET qty_completed=COALESCE(qty_completed,0)+qty,updated_at=clock_timestamp() WHERE id=item.id;
   units:=units+qty;
 END LOOP;
 SELECT NOT EXISTS(SELECT 1 FROM public.order_items WHERE order_id=p_order_id AND COALESCE(qty_completed,0)<quantity) INTO done;
 UPDATE public.orders SET fulfillment_status=CASE WHEN done THEN 'completed' ELSE 'pending' END,
   status=CASE WHEN done THEN 'delivered' ELSE status END,
   completed_date=CASE WHEN done THEN now() ELSE completed_date END,
   updated_at=clock_timestamp() WHERE id=p_order_id;
 INSERT INTO public.dispatch_receipts(id,order_id,actor_id,lines,notes,fully_done) VALUES(p_request_id,p_order_id,auth.uid(),verified,NULLIF(trim(p_notes),''),done);
 INSERT INTO public.order_activity_log(order_id,user_id,activity_type,title,description,metadata)
 VALUES(p_order_id,auth.uid(),'fulfillment_delivery',CASE WHEN done THEN 'Delivery completed' ELSE 'Partial handover' END,
   units||' units handed over. '||CASE WHEN done THEN 'Order complete.' ELSE 'Remaining quantities stay outstanding.' END,
   jsonb_build_object('receipt_id',p_request_id,'lines',verified));
 INSERT INTO public.fulfillment_timeline_events(entity_type,entity_id,event_type,title,description,actor_id)
 VALUES('delivery',p_order_id::text,'partial_handover','Customer handover',units||' units handed over; receipt '||p_request_id,auth.uid());
 RETURN jsonb_build_object('receipt_id',p_request_id,'fully_done',done,'units',units);
END; $$;

CREATE TABLE public.collection_receipt_requests (
 id uuid PRIMARY KEY, actor_id uuid NOT NULL REFERENCES public.profiles(id),
 purchase_order_id text NOT NULL, payload jsonb NOT NULL, result jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.collection_receipt_requests ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.collection_receipt_requests TO authenticated;
CREATE POLICY "Own collection requests" ON public.collection_receipt_requests FOR SELECT TO authenticated USING(actor_id=auth.uid());

CREATE OR REPLACE FUNCTION public.record_po_collection_safe(p_request_id uuid,p_payload jsonb,p_expected_event_ids jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE cache_payload jsonb; po jsonb; line jsonb; existing public.collection_receipt_requests%ROWTYPE; result jsonb;
 actual_ids jsonb; remaining numeric; received numeric; source numeric; physical numeric; picked numeric:=0; all_remaining numeric:=0; qty numeric; key text; source_line record; matched integer:=0; safe_lines jsonb:='[]'::jsonb;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND approved) THEN RAISE EXCEPTION 'Approved account required'; END IF;
 IF p_request_id IS NULL THEN RAISE EXCEPTION 'Request ID required'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_request_id::text,0));
 SELECT * INTO existing FROM public.collection_receipt_requests WHERE id=p_request_id;
 IF FOUND THEN
   IF existing.actor_id<>auth.uid() OR existing.purchase_order_id<>p_payload->>'p_purchase_order_id'
     OR existing.payload->'p_lines' IS DISTINCT FROM p_payload->'p_lines' OR existing.payload->'p_notes' IS DISTINCT FROM p_payload->'p_notes'
   THEN RAISE EXCEPTION 'Request already used with different quantities; refresh and review'; END IF;
   RETURN existing.result;
 END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('collection:'||(p_payload->>'p_purchase_order_id'),0));
 SELECT payload INTO cache_payload FROM public.po_tracking_cache WHERE id='00000000-0000-0000-0000-000000000003' FOR SHARE;
 SELECT p INTO po FROM jsonb_array_elements(cache_payload) p WHERE p->>'purchaseOrderId'=p_payload->>'p_purchase_order_id';
 IF po IS NULL THEN RAISE EXCEPTION 'PO is no longer in the current snapshot'; END IF;
 IF EXISTS(SELECT 1 FROM public.collection_dismissals WHERE purchase_order_id=po->>'purchaseOrderId' AND active)
   OR EXISTS(SELECT 1 FROM public.po_collection_state WHERE purchase_order_id=po->>'purchaseOrderId' AND (completed_at IS NOT NULL OR status='collected'))
   OR lower(COALESCE(po->>'status','')) IN ('closed','void','cancelled','draft','rejected')
 THEN RAISE EXCEPTION 'Collection is closed or dismissed; refresh'; END IF;
 SELECT COALESCE(jsonb_agg(id::text ORDER BY id::text),'[]'::jsonb) INTO actual_ids FROM public.po_collection_events WHERE purchase_order_id=po->>'purchaseOrderId';
 IF actual_ids IS DISTINCT FROM p_expected_event_ids THEN RAISE EXCEPTION 'Another collection was recorded; refresh and review the remaining quantities'; END IF;
 IF jsonb_typeof(p_payload->'p_lines') IS DISTINCT FROM 'array' OR jsonb_array_length(p_payload->'p_lines')=0 THEN RAISE EXCEPTION 'Choose quantities'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_payload->'p_lines') l GROUP BY l->>'line_key' HAVING count(*)>1) THEN RAISE EXCEPTION 'Duplicate collection line'; END IF;
 FOR source_line IN
   SELECT CASE WHEN trim(COALESCE(l->>'sku',''))<>'' THEN 'sku:'||lower(trim(l->>'sku'))||'|item:'||lower(trim(COALESCE(NULLIF(trim(l->>'description'),''),l->>'name','')))
     ELSE 'nm:'||lower(trim(COALESCE(l->>'name','')))||'|'||lower(trim(COALESCE(l->>'description',''))) END line_key,
     sum(GREATEST(0,(l->>'quantity')::numeric-COALESCE((l->>'quantityReceived')::numeric,0))) outstanding,
     jsonb_agg(l)->0 source_details
   FROM jsonb_array_elements(po->'lines') l GROUP BY 1
 LOOP
   SELECT COALESCE(sum(l.quantity_collected),0),COALESCE(max(l.source_unbilled_quantity),0) INTO received,source
   FROM public.po_collection_event_lines l JOIN public.po_collection_events e ON e.id=l.event_id
   WHERE e.purchase_order_id=po->>'purchaseOrderId' AND l.line_key=source_line.line_key;
   physical:=source_line.outstanding;
   remaining:=LEAST(physical,GREATEST(0,GREATEST(physical,source)-received));
   all_remaining:=all_remaining+remaining;
   FOR line IN SELECT l FROM jsonb_array_elements(p_payload->'p_lines') l WHERE l->>'line_key'=source_line.line_key LOOP
     qty:=(line->>'quantity_collected')::numeric;
     IF qty IS NULL OR qty<=0 OR qty>remaining OR qty<>trunc(qty) THEN RAISE EXCEPTION 'Invalid or stale collection quantity; refresh'; END IF;
     picked:=picked+qty;
     matched:=matched+1;
     safe_lines:=safe_lines||jsonb_build_array(jsonb_build_object(
       'line_key',source_line.line_key,'quantity_collected',qty,'source_unbilled_quantity',GREATEST(physical,source),
       'sku',source_line.source_details->>'sku','name',source_line.source_details->>'name','description',source_line.source_details->>'description'));
   END LOOP;
 END LOOP;
 IF picked<=0 OR matched<>jsonb_array_length(p_payload->'p_lines')
 THEN RAISE EXCEPTION 'Unknown collection line'; END IF;
 result:=public.record_po_collection(po->>'purchaseOrderId',po->>'purchaseOrderNumber',po->>'vendorId',po->>'vendorName',
   safe_lines,picked>=all_remaining,p_payload->>'p_notes',po,COALESCE(p_payload->>'p_collection_method','pickup'));
 INSERT INTO public.collection_receipt_requests(id,actor_id,purchase_order_id,payload,result) VALUES(p_request_id,auth.uid(),po->>'purchaseOrderId',p_payload,result);
 RETURN result;
END; $$;
-- Old clients must update; the unchecked command is now callable only by the safe wrapper/owner.
REVOKE EXECUTE ON FUNCTION public.record_po_collection(text,text,text,text,jsonb,boolean,text,jsonb,text) FROM authenticated;

CREATE OR REPLACE FUNCTION public.save_workflow_batch(p_changes jsonb) RETURNS void
LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE change jsonb; result jsonb;
BEGIN
 IF jsonb_typeof(p_changes)<>'array' THEN RAISE EXCEPTION 'Invalid batch'; END IF;
 FOR change IN SELECT c FROM jsonb_array_elements(p_changes) c ORDER BY c->>'table',c->>'id' LOOP
   result:=public.save_workflow_record(change->>'table',change->>'id',change->'patch',(change->>'updated_at')::timestamptz);
   IF NOT COALESCE((result->>'saved')::boolean,false) THEN RAISE EXCEPTION 'Record % changed. No batch changes saved; refresh and review.',change->>'id'; END IF;
 END LOOP;
END; $$;
CREATE OR REPLACE FUNCTION public.create_dispatch_route_safe(p_route jsonb,p_changes jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE route_id uuid;
BEGIN
 PERFORM public.save_workflow_batch(p_changes);
 INSERT INTO public.dispatch_routes(name,route_date,status,driver_id,total_stops,completed_stops,map_url,stops,notes,created_by)
 VALUES(p_route->>'name',(p_route->>'route_date')::date,'ready',(p_route->>'driver_id')::uuid,
 jsonb_array_length(p_route->'stops'),0,p_route->>'map_url',p_route->'stops',p_route->>'notes',auth.uid()) RETURNING id INTO route_id;
 RETURN route_id;
END; $$;
REVOKE ALL ON FUNCTION public.record_po_collection_safe(uuid,jsonb,jsonb),public.save_workflow_batch(jsonb),public.create_dispatch_route_safe(jsonb,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_po_collection_safe(uuid,jsonb,jsonb),public.save_workflow_batch(jsonb),public.create_dispatch_route_safe(jsonb,jsonb) TO authenticated;
CREATE TABLE public.order_draft_requests (
 id uuid PRIMARY KEY,actor_id uuid NOT NULL REFERENCES public.profiles(id),order_id uuid NOT NULL REFERENCES public.orders(id),
 payload jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.order_draft_requests ENABLE ROW LEVEL SECURITY;
CREATE OR REPLACE FUNCTION public.create_order_draft_safe(p_request_id uuid,p_order jsonb,p_items jsonb,p_purchase_orders jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE existing public.order_draft_requests%ROWTYPE; line jsonb; po jsonb; order_id_value uuid;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND approved) THEN RAISE EXCEPTION 'Approved account required'; END IF;
 IF p_request_id IS NULL THEN RAISE EXCEPTION 'Draft ID required'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_request_id::text,0));
 SELECT * INTO existing FROM public.order_draft_requests WHERE id=p_request_id;
 IF FOUND THEN
   IF existing.actor_id<>auth.uid() THEN RAISE EXCEPTION 'Draft belongs to another user'; END IF;
   IF existing.payload IS DISTINCT FROM jsonb_build_object('order',p_order,'items',p_items,'pos',p_purchase_orders)
   THEN RAISE EXCEPTION 'This draft was already saved as order %. Revised fields were not applied; open that order to review.',existing.order_id; END IF;
   RETURN existing.order_id;
 END IF;
 IF NULLIF(trim(p_order->>'order_number'),'') IS NULL OR NULLIF(p_order->>'company_id','') IS NULL
   OR jsonb_typeof(p_items) IS DISTINCT FROM 'array' OR jsonb_array_length(p_items)=0
   OR jsonb_typeof(p_purchase_orders) IS DISTINCT FROM 'array'
 THEN RAISE EXCEPTION 'Complete the required order fields'; END IF;
 INSERT INTO public.orders(order_number,company_id,user_id,status,urgency,total_amount,description)
 VALUES(trim(p_order->>'order_number'),(p_order->>'company_id')::uuid,auth.uid(),'ordered',COALESCE(p_order->>'urgency','normal'),0,
   (SELECT string_agg(COALESCE(NULLIF(l->>'description',''),l->>'name')||' (Qty: '||(l->>'quantity')||')',E'\n') FROM jsonb_array_elements(p_items) l))
 RETURNING id INTO order_id_value;
 FOR line IN SELECT * FROM jsonb_array_elements(p_items) LOOP
   IF NULLIF(trim(line->>'name'),'') IS NULL OR (line->>'quantity')::numeric IS NULL OR (line->>'quantity')::numeric<=0
      OR (line->>'quantity')::numeric<>trunc((line->>'quantity')::numeric) THEN RAISE EXCEPTION 'Invalid order item'; END IF;
   INSERT INTO public.order_items(order_id,name,code,description,quantity,stock_status)
   VALUES(order_id_value,trim(line->>'name'),NULLIF(trim(line->>'code'),''),NULLIF(trim(line->>'description'),''),(line->>'quantity')::integer,'awaiting');
 END LOOP;
 FOR po IN SELECT * FROM jsonb_array_elements(p_purchase_orders) LOOP
   IF NULLIF(trim(po->>'purchaseOrderNumber'),'') IS NULL OR NULLIF(po->>'supplierId','') IS NULL THEN RAISE EXCEPTION 'Incomplete PO link'; END IF;
   INSERT INTO public.order_purchase_orders(order_id,supplier_id,purchase_order_number)
   VALUES(order_id_value,(po->>'supplierId')::uuid,trim(po->>'purchaseOrderNumber'));
 END LOOP;
 INSERT INTO public.order_draft_requests(id,actor_id,order_id,payload) VALUES(p_request_id,auth.uid(),order_id_value,jsonb_build_object('order',p_order,'items',p_items,'pos',p_purchase_orders));
 RETURN order_id_value;
END; $$;
REVOKE ALL ON FUNCTION public.create_order_draft_safe(uuid,jsonb,jsonb,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_order_draft_safe(uuid,jsonb,jsonb,jsonb) TO authenticated;
REVOKE ALL ON FUNCTION public.protect_collection_dismissal(),public.review_dismissed_po_changes() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.review_collection_dismissal(text,text,jsonb),public.save_workflow_record(text,text,jsonb,timestamptz),public.record_partial_delivery(uuid,uuid,jsonb,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.review_collection_dismissal(text,text,jsonb),public.save_workflow_record(text,text,jsonb,timestamptz),public.record_partial_delivery(uuid,uuid,jsonb,text) TO authenticated;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_publication WHERE pubname='supabase_realtime') THEN
   ALTER PUBLICATION supabase_realtime ADD TABLE public.collection_dismissals,public.dispatch_receipts;
 END IF;
END $$;
NOTIFY pgrst, 'reload schema';
COMMIT;
