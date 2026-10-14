CREATE TABLE public.fleet_vehicles(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 name text NOT NULL, registration text, make_model text,
 odometer numeric NOT NULL DEFAULT 0, service_interval_km numeric NOT NULL DEFAULT 15000,
 last_service_odometer numeric NOT NULL DEFAULT 0, last_service_date date, next_service_date date,
 active boolean NOT NULL DEFAULT true,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fleet_vehicles TO authenticated;
GRANT ALL ON public.fleet_vehicles TO service_role;
ALTER TABLE public.fleet_vehicles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Approved team manage vehicles" ON public.fleet_vehicles FOR ALL TO authenticated
 USING (public.is_user_approved(auth.uid())) WITH CHECK (public.is_user_approved(auth.uid()));
CREATE TRIGGER fleet_vehicles_updated BEFORE UPDATE ON public.fleet_vehicles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.fleet_logs(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 vehicle_id uuid NOT NULL REFERENCES public.fleet_vehicles(id) ON DELETE CASCADE,
 log_type text NOT NULL DEFAULT 'fuel', odometer numeric, litres numeric, cost numeric,
 route_id uuid REFERENCES public.dispatch_routes(id) ON DELETE SET NULL,
 notes text, slip_path text, logged_by uuid DEFAULT auth.uid(),
 created_at timestamptz NOT NULL DEFAULT now());
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fleet_logs TO authenticated;
GRANT ALL ON public.fleet_logs TO service_role;
ALTER TABLE public.fleet_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Approved team manage fleet logs" ON public.fleet_logs FOR ALL TO authenticated
 USING (public.is_user_approved(auth.uid())) WITH CHECK (public.is_user_approved(auth.uid()));

CREATE OR REPLACE FUNCTION public.apply_fleet_log() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NEW.log_type NOT IN ('fuel','odometer','service','incident') THEN RAISE EXCEPTION 'Invalid log type'; END IF;
 IF NEW.odometer IS NOT NULL THEN
  UPDATE fleet_vehicles SET odometer=GREATEST(odometer,NEW.odometer) WHERE id=NEW.vehicle_id;
 END IF;
 IF NEW.log_type='service' THEN
  UPDATE fleet_vehicles SET last_service_date=current_date,
   last_service_odometer=COALESCE(NEW.odometer,odometer) WHERE id=NEW.vehicle_id;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.apply_fleet_log() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER fleet_logs_apply AFTER INSERT ON public.fleet_logs FOR EACH ROW EXECUTE FUNCTION public.apply_fleet_log();