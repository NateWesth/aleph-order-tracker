ALTER TABLE public.dispatch_documents DROP CONSTRAINT dispatch_documents_status_check;
ALTER TABLE public.dispatch_documents ADD CONSTRAINT dispatch_documents_status_check CHECK (status IN ('pending','scheduled','on-route','in-progress','completed','dismissed'));

CREATE OR REPLACE FUNCTION public.guard_dispatch_on_route() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
 IF NEW.status='on-route' AND OLD.status<>'on-route' THEN
  IF OLD.status NOT IN ('pending','scheduled') OR OLD.source_closed OR public.dispatch_remaining(OLD)<=0 THEN
   RAISE EXCEPTION 'Only active ready or planned documents can be marked On route';
  END IF;
 END IF;
 IF OLD.status='on-route' AND NEW.status<>'on-route' THEN
  IF auth.uid() IS NULL THEN
   NEW.status:='on-route';
  ELSIF NEW.status NOT IN ('completed','in-progress') OR (NEW.completed_quantities IS NOT DISTINCT FROM OLD.completed_quantities AND NOT EXISTS (
   SELECT 1 FROM public.dispatch_document_receipts r WHERE r.document_id=OLD.id AND r.actor_id=auth.uid() AND r.created_at>=transaction_timestamp() AND r.result->>'checked'='true'
  )) THEN
   RAISE EXCEPTION 'Confirm quantities or check completion before removing an On route document';
  END IF;
 END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER guard_dispatch_on_route BEFORE UPDATE ON public.dispatch_documents FOR EACH ROW EXECUTE FUNCTION public.guard_dispatch_on_route();

CREATE OR REPLACE FUNCTION public.check_dispatch_completion(p_id text,p_revision bigint,p_request_id uuid,p_notes text DEFAULT '') RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE d public.dispatch_documents; existing public.dispatch_document_receipts; result_value jsonb;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND approved) THEN RAISE EXCEPTION 'Approved staff account required'; END IF;
 IF p_request_id IS NULL THEN RAISE EXCEPTION 'Check ID required'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_request_id::text,0));
 SELECT * INTO existing FROM public.dispatch_document_receipts WHERE id=p_request_id;
 IF FOUND THEN
  IF existing.document_id<>p_id OR existing.actor_id<>auth.uid() OR existing.quantities<>'{}'::jsonb OR existing.result->>'checked' IS DISTINCT FROM 'true' OR existing.notes IS DISTINCT FROM COALESCE(p_notes,'') THEN RAISE EXCEPTION 'Check ID already used with different details'; END IF;
  RETURN existing.result;
 END IF;
 SELECT * INTO d FROM public.dispatch_documents WHERE id=p_id FOR UPDATE;
 IF NOT FOUND OR d.revision IS DISTINCT FROM p_revision THEN RAISE EXCEPTION 'Document changed; reload before checking completion'; END IF;
 IF d.status<>'on-route' OR (NOT d.source_closed AND public.dispatch_remaining(d)>0) THEN RAISE EXCEPTION 'Confirm the remaining quantities before completing this document'; END IF;
 result_value:=jsonb_build_object('units',0,'completed',true,'checked',true,'receipt_id',p_request_id);
 INSERT INTO public.dispatch_document_receipts(id,document_id,actor_id,quantities,notes,result) VALUES(p_request_id,p_id,auth.uid(),'{}'::jsonb,COALESCE(p_notes,''),result_value);
 UPDATE public.dispatch_documents SET status='completed',revision=revision+1,updated_at=clock_timestamp() WHERE id=p_id;
 RETURN result_value;
END; $$;
REVOKE ALL ON FUNCTION public.check_dispatch_completion(text,bigint,uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_dispatch_completion(text,bigint,uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_dispatch_completion(text,bigint,uuid,text) TO service_role;