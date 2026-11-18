-- lovable-cron-fallback-reviewed: actual timed ownership handovers require reconciliation when no app is open; one-minute maximum delay, 1440 daily checks disclosed
CREATE TABLE public.operational_leave_cover (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), owner_id uuid NOT NULL REFERENCES public.profiles(id), delegate_id uuid NOT NULL REFERENCES public.profiles(id), starts_at timestamptz NOT NULL, ends_at timestamptz NOT NULL, cancelled boolean NOT NULL DEFAULT false, notes text, created_by uuid NOT NULL DEFAULT auth.uid(), created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT,INSERT,UPDATE ON public.operational_leave_cover TO authenticated;
GRANT ALL ON public.operational_leave_cover TO service_role;
ALTER TABLE public.operational_leave_cover ENABLE ROW LEVEL SECURITY;
CREATE POLICY cover_read ON public.operational_leave_cover FOR SELECT TO authenticated USING(public.is_user_approved(auth.uid()) OR public.is_admin());
CREATE POLICY cover_admin_insert ON public.operational_leave_cover FOR INSERT TO authenticated WITH CHECK(public.is_admin());
CREATE POLICY cover_admin_update ON public.operational_leave_cover FOR UPDATE TO authenticated USING(public.is_admin()) WITH CHECK(public.is_admin());
CREATE FUNCTION public.validate_operational_leave_cover() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
 PERFORM pg_advisory_xact_lock(7218401);
 IF NEW.owner_id=NEW.delegate_id OR NEW.ends_at<=NEW.starts_at THEN RAISE EXCEPTION 'Choose different approved teammates and a valid date range'; END IF;
 IF NOT public.is_user_approved(NEW.owner_id) OR NOT public.is_user_approved(NEW.delegate_id) THEN RAISE EXCEPTION 'Choose approved teammates'; END IF;
 IF NOT NEW.cancelled AND EXISTS(SELECT 1 FROM public.operational_leave_cover c WHERE c.id<>NEW.id AND NOT c.cancelled AND c.starts_at<NEW.ends_at AND c.ends_at>NEW.starts_at AND (c.owner_id=NEW.owner_id OR c.owner_id=NEW.delegate_id OR c.delegate_id=NEW.owner_id)) THEN RAISE EXCEPTION 'Overlapping cover or delegate chains are not allowed'; END IF;
 NEW.updated_at=now(); RETURN NEW;
END $$;
CREATE TRIGGER validate_leave_cover BEFORE INSERT OR UPDATE ON public.operational_leave_cover FOR EACH ROW EXECUTE FUNCTION public.validate_operational_leave_cover();
CREATE FUNCTION public.effective_operational_owner(p_owner uuid) RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$ SELECT coalesce((SELECT delegate_id FROM public.operational_leave_cover WHERE owner_id=p_owner AND NOT cancelled AND starts_at<=now() AND ends_at>now() AND public.is_user_approved(delegate_id) ORDER BY starts_at DESC LIMIT 1),p_owner) $$;
REVOKE ALL ON FUNCTION public.effective_operational_owner(uuid) FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION public.apply_client_operational_assignment() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE linked_user uuid;
BEGIN
 SELECT purchasing_invoicing_user_id INTO linked_user FROM public.companies WHERE id=NEW.company_id FOR SHARE;
 IF linked_user IS NOT NULL THEN NEW.assigned_to:=public.effective_operational_owner(linked_user); END IF;
 RETURN NEW;
END $$;
CREATE FUNCTION public.reconcile_operational_leave_cover() RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 UPDATE public.orders o SET assigned_to=public.effective_operational_owner(c.purchasing_invoicing_user_id) FROM public.companies c WHERE o.company_id=c.id AND c.purchasing_invoicing_user_id IS NOT NULL AND coalesce(o.status,'') NOT IN ('completed','delivered','cancelled') AND o.assigned_to IS DISTINCT FROM public.effective_operational_owner(c.purchasing_invoicing_user_id);
END $$;
REVOKE ALL ON FUNCTION public.reconcile_operational_leave_cover() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.reconcile_operational_leave_cover() TO service_role;
CREATE FUNCTION public.sync_operational_leave_cover() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN PERFORM public.reconcile_operational_leave_cover(); RETURN NEW; END $$;
REVOKE ALL ON FUNCTION public.sync_operational_leave_cover() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER sync_leave_cover AFTER INSERT OR UPDATE ON public.operational_leave_cover FOR EACH STATEMENT EXECUTE FUNCTION public.sync_operational_leave_cover();
SELECT cron.schedule('aleph-operational-cover','* * * * *','SELECT public.reconcile_operational_leave_cover()');
CREATE TABLE public.workshop_timer_sessions (
 id uuid PRIMARY KEY, technician_id uuid NOT NULL REFERENCES public.profiles(id), entity_type text NOT NULL, entity_id uuid NOT NULL, state text NOT NULL DEFAULT 'running', accumulated_seconds numeric NOT NULL DEFAULT 0, running_since timestamptz, hourly_rate numeric NOT NULL DEFAULT 0, note text, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.workshop_timer_sessions TO authenticated;
GRANT ALL ON public.workshop_timer_sessions TO service_role;
ALTER TABLE public.workshop_timer_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY timer_read ON public.workshop_timer_sessions FOR SELECT TO authenticated USING(public.is_user_approved(auth.uid()) OR public.is_admin());
CREATE UNIQUE INDEX one_running_workshop_timer ON public.workshop_timer_sessions(technician_id) WHERE state='running';
CREATE FUNCTION public.workshop_timer_command(p_id uuid,p_entity_type text,p_entity_id uuid,p_action text,p_hourly_rate numeric DEFAULT 0) RETURNS public.workshop_timer_sessions LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE s public.workshop_timer_sessions; actor uuid:=auth.uid();
BEGIN
 IF actor IS NULL OR NOT (public.is_user_approved(actor) OR public.is_admin()) THEN RAISE EXCEPTION 'Approved staff only'; END IF;
 IF p_id IS NULL OR p_action NOT IN ('start','pause','resume','finish') OR p_entity_type NOT IN ('sharpening','repair','fabrication') OR p_hourly_rate<0 OR p_hourly_rate>100000 OR p_hourly_rate IS NULL THEN RAISE EXCEPTION 'Invalid timer request'; END IF;
 PERFORM pg_advisory_xact_lock(hashtext(actor::text));
 SELECT * INTO s FROM public.workshop_timer_sessions WHERE id=p_id FOR UPDATE;
 IF FOUND THEN
  IF s.technician_id<>actor OR s.entity_id<>p_entity_id OR s.entity_type<>p_entity_type THEN RAISE EXCEPTION 'This timer belongs to another technician or job'; END IF;
  IF p_action='start' OR (p_action='pause' AND s.state='paused') OR (p_action='resume' AND s.state='running') OR (p_action='finish' AND s.state='finished') THEN RETURN s; END IF;
  IF s.state='finished' THEN RAISE EXCEPTION 'Finished timers cannot restart'; END IF;
  IF p_action='resume' THEN
   UPDATE public.workshop_timer_sessions SET state='running',running_since=now(),updated_at=now() WHERE id=p_id RETURNING * INTO s;
  ELSE
   UPDATE public.workshop_timer_sessions SET accumulated_seconds=accumulated_seconds+CASE WHEN state='running' THEN greatest(0,extract(epoch FROM now()-running_since)) ELSE 0 END,state=CASE WHEN p_action='finish' THEN 'finished' ELSE 'paused' END,running_since=NULL,updated_at=now() WHERE id=p_id RETURNING * INTO s;
  END IF;
 ELSE
  IF p_action<>'start' THEN RAISE EXCEPTION 'Timer not found'; END IF;
  IF (p_entity_type='sharpening' AND NOT EXISTS(SELECT 1 FROM public.sharpening_jobs WHERE id=p_entity_id AND status<>'completed')) OR (p_entity_type='repair' AND NOT EXISTS(SELECT 1 FROM public.repair_tickets WHERE id=p_entity_id AND status NOT IN ('completed','scrapped'))) OR (p_entity_type='fabrication' AND NOT EXISTS(SELECT 1 FROM public.fabrication_projects WHERE id=p_entity_id AND stage<>'completed')) THEN RAISE EXCEPTION 'Choose an active workshop job'; END IF;
  INSERT INTO public.workshop_timer_sessions(id,technician_id,entity_type,entity_id,running_since,hourly_rate) VALUES(p_id,actor,p_entity_type,p_entity_id,now(),p_hourly_rate) RETURNING * INTO s;
 END IF;
 RETURN s;
END $$;
REVOKE ALL ON FUNCTION public.workshop_timer_command(uuid,text,uuid,text,numeric) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.workshop_timer_command(uuid,text,uuid,text,numeric) TO authenticated;
REVOKE ALL ON FUNCTION public.validate_operational_leave_cover() FROM PUBLIC,anon,authenticated;