-- Delivery & Collection fulfillment workspace
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS fulfillment_method text NOT NULL DEFAULT 'delivery',
  ADD COLUMN IF NOT EXISTS fulfillment_status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS fulfillment_assigned_to uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS fulfillment_scheduled_for timestamptz,
  ADD COLUMN IF NOT EXISTS fulfillment_notes text,
  ADD COLUMN IF NOT EXISTS fulfillment_routed_at timestamptz;

DO $$ BEGIN
  ALTER TABLE public.orders ADD CONSTRAINT orders_fulfillment_method_check
    CHECK (fulfillment_method IN ('delivery','collection'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.orders ADD CONSTRAINT orders_fulfillment_status_check
    CHECK (fulfillment_status IN ('pending','scheduled','out-for-delivery','ready-for-collection','completed'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS orders_fulfillment_method_idx ON public.orders(fulfillment_method);
CREATE INDEX IF NOT EXISTS orders_fulfillment_status_idx ON public.orders(fulfillment_status);
CREATE INDEX IF NOT EXISTS orders_fulfillment_assigned_to_idx ON public.orders(fulfillment_assigned_to);

CREATE TABLE IF NOT EXISTS public.fulfillment_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id = true),
  auto_assign_enabled boolean NOT NULL DEFAULT false,
  default_method text NOT NULL DEFAULT 'delivery' CHECK (default_method IN ('delivery','collection')),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL
);

GRANT SELECT, INSERT, UPDATE ON public.fulfillment_settings TO authenticated;
GRANT ALL ON public.fulfillment_settings TO service_role;

INSERT INTO public.fulfillment_settings (id)
VALUES (true)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.fulfillment_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can read fulfillment settings" ON public.fulfillment_settings;
CREATE POLICY "Authenticated users can read fulfillment settings"
ON public.fulfillment_settings FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Authenticated users can update fulfillment settings" ON public.fulfillment_settings;
CREATE POLICY "Authenticated users can update fulfillment settings"
ON public.fulfillment_settings FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.notify_fulfillment_assignment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.fulfillment_assigned_to IS NOT NULL
     AND NEW.fulfillment_assigned_to IS DISTINCT FROM OLD.fulfillment_assigned_to
     AND NEW.fulfillment_assigned_to IS DISTINCT FROM auth.uid() THEN
    INSERT INTO public.notifications (user_id, type, title, message, order_id, order_number)
    VALUES (
      NEW.fulfillment_assigned_to,
      'order_assigned',
      CASE WHEN NEW.fulfillment_method = 'collection' THEN 'Collection assigned to you' ELSE 'Delivery assigned to you' END,
      'You were assigned ' || NEW.fulfillment_method || ' for order ' || COALESCE(NEW.order_number, ''),
      NEW.id,
      NEW.order_number
    );
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.notify_fulfillment_assignment() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_notify_fulfillment_assignment ON public.orders;
CREATE TRIGGER trg_notify_fulfillment_assignment
AFTER UPDATE OF fulfillment_assigned_to ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.notify_fulfillment_assignment();

CREATE OR REPLACE FUNCTION public.auto_route_ready_fulfillment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cfg public.fulfillment_settings%ROWTYPE;
  candidate uuid;
  old_ready numeric := 0;
  new_ready numeric := 0;
BEGIN
  new_ready := GREATEST(0, LEAST(COALESCE(NEW.qty_invoiced, 0), COALESCE(NEW.quantity, 0)) - LEAST(COALESCE(NEW.qty_completed, 0), COALESCE(NEW.quantity, 0)));
  IF TG_OP = 'UPDATE' THEN
    old_ready := GREATEST(0, LEAST(COALESCE(OLD.qty_invoiced, 0), COALESCE(OLD.quantity, 0)) - LEAST(COALESCE(OLD.qty_completed, 0), COALESCE(OLD.quantity, 0)));
  END IF;

  IF new_ready <= 0 OR old_ready > 0 THEN
    RETURN NEW;
  END IF;

  SELECT * INTO cfg FROM public.fulfillment_settings WHERE id = true;
  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  IF cfg.auto_assign_enabled THEN
    SELECT p.id INTO candidate
    FROM public.profiles p
    JOIN public.user_roles ur ON ur.user_id = p.id
    LEFT JOIN public.orders o
      ON o.fulfillment_assigned_to = p.id
     AND COALESCE(o.fulfillment_status, 'pending') <> 'completed'
    WHERE COALESCE(p.approved, false) = true
      AND ur.role IN ('admin'::public.app_role, 'user'::public.app_role)
    GROUP BY p.id, p.full_name
    ORDER BY COUNT(o.id) ASC, p.full_name NULLS LAST, p.id
    LIMIT 1;
  END IF;

  UPDATE public.orders
  SET
    fulfillment_method = CASE WHEN fulfillment_routed_at IS NULL THEN COALESCE(cfg.default_method, fulfillment_method, 'delivery') ELSE fulfillment_method END,
    fulfillment_assigned_to = COALESCE(fulfillment_assigned_to, candidate),
    fulfillment_status = CASE
      WHEN fulfillment_routed_at IS NULL AND COALESCE(cfg.default_method, fulfillment_method, 'delivery') = 'collection' THEN 'ready-for-collection'
      ELSE COALESCE(fulfillment_status, 'pending')
    END,
    fulfillment_routed_at = COALESCE(fulfillment_routed_at, now())
  WHERE id = NEW.order_id;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.auto_route_ready_fulfillment() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_auto_route_ready_fulfillment ON public.order_items;
CREATE TRIGGER trg_auto_route_ready_fulfillment
AFTER INSERT OR UPDATE OF qty_invoiced, qty_completed ON public.order_items
FOR EACH ROW EXECUTE FUNCTION public.auto_route_ready_fulfillment();