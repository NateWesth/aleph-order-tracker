CREATE OR REPLACE FUNCTION public.guard_dispatch_on_route() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
 IF NEW.status='on-route' AND OLD.status<>'on-route' THEN
  IF OLD.status NOT IN ('pending','scheduled') OR (OLD.source_closed AND NOT OLD.review_required) OR public.dispatch_remaining(OLD)<=0 THEN RAISE EXCEPTION 'Only active ready or planned documents can be marked On route'; END IF;
 END IF;
 IF OLD.status='on-route' AND NEW.status<>'on-route' THEN
  IF auth.uid() IS NULL THEN NEW.status:='on-route';
  ELSIF NEW.status NOT IN ('pending','completed','in-progress') OR NOT EXISTS(SELECT 1 FROM public.dispatch_document_receipts r WHERE r.document_id=OLD.id AND r.actor_id=auth.uid() AND r.created_at>=transaction_timestamp() AND r.result->>'route_completed'='true' AND r.result->>'status'=NEW.status) THEN
   RAISE EXCEPTION 'Use Route complete with confirmed quantities before removing an On route document';
  END IF;
 END IF;
 RETURN NEW;
END; $$;
CREATE OR REPLACE FUNCTION public.record_dispatch_receipt(p_id text,p_revision bigint,p_request_id uuid,p_quantities jsonb,p_notes text DEFAULT '') RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE d public.dispatch_documents; existing public.dispatch_document_receipts; line jsonb; pair record; qty numeric; done_qty numeric; completed jsonb; result_value jsonb; units numeric:=0;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND approved) THEN RAISE EXCEPTION 'Approved staff account required'; END IF;
 IF p_request_id IS NULL THEN RAISE EXCEPTION 'Receipt ID required'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_request_id::text,0));
 SELECT * INTO existing FROM public.dispatch_document_receipts WHERE id=p_request_id;
 IF FOUND THEN
  IF existing.document_id<>p_id OR existing.actor_id<>auth.uid() OR existing.quantities IS DISTINCT FROM p_quantities OR existing.notes IS DISTINCT FROM COALESCE(p_notes,'') OR existing.result->>'route_completed'='true' THEN RAISE EXCEPTION 'Receipt ID already used with different details'; END IF;
  RETURN existing.result;
 END IF;
 SELECT * INTO d FROM public.dispatch_documents WHERE id=p_id FOR UPDATE;
 IF NOT FOUND OR d.revision IS DISTINCT FROM p_revision THEN RAISE EXCEPTION 'Document changed; reload quantities before confirming'; END IF;
 IF (d.source_closed AND NOT d.review_required AND d.status<>'on-route') OR d.status IN ('completed','dismissed') THEN RAISE EXCEPTION 'Document is no longer active'; END IF;
 IF jsonb_typeof(p_quantities) IS DISTINCT FROM 'object' OR p_quantities='{}'::jsonb THEN RAISE EXCEPTION 'Enter quantities completed now'; END IF;
 completed:=d.completed_quantities;
 FOR pair IN SELECT * FROM jsonb_each_text(p_quantities) LOOP
  qty:=pair.value::numeric;
  SELECT l INTO line FROM jsonb_array_elements(d.lines) l WHERE l->>'id'=pair.key;
  IF line IS NULL OR qty IS NULL OR qty<=0 OR qty='NaN'::numeric THEN RAISE EXCEPTION 'Invalid quantity or source line'; END IF;
  done_qty:=GREATEST((line->>'source_completed')::numeric,COALESCE((completed->>pair.key)::numeric,0));
  IF qty>(line->>'quantity')::numeric-done_qty THEN RAISE EXCEPTION 'Quantity exceeds remaining units'; END IF;
  completed:=jsonb_set(completed,ARRAY[pair.key],to_jsonb(done_qty+qty)); units:=units+qty;
 END LOOP;
 d.completed_quantities:=completed;
 result_value:=jsonb_build_object('units',units,'completed',public.dispatch_remaining(d)<=0,'receipt_id',p_request_id);
 UPDATE public.dispatch_documents SET completed_quantities=completed,status=CASE WHEN status='on-route' THEN 'on-route' WHEN (result_value->>'completed')::boolean THEN 'completed' ELSE 'in-progress' END,revision=revision+1,updated_at=clock_timestamp() WHERE id=p_id;
 INSERT INTO public.dispatch_document_receipts(id,document_id,actor_id,quantities,notes,result) VALUES(p_request_id,p_id,auth.uid(),p_quantities,COALESCE(p_notes,''),result_value);
 RETURN result_value;
END; $$;
CREATE OR REPLACE FUNCTION public.finish_dispatch_route_stop(p_id text,p_revision bigint,p_request_id uuid,p_quantities jsonb DEFAULT '{}'::jsonb,p_notes text DEFAULT '') RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE d public.dispatch_documents; existing public.dispatch_document_receipts; remaining numeric; done_units numeric; next_status text; result_value jsonb;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND approved) THEN RAISE EXCEPTION 'Approved staff account required'; END IF;
 IF p_request_id IS NULL THEN RAISE EXCEPTION 'Route completion ID required'; END IF;
 IF jsonb_typeof(p_quantities) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Invalid quantities'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_request_id::text,0));
 SELECT * INTO existing FROM public.dispatch_document_receipts WHERE id=p_request_id;
 IF FOUND THEN
  IF existing.document_id<>p_id OR existing.actor_id<>auth.uid() OR existing.quantities IS DISTINCT FROM p_quantities OR existing.notes IS DISTINCT FROM COALESCE(p_notes,'') OR existing.result->>'route_completed' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'Route completion ID already used with different details'; END IF;
  RETURN existing.result;
 END IF;
 SELECT * INTO d FROM public.dispatch_documents WHERE id=p_id FOR UPDATE;
 IF NOT FOUND OR d.revision IS DISTINCT FROM p_revision THEN RAISE EXCEPTION 'Document changed; reload before completing the route'; END IF;
 IF d.status<>'on-route' THEN RAISE EXCEPTION 'Route complete is only available for On route stops'; END IF;
 IF p_quantities<>'{}'::jsonb THEN
  PERFORM public.record_dispatch_receipt(p_id,p_revision,gen_random_uuid(),p_quantities,p_notes);
  SELECT * INTO d FROM public.dispatch_documents WHERE id=p_id;
 END IF;
 remaining:=public.dispatch_remaining(d);
 SELECT COALESCE(sum(LEAST((l->>'quantity')::numeric,GREATEST(0,COALESCE((l->>'source_completed')::numeric,0),COALESCE((d.completed_quantities->>(l->>'id'))::numeric,0)))),0) INTO done_units FROM jsonb_array_elements(d.lines) l;
 next_status:=CASE WHEN remaining<=0 THEN 'completed' WHEN done_units>0 THEN 'in-progress' ELSE 'pending' END;
 result_value:=jsonb_build_object('units',0,'completed',next_status='completed','route_completed',true,'status',next_status,'receipt_id',p_request_id);
 INSERT INTO public.dispatch_document_receipts(id,document_id,actor_id,quantities,notes,result) VALUES(p_request_id,p_id,auth.uid(),p_quantities,COALESCE(p_notes,''),result_value);
 UPDATE public.dispatch_documents SET status=next_status,scheduled_for=NULL,review_required=review_required OR (source_closed AND remaining>0),revision=revision+1,updated_at=clock_timestamp() WHERE id=p_id;
 RETURN result_value;
END; $$;
REVOKE ALL ON FUNCTION public.finish_dispatch_route_stop(text,bigint,uuid,jsonb,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.finish_dispatch_route_stop(text,bigint,uuid,jsonb,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.finish_dispatch_route_stop(text,bigint,uuid,jsonb,text) TO service_role;