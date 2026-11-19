CREATE POLICY portal_company_items ON public.order_items FOR SELECT TO authenticated USING(EXISTS(SELECT 1 FROM public.orders o JOIN public.profiles p ON p.company_id=o.company_id WHERE o.id=order_items.order_id AND p.id=auth.uid()));
CREATE TABLE public.portal_reorder_requests(id uuid PRIMARY KEY,company_id uuid NOT NULL REFERENCES public.companies(id),requested_by uuid NOT NULL DEFAULT auth.uid(),source_order_id uuid NOT NULL REFERENCES public.orders(id),lines jsonb NOT NULL,status text NOT NULL DEFAULT 'pending',notes text,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now());
GRANT SELECT,INSERT,UPDATE ON public.portal_reorder_requests TO authenticated;
GRANT ALL ON public.portal_reorder_requests TO service_role;
ALTER TABLE public.portal_reorder_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY reorder_read ON public.portal_reorder_requests FOR SELECT TO authenticated USING(public.is_user_approved(auth.uid()) OR public.is_admin() OR company_id=(SELECT company_id FROM public.profiles WHERE id=auth.uid()));
CREATE POLICY reorder_create ON public.portal_reorder_requests FOR INSERT TO authenticated WITH CHECK(requested_by=auth.uid() AND status='pending' AND company_id=(SELECT company_id FROM public.profiles WHERE id=auth.uid()));
CREATE POLICY reorder_staff_update ON public.portal_reorder_requests FOR UPDATE TO authenticated USING(public.is_user_approved(auth.uid()) OR public.is_admin()) WITH CHECK(public.is_user_approved(auth.uid()) OR public.is_admin());
CREATE FUNCTION public.validate_portal_reorder() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$ DECLARE line jsonb; BEGIN
 IF TG_OP='INSERT' THEN
  IF NOT EXISTS(SELECT 1 FROM public.orders WHERE id=NEW.source_order_id AND company_id=NEW.company_id) THEN RAISE EXCEPTION 'Order does not belong to your company'; END IF;
  IF jsonb_typeof(NEW.lines)<>'array' OR jsonb_array_length(NEW.lines) NOT BETWEEN 1 AND 200 THEN RAISE EXCEPTION 'Choose 1 to 200 lines'; END IF;
  FOR line IN SELECT value FROM jsonb_array_elements(NEW.lines) LOOP
   IF NOT EXISTS(SELECT 1 FROM public.order_items WHERE id=(line->>'item_id')::uuid AND order_id=NEW.source_order_id) OR (line->>'quantity')::numeric<=0 OR (line->>'quantity')::numeric>1000000 OR line->>'quantity' IS NULL THEN RAISE EXCEPTION 'Invalid reorder line'; END IF;
  END LOOP;
 ELSE
  IF NEW.company_id<>OLD.company_id OR NEW.requested_by<>OLD.requested_by OR NEW.source_order_id<>OLD.source_order_id OR NEW.lines<>OLD.lines THEN RAISE EXCEPTION 'Original request cannot be changed'; END IF;
 END IF;
 IF NEW.status NOT IN ('pending','reviewed','accepted','declined') THEN RAISE EXCEPTION 'Invalid request status'; END IF;
 NEW.updated_at=now(); RETURN NEW;
END $$;
CREATE TRIGGER validate_portal_reorder BEFORE INSERT OR UPDATE ON public.portal_reorder_requests FOR EACH ROW EXECUTE FUNCTION public.validate_portal_reorder();
REVOKE ALL ON FUNCTION public.validate_portal_reorder() FROM PUBLIC,anon,authenticated;
CREATE INDEX portal_reorder_company ON public.portal_reorder_requests(company_id);
CREATE INDEX portal_reorder_source ON public.portal_reorder_requests(source_order_id);
ALTER TABLE public.fabrication_time_entries ADD COLUMN timer_session_id uuid UNIQUE REFERENCES public.workshop_timer_sessions(id), ADD COLUMN hourly_rate_snapshot numeric;
CREATE FUNCTION public.capture_finished_fabrication_timer() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN
 IF NEW.entity_type='fabrication' AND NEW.state='finished' AND OLD.state<>'finished' THEN
 INSERT INTO public.fabrication_time_entries(project_id,worker_name,hours,note,created_by,timer_session_id,hourly_rate_snapshot) SELECT NEW.entity_id,full_name,NEW.accumulated_seconds/3600,'Workshop timer',NEW.technician_id,NEW.id,NEW.hourly_rate FROM public.profiles WHERE id=NEW.technician_id ON CONFLICT(timer_session_id) DO NOTHING;
 END IF; RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.capture_finished_fabrication_timer() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER capture_timer_hours AFTER UPDATE ON public.workshop_timer_sessions FOR EACH ROW EXECUTE FUNCTION public.capture_finished_fabrication_timer();