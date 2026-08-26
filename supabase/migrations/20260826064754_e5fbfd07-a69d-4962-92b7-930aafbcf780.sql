-- Integrated operations suite: route runs, exception ownership, immutable
-- fulfillment timelines, and user-saved operational views.

CREATE TABLE IF NOT EXISTS public.dispatch_routes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  route_date date NOT NULL DEFAULT CURRENT_DATE,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','ready','in_progress','completed','cancelled')),
  driver_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  stops jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(stops) = 'array'),
  total_stops integer NOT NULL DEFAULT 0 CHECK (total_stops >= 0),
  completed_stops integer NOT NULL DEFAULT 0 CHECK (completed_stops >= 0),
  map_url text,
  notes text,
  created_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.operations_exceptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type text NOT NULL CHECK (entity_type IN ('order','purchase_order','delivery','collection','route','general')),
  entity_id text,
  order_id uuid REFERENCES public.orders(id) ON DELETE CASCADE,
  category text NOT NULL CHECK (category IN ('short_delivery','damaged_stock','wrong_item','customer_unavailable','delivery_refused','missing_document','quantity_mismatch','supplier_delay','other')),
  severity text NOT NULL DEFAULT 'medium' CHECK (severity IN ('critical','high','medium','low')),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','investigating','blocked','resolved')),
  title text NOT NULL,
  description text,
  assigned_to uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  due_at timestamptz,
  resolved_at timestamptz,
  resolution text,
  created_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.fulfillment_timeline_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type text NOT NULL CHECK (entity_type IN ('order','purchase_order','delivery','collection','route','exception')),
  entity_id text NOT NULL,
  order_id uuid REFERENCES public.orders(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  title text NOT NULL,
  description text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  actor_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL DEFAULT auth.uid(),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.operational_saved_views (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE DEFAULT auth.uid(),
  name text NOT NULL,
  workspace text NOT NULL DEFAULT 'control-tower',
  configuration jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, workspace, name)
);

CREATE INDEX IF NOT EXISTS dispatch_routes_date_status_idx ON public.dispatch_routes(route_date, status);
CREATE INDEX IF NOT EXISTS dispatch_routes_driver_idx ON public.dispatch_routes(driver_id, route_date);
CREATE INDEX IF NOT EXISTS operations_exceptions_active_idx ON public.operations_exceptions(status, severity, due_at);
CREATE INDEX IF NOT EXISTS operations_exceptions_entity_idx ON public.operations_exceptions(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS fulfillment_timeline_entity_idx ON public.fulfillment_timeline_events(entity_type, entity_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS fulfillment_timeline_order_idx ON public.fulfillment_timeline_events(order_id, occurred_at DESC) WHERE order_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS operational_saved_views_user_idx ON public.operational_saved_views(user_id, workspace, updated_at DESC);

ALTER TABLE public.dispatch_routes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.operations_exceptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fulfillment_timeline_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.operational_saved_views ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users manage dispatch routes" ON public.dispatch_routes;
CREATE POLICY "Authenticated users manage dispatch routes" ON public.dispatch_routes
  FOR ALL TO authenticated USING (true) WITH CHECK (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS "Authenticated users manage exceptions" ON public.operations_exceptions;
CREATE POLICY "Authenticated users manage exceptions" ON public.operations_exceptions
  FOR ALL TO authenticated USING (true) WITH CHECK (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS "Authenticated users view fulfillment timeline" ON public.fulfillment_timeline_events;
CREATE POLICY "Authenticated users view fulfillment timeline" ON public.fulfillment_timeline_events
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Authenticated users add fulfillment timeline" ON public.fulfillment_timeline_events;
CREATE POLICY "Authenticated users add fulfillment timeline" ON public.fulfillment_timeline_events
  FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS "Users manage their operational views" ON public.operational_saved_views;
CREATE POLICY "Users manage their operational views" ON public.operational_saved_views
  FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.dispatch_routes, public.operations_exceptions, public.operational_saved_views TO authenticated;
GRANT SELECT, INSERT ON public.fulfillment_timeline_events TO authenticated;
GRANT ALL ON public.dispatch_routes, public.operations_exceptions, public.fulfillment_timeline_events, public.operational_saved_views TO service_role;

DROP TRIGGER IF EXISTS update_dispatch_routes_updated_at ON public.dispatch_routes;
CREATE TRIGGER update_dispatch_routes_updated_at BEFORE UPDATE ON public.dispatch_routes
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS update_operations_exceptions_updated_at ON public.operations_exceptions;
CREATE TRIGGER update_operations_exceptions_updated_at BEFORE UPDATE ON public.operations_exceptions
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS update_operational_saved_views_updated_at ON public.operational_saved_views;
CREATE TRIGGER update_operational_saved_views_updated_at BEFORE UPDATE ON public.operational_saved_views
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.capture_order_fulfillment_timeline()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  event_title text;
  event_description text;
BEGIN
  IF NEW.fulfillment_status IS DISTINCT FROM OLD.fulfillment_status THEN
    event_title := 'Delivery moved to ' || replace(COALESCE(NEW.fulfillment_status, 'pending'), '-', ' ');
    event_description := 'Status changed from ' || replace(COALESCE(OLD.fulfillment_status, 'pending'), '-', ' ') || '.';
  ELSIF NEW.fulfillment_assigned_to IS DISTINCT FROM OLD.fulfillment_assigned_to THEN
    event_title := CASE WHEN NEW.fulfillment_assigned_to IS NULL THEN 'Delivery unassigned' ELSE 'Delivery assigned' END;
    event_description := 'The delivery owner was updated.';
  ELSIF NEW.fulfillment_scheduled_for IS DISTINCT FROM OLD.fulfillment_scheduled_for THEN
    event_title := CASE WHEN NEW.fulfillment_scheduled_for IS NULL THEN 'Delivery schedule cleared' ELSE 'Delivery scheduled' END;
    event_description := CASE WHEN NEW.fulfillment_scheduled_for IS NULL THEN NULL ELSE 'Scheduled for ' || NEW.fulfillment_scheduled_for::text END;
  ELSIF NEW.urgency IS DISTINCT FROM OLD.urgency THEN
    event_title := CASE WHEN NEW.urgency = 'urgent' THEN 'Delivery marked urgent' ELSE 'Delivery priority normalised' END;
    event_description := NULL;
  ELSE
    RETURN NEW;
  END IF;

  INSERT INTO public.fulfillment_timeline_events(entity_type, entity_id, order_id, event_type, title, description, metadata, actor_id)
  VALUES ('delivery', NEW.id::text, NEW.id, 'status', event_title, event_description,
    jsonb_build_object('orderNumber', NEW.order_number, 'status', NEW.fulfillment_status), auth.uid());
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_order_fulfillment_timeline ON public.orders;
CREATE TRIGGER trg_order_fulfillment_timeline
AFTER UPDATE OF fulfillment_status, fulfillment_assigned_to, fulfillment_scheduled_for, urgency ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.capture_order_fulfillment_timeline();