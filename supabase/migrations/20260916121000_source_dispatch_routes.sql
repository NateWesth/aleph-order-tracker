-- Keep route planning connected to the new source-document dispatch board.
BEGIN;
CREATE TABLE public.dispatch_route_requests(
 id uuid PRIMARY KEY, actor_id uuid NOT NULL REFERENCES public.profiles(id),
 payload jsonb NOT NULL, route_id uuid NOT NULL REFERENCES public.dispatch_routes(id)
);
ALTER TABLE public.dispatch_route_requests ENABLE ROW LEVEL SECURITY;
CREATE FUNCTION public.plan_source_dispatch(p_request_id uuid,p_plan jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE prior public.dispatch_route_requests; entry jsonb; d public.dispatch_documents; stops jsonb:='[]';
 route_id_value uuid; driver uuid; day date;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM profiles WHERE id=auth.uid() AND approved) THEN RAISE EXCEPTION 'Approved staff required'; END IF;
 IF p_request_id IS NULL THEN RAISE EXCEPTION 'Request ID required'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_request_id::text,0));
 SELECT * INTO prior FROM dispatch_route_requests WHERE id=p_request_id;
 IF FOUND THEN
  IF prior.actor_id<>auth.uid() OR prior.payload IS DISTINCT FROM p_plan THEN RAISE EXCEPTION 'Request already saved with different details'; END IF;
  RETURN prior.route_id;
 END IF;
 IF jsonb_typeof(p_plan->'documents') IS DISTINCT FROM 'array' OR jsonb_array_length(p_plan->'documents') NOT BETWEEN 1 AND 50 OR NULLIF(trim(p_plan->>'name'),'') IS NULL THEN RAISE EXCEPTION 'Choose 1–50 stops and a run name'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_plan->'documents') x GROUP BY x->>'id' HAVING count(*)>1) THEN RAISE EXCEPTION 'Duplicate stop'; END IF;
 driver:=NULLIF(p_plan->>'driver_id','')::uuid; day:=(p_plan->>'date')::date;
 IF day IS NULL OR (driver IS NOT NULL AND NOT EXISTS(SELECT 1 FROM profiles WHERE id=driver AND approved)) THEN RAISE EXCEPTION 'Choose a valid date and team member'; END IF;
 -- A deterministic lock order prevents two planners deadlocking on mixed stops.
 PERFORM id FROM dispatch_documents WHERE id IN(SELECT x->>'id' FROM jsonb_array_elements(p_plan->'documents') x) ORDER BY id FOR UPDATE;
 FOR entry IN SELECT * FROM jsonb_array_elements(p_plan->'documents') LOOP
  SELECT * INTO d FROM dispatch_documents WHERE id=entry->>'id';
  IF NOT FOUND OR d.revision IS DISTINCT FROM (entry->>'revision')::bigint OR d.source_closed OR d.status IN ('completed','dismissed') OR dispatch_remaining(d)<=0 THEN RAISE EXCEPTION 'A selected stop changed; reload and review the run'; END IF;
  stops:=stops||jsonb_build_array(jsonb_build_object('sequence',jsonb_array_length(stops)+1,'stopType',d.kind,'entityId',d.id,'reference',d.reference,'label',d.contact_name,'address',d.address,'completed',false));
  UPDATE dispatch_documents SET assigned_to=COALESCE(driver,assigned_to),scheduled_for=day,status='scheduled',revision=revision+1,updated_at=clock_timestamp() WHERE id=d.id;
 END LOOP;
 INSERT INTO dispatch_routes(name,route_date,status,driver_id,stops,total_stops,completed_stops,notes,created_by)
 VALUES(trim(p_plan->>'name'),day,'ready',driver,stops,jsonb_array_length(stops),0,COALESCE(p_plan->>'notes',''),auth.uid()) RETURNING id INTO route_id_value;
 INSERT INTO dispatch_route_requests VALUES(p_request_id,auth.uid(),p_plan,route_id_value);
 RETURN route_id_value;
END; $$;
REVOKE ALL ON FUNCTION public.plan_source_dispatch(uuid,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.plan_source_dispatch(uuid,jsonb) TO authenticated;
COMMIT;

