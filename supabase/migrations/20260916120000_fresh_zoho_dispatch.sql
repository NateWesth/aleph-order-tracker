-- Fresh dispatch is independent of legacy order matching. No old rows are deleted.
BEGIN;
CREATE TABLE public.dispatch_documents (
 id text PRIMARY KEY, organization_id text NOT NULL, kind text NOT NULL CHECK(kind IN ('collection','delivery')),
 source_id text NOT NULL, reference text NOT NULL, contact_name text NOT NULL, address text,
 source_created_at timestamptz NOT NULL CHECK(source_created_at >= timestamptz '2026-09-14 00:00:00+02'),
 document_date text, source_modified_at timestamptz, source_status text NOT NULL,
 source_closed boolean NOT NULL DEFAULT false, lines jsonb NOT NULL, source_payload jsonb NOT NULL,
 completed_quantities jsonb NOT NULL DEFAULT '{}', status text NOT NULL DEFAULT 'pending'
 CHECK(status IN ('pending','scheduled','in-progress','completed','dismissed')),
 assigned_to uuid REFERENCES public.profiles(id), scheduled_for date, urgent boolean NOT NULL DEFAULT false,
 method text NOT NULL DEFAULT 'pickup' CHECK(method IN ('pickup','supplier-delivery','delivery','customer-collection')),
 notes text NOT NULL DEFAULT '', review_required boolean NOT NULL DEFAULT false,
 revision bigint NOT NULL DEFAULT 1, fetched_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE(organization_id,kind,source_id)
);
CREATE INDEX dispatch_documents_queue ON public.dispatch_documents(kind,status,source_created_at DESC);
CREATE TABLE public.dispatch_document_receipts (
 id uuid PRIMARY KEY, document_id text NOT NULL REFERENCES public.dispatch_documents(id),
 actor_id uuid NOT NULL REFERENCES public.profiles(id), created_at timestamptz NOT NULL DEFAULT now(),
 quantities jsonb NOT NULL, notes text NOT NULL DEFAULT '', result jsonb NOT NULL
);
CREATE TABLE public.dispatch_sync_state (
 kind text PRIMARY KEY CHECK(kind IN ('collection','delivery')), next_page integer NOT NULL DEFAULT 1,
 cycle_started_at timestamptz, last_success_at timestamptz, last_attempt_at timestamptz,
 error text, scanned integer NOT NULL DEFAULT 0
);
INSERT INTO public.dispatch_sync_state(kind) VALUES('collection'),('delivery');
ALTER TABLE public.dispatch_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dispatch_document_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dispatch_sync_state ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.dispatch_documents,public.dispatch_document_receipts,public.dispatch_sync_state TO authenticated;
GRANT ALL ON public.dispatch_documents,public.dispatch_document_receipts,public.dispatch_sync_state TO service_role;
CREATE POLICY approved_dispatch_read ON public.dispatch_documents FOR SELECT TO authenticated USING(EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND approved));
CREATE POLICY approved_receipts_read ON public.dispatch_document_receipts FOR SELECT TO authenticated USING(EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND approved));
CREATE POLICY approved_sync_read ON public.dispatch_sync_state FOR SELECT TO authenticated USING(EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND approved));

CREATE FUNCTION public.ingest_dispatch_document(p_org text,p_type text,p_doc jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE kind_value text; source_id_value text; created_value timestamptz; modified_value timestamptz;
 normalized jsonb; closed_value boolean; key_value text; status_value text; address_value jsonb;
BEGIN
 IF p_type NOT IN ('purchase_order','invoice') THEN RETURN '{"ignored":"unsupported"}'::jsonb; END IF;
 kind_value:=CASE WHEN p_type='invoice' THEN 'delivery' ELSE 'collection' END;
 source_id_value:=p_doc->>CASE WHEN p_type='invoice' THEN 'invoice_id' ELSE 'purchaseorder_id' END;
 IF NULLIF(source_id_value,'') IS NULL THEN RAISE EXCEPTION 'Zoho document ID missing'; END IF;
 BEGIN created_value:=NULLIF(p_doc->>'created_time','')::timestamptz;
 EXCEPTION WHEN others THEN RAISE EXCEPTION 'Invalid Zoho creation timestamp for %',source_id_value; END;
 IF created_value IS NULL THEN RAISE EXCEPTION 'Zoho creation timestamp missing for %; document not imported',source_id_value; END IF;
 IF created_value<timestamptz '2026-09-14 00:00:00+02' THEN RETURN '{"ignored":"before_start"}'::jsonb; END IF;
 modified_value:=COALESCE(NULLIF(p_doc->>'last_modified_time','')::timestamptz,created_value);
 key_value:=kind_value||':'||p_org||':'||source_id_value;
 status_value:=lower(COALESCE(p_doc->>'status','unknown'));
 closed_value:=status_value IN ('draft','void','cancelled','canceled','deleted','rejected')
   OR (kind_value='collection' AND (status_value='closed' OR lower(COALESCE(p_doc->>'received_status','')) IN ('received','fully_received')));
 IF jsonb_typeof(p_doc->'line_items') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Missing document lines for %',source_id_value; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_doc->'line_items') l WHERE NULLIF(l->>'line_item_id','') IS NULL)
 THEN RAISE EXCEPTION 'Stable Zoho line IDs missing for %',source_id_value; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_doc->'line_items') l GROUP BY l->>'line_item_id' HAVING count(*)>1)
 THEN RAISE EXCEPTION 'Duplicate source line ID'; END IF;
 SELECT COALESCE(jsonb_agg(jsonb_build_object(
  'id',l->>'line_item_id','sku',COALESCE(l->>'sku',''),'name',COALESCE(NULLIF(trim(l->>'description'),''),NULLIF(l->>'name',''),'Unnamed item'),
  'quantity',GREATEST(0,COALESCE((l->>'quantity')::numeric,0)),
  'source_completed',GREATEST(0,COALESCE((l->>CASE WHEN kind_value='collection' THEN 'quantity_received' ELSE 'quantity_delivered' END)::numeric,0))
 ) ORDER BY n),'[]'::jsonb) INTO normalized FROM jsonb_array_elements(p_doc->'line_items') WITH ORDINALITY a(l,n);
 address_value:=COALESCE(p_doc->CASE WHEN kind_value='delivery' THEN 'shipping_address' ELSE 'vendor_address' END,p_doc->'billing_address','{}'::jsonb);
 INSERT INTO public.dispatch_documents(id,organization_id,kind,source_id,reference,contact_name,address,source_created_at,document_date,source_modified_at,source_status,source_closed,lines,source_payload,method)
 VALUES(key_value,p_org,kind_value,source_id_value,COALESCE(p_doc->>CASE WHEN kind_value='delivery' THEN 'invoice_number' ELSE 'purchaseorder_number' END,source_id_value),
 COALESCE(p_doc->>CASE WHEN kind_value='delivery' THEN 'customer_name' ELSE 'vendor_name' END,'Unknown contact'),
 concat_ws(', ',NULLIF(address_value->>'address',''),NULLIF(address_value->>'street2',''),NULLIF(address_value->>'city',''),NULLIF(address_value->>'state',''),NULLIF(address_value->>'zip','')),
 created_value,p_doc->>'date',modified_value,status_value,closed_value,normalized,p_doc,CASE WHEN kind_value='delivery' THEN 'delivery' ELSE 'pickup' END)
 ON CONFLICT(id) DO UPDATE SET reference=EXCLUDED.reference,contact_name=EXCLUDED.contact_name,address=EXCLUDED.address,
 source_created_at=EXCLUDED.source_created_at,document_date=EXCLUDED.document_date,source_modified_at=EXCLUDED.source_modified_at,
 source_status=EXCLUDED.source_status,source_closed=EXCLUDED.source_closed,lines=EXCLUDED.lines,source_payload=EXCLUDED.source_payload,
 review_required=dispatch_documents.review_required OR (dispatch_documents.status IN ('completed','dismissed') AND dispatch_documents.lines IS DISTINCT FROM EXCLUDED.lines),
 revision=dispatch_documents.revision+1,updated_at=clock_timestamp(),fetched_at=now()
 WHERE EXCLUDED.source_modified_at>=dispatch_documents.source_modified_at
   AND (dispatch_documents.source_payload IS DISTINCT FROM EXCLUDED.source_payload OR dispatch_documents.source_status='missing-in-zoho');
 -- Respect explicit legacy PO closure/dismissal by exact Zoho ID. Do not guess
 -- delivery completion from invoice payment or a fuzzy sales-order reference.
 IF kind_value='collection' AND to_regclass('public.po_collection_state') IS NOT NULL THEN
  UPDATE public.dispatch_documents d SET status='completed',revision=d.revision+1,updated_at=clock_timestamp()
  WHERE d.id=key_value AND d.status NOT IN ('completed','dismissed') AND EXISTS(
   SELECT 1 FROM public.po_collection_state s WHERE s.purchase_order_id=source_id_value AND (s.completed_at IS NOT NULL OR s.status='collected'));
 END IF;
 IF kind_value='collection' AND to_regclass('public.collection_dismissals') IS NOT NULL THEN
  UPDATE public.dispatch_documents d SET status='dismissed',revision=d.revision+1,updated_at=clock_timestamp()
  WHERE d.id=key_value AND d.status NOT IN ('completed','dismissed') AND EXISTS(
   SELECT 1 FROM public.collection_dismissals s WHERE s.purchase_order_id=source_id_value AND s.active);
 END IF;
 RETURN jsonb_build_object('id',key_value);
END; $$;

-- Both already-cached and newly received webhook documents enter the same path.
CREATE FUNCTION public.dispatch_from_zoho_cache() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NEW.document_type IN ('purchase_order','invoice') THEN
   PERFORM public.ingest_dispatch_document(NEW.organization_id,NEW.document_type,NEW.payload);
 END IF;
 RETURN NEW;
EXCEPTION WHEN others THEN
 UPDATE public.dispatch_sync_state SET error='Webhook document '||NEW.document_id||': '||SQLERRM
 WHERE kind=CASE WHEN NEW.document_type='invoice' THEN 'delivery' ELSE 'collection' END;
 RETURN NEW;
END; $$;
CREATE TRIGGER dispatch_from_zoho_cache AFTER INSERT OR UPDATE OF payload ON public.zoho_document_cache
 FOR EACH ROW EXECUTE FUNCTION public.dispatch_from_zoho_cache();

CREATE FUNCTION public.dispatch_remaining(d public.dispatch_documents) RETURNS numeric LANGUAGE sql IMMUTABLE SET search_path=public AS $$
 SELECT COALESCE(sum(GREATEST(0,(l->>'quantity')::numeric-GREATEST((l->>'source_completed')::numeric,COALESCE((d.completed_quantities->>(l->>'id'))::numeric,0)))),0)
 FROM jsonb_array_elements(d.lines) l;
$$;
CREATE FUNCTION public.save_dispatch_document(p_id text,p_revision bigint,p_patch jsonb) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE d public.dispatch_documents; next_status text;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND approved) THEN RAISE EXCEPTION 'Approved staff account required'; END IF;
 SELECT * INTO d FROM public.dispatch_documents WHERE id=p_id FOR UPDATE;
 IF NOT FOUND OR d.revision IS DISTINCT FROM p_revision THEN RAISE EXCEPTION 'Document changed; refresh and review before saving'; END IF;
 IF jsonb_typeof(p_patch) IS DISTINCT FROM 'object' OR EXISTS(SELECT 1 FROM jsonb_object_keys(p_patch) k WHERE k NOT IN ('assigned_to','scheduled_for','urgent','method','notes','status')) THEN RAISE EXCEPTION 'Unsupported changes'; END IF;
 IF p_patch?'assigned_to' AND NULLIF(p_patch->>'assigned_to','') IS NOT NULL AND NOT EXISTS(SELECT 1 FROM profiles WHERE id=(p_patch->>'assigned_to')::uuid AND approved) THEN RAISE EXCEPTION 'Choose an approved team member'; END IF;
 next_status:=COALESCE(p_patch->>'status',d.status);
 IF p_patch?'method' AND NOT ((d.kind='collection' AND p_patch->>'method' IN ('pickup','supplier-delivery')) OR (d.kind='delivery' AND p_patch->>'method' IN ('delivery','customer-collection'))) THEN RAISE EXCEPTION 'Invalid dispatch method'; END IF;
 IF next_status='completed' AND d.status<>'completed' THEN RAISE EXCEPTION 'Complete the remaining line quantities instead'; END IF;
 IF d.status IN ('completed','dismissed') AND next_status NOT IN ('completed','dismissed') THEN RAISE EXCEPTION 'Closed dispatch records cannot be reopened by a source refresh'; END IF;
 UPDATE public.dispatch_documents SET
 assigned_to=CASE WHEN p_patch?'assigned_to' THEN NULLIF(p_patch->>'assigned_to','')::uuid ELSE assigned_to END,
 scheduled_for=CASE WHEN p_patch?'scheduled_for' THEN NULLIF(p_patch->>'scheduled_for','')::date ELSE scheduled_for END,
 urgent=CASE WHEN p_patch?'urgent' THEN (p_patch->>'urgent')::boolean ELSE urgent END,
 method=COALESCE(p_patch->>'method',method),notes=COALESCE(p_patch->>'notes',notes),status=next_status,
 revision=revision+1,updated_at=clock_timestamp() WHERE id=p_id;
END; $$;

CREATE FUNCTION public.record_dispatch_receipt(p_id text,p_revision bigint,p_request_id uuid,p_quantities jsonb,p_notes text DEFAULT '') RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE d public.dispatch_documents; existing public.dispatch_document_receipts; line jsonb; pair record;
 qty numeric; done_qty numeric; completed jsonb; result_value jsonb; units numeric:=0;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND approved) THEN RAISE EXCEPTION 'Approved staff account required'; END IF;
 IF p_request_id IS NULL THEN RAISE EXCEPTION 'Receipt ID required'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_request_id::text,0));
 SELECT * INTO existing FROM public.dispatch_document_receipts WHERE id=p_request_id;
 IF FOUND THEN
  IF existing.document_id<>p_id OR existing.actor_id<>auth.uid() OR existing.quantities IS DISTINCT FROM p_quantities OR existing.notes IS DISTINCT FROM COALESCE(p_notes,'') THEN RAISE EXCEPTION 'Receipt ID already used with different details'; END IF;
  RETURN existing.result;
 END IF;
 SELECT * INTO d FROM public.dispatch_documents WHERE id=p_id FOR UPDATE;
 IF NOT FOUND OR d.revision IS DISTINCT FROM p_revision THEN RAISE EXCEPTION 'Document changed; reload quantities before confirming'; END IF;
 IF d.source_closed OR d.status IN ('completed','dismissed') THEN RAISE EXCEPTION 'Document is no longer active'; END IF;
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
 UPDATE public.dispatch_documents SET completed_quantities=completed,status=CASE WHEN (result_value->>'completed')::boolean THEN 'completed' ELSE 'in-progress' END,revision=revision+1,updated_at=clock_timestamp() WHERE id=p_id;
 INSERT INTO public.dispatch_document_receipts(id,document_id,actor_id,quantities,notes,result) VALUES(p_request_id,p_id,auth.uid(),p_quantities,COALESCE(p_notes,''),result_value);
 RETURN result_value;
END; $$;
REVOKE ALL ON FUNCTION public.ingest_dispatch_document(text,text,jsonb),public.dispatch_from_zoho_cache(),public.dispatch_remaining(public.dispatch_documents),public.save_dispatch_document(text,bigint,jsonb),public.record_dispatch_receipt(text,bigint,uuid,jsonb,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ingest_dispatch_document(text,text,jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.save_dispatch_document(text,bigint,jsonb),public.record_dispatch_receipt(text,bigint,uuid,jsonb,text) TO authenticated;
-- Ignore malformed historic cache entries during bootstrap; the source sync will report/retry them.
DO $$ DECLARE r record; BEGIN
 FOR r IN SELECT * FROM public.zoho_document_cache WHERE document_type IN ('invoice','purchase_order') LOOP
  BEGIN PERFORM public.ingest_dispatch_document(r.organization_id,r.document_type,r.payload);
  EXCEPTION WHEN others THEN RAISE WARNING 'Dispatch cache bootstrap skipped %: %',r.document_id,SQLERRM; END;
 END LOOP;
 IF EXISTS(SELECT 1 FROM pg_publication WHERE pubname='supabase_realtime') THEN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.dispatch_documents,public.dispatch_document_receipts,public.dispatch_sync_state;
 END IF;
END $$;
NOTIFY pgrst,'reload schema';
COMMIT;
