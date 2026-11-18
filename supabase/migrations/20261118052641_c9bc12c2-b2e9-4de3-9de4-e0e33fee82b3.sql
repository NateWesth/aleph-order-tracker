CREATE SCHEMA IF NOT EXISTS aleph_private;
GRANT USAGE ON SCHEMA aleph_private TO authenticated;
ALTER FUNCTION public.workshop_timer_command(uuid,text,uuid,text,numeric) SET SCHEMA aleph_private;
CREATE FUNCTION public.workshop_timer_command(p_id uuid,p_entity_type text,p_entity_id uuid,p_action text,p_hourly_rate numeric DEFAULT 0) RETURNS public.workshop_timer_sessions LANGUAGE sql SECURITY INVOKER SET search_path=public AS $$ SELECT aleph_private.workshop_timer_command(p_id,p_entity_type,p_entity_id,p_action,p_hourly_rate) $$;
REVOKE ALL ON FUNCTION public.workshop_timer_command(uuid,text,uuid,text,numeric) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.workshop_timer_command(uuid,text,uuid,text,numeric) TO authenticated;
CREATE INDEX operational_leave_owner ON public.operational_leave_cover(owner_id);
CREATE INDEX operational_leave_delegate ON public.operational_leave_cover(delegate_id);