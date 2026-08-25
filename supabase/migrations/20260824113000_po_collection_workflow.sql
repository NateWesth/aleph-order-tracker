-- Purchase-order collection workflow.
-- Active Collection cards are derived from the existing po_tracking_cache, which already
-- contains only recent PO quantities that are not covered by valid supplier bills.

CREATE TABLE IF NOT EXISTS public.po_collection_state (
  purchase_order_id text PRIMARY KEY,
  purchase_order_number text NOT NULL,
  vendor_id text,
  vendor_name text NOT NULL DEFAULT 'Unknown supplier',
  assigned_to uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','scheduled','collecting','collected')),
  scheduled_for timestamptz,
  notes text,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_po_collection_state_assigned_to ON public.po_collection_state(assigned_to);
CREATE INDEX IF NOT EXISTS idx_po_collection_state_status ON public.po_collection_state(status);

CREATE TABLE IF NOT EXISTS public.po_collection_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_order_id text NOT NULL,
  purchase_order_number text NOT NULL,
  vendor_id text,
  vendor_name text NOT NULL DEFAULT 'Unknown supplier',
  collected_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  collected_at timestamptz NOT NULL DEFAULT now(),
  total_units numeric NOT NULL DEFAULT 0 CHECK (total_units > 0),
  fully_collected boolean NOT NULL DEFAULT false,
  notes text,
  source_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_po_collection_events_po ON public.po_collection_events(purchase_order_id, collected_at DESC);
CREATE INDEX IF NOT EXISTS idx_po_collection_events_user ON public.po_collection_events(collected_by, collected_at DESC);

CREATE TABLE IF NOT EXISTS public.po_collection_event_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.po_collection_events(id) ON DELETE CASCADE,
  line_key text NOT NULL,
  sku text,
  name text NOT NULL,
  description text,
  quantity_collected numeric NOT NULL CHECK (quantity_collected > 0),
  source_unbilled_quantity numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_po_collection_event_lines_event ON public.po_collection_event_lines(event_id);
CREATE INDEX IF NOT EXISTS idx_po_collection_event_lines_key ON public.po_collection_event_lines(line_key);

ALTER TABLE public.po_collection_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.po_collection_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.po_collection_event_lines ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can view collection state" ON public.po_collection_state;
CREATE POLICY "Authenticated users can view collection state"
  ON public.po_collection_state FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Authenticated users can manage collection state" ON public.po_collection_state;
CREATE POLICY "Authenticated users can manage collection state"
  ON public.po_collection_state FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated users can view collection events" ON public.po_collection_events;
CREATE POLICY "Authenticated users can view collection events"
  ON public.po_collection_events FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Users can record their own collections" ON public.po_collection_events;
CREATE POLICY "Users can record their own collections"
  ON public.po_collection_events FOR INSERT TO authenticated WITH CHECK (collected_by = auth.uid());

DROP POLICY IF EXISTS "Authenticated users can view collection event lines" ON public.po_collection_event_lines;
CREATE POLICY "Authenticated users can view collection event lines"
  ON public.po_collection_event_lines FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Authenticated users can add collection event lines" ON public.po_collection_event_lines;
CREATE POLICY "Authenticated users can add collection event lines"
  ON public.po_collection_event_lines FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.po_collection_events e
      WHERE e.id = event_id AND e.collected_by = auth.uid()
    )
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.po_collection_state TO authenticated;
GRANT SELECT, INSERT ON public.po_collection_events TO authenticated;
GRANT SELECT, INSERT ON public.po_collection_event_lines TO authenticated;
GRANT ALL ON public.po_collection_state, public.po_collection_events, public.po_collection_event_lines TO service_role;

-- Keep collection-state records warm whenever the webhook-driven PO cache changes.
-- This does not decide whether a PO is finished: the UI subtracts immutable collection
-- events from the current unbilled line quantities so partial POs automatically reappear.
CREATE OR REPLACE FUNCTION public.sync_po_collection_state_from_cache()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  po jsonb;
  cfg public.fulfillment_settings%ROWTYPE;
  candidate uuid;
BEGIN
  IF NEW.payload IS NULL OR jsonb_typeof(NEW.payload) <> 'array' THEN
    RETURN NEW;
  END IF;

  SELECT * INTO cfg FROM public.fulfillment_settings WHERE id = true;

  FOR po IN SELECT * FROM jsonb_array_elements(NEW.payload)
  LOOP
    candidate := NULL;

    IF COALESCE(cfg.auto_assign_enabled, false) THEN
      SELECT p.id INTO candidate
      FROM public.profiles p
      JOIN public.user_roles ur ON ur.user_id = p.id
      LEFT JOIN public.po_collection_state pcs
        ON pcs.assigned_to = p.id AND pcs.status <> 'collected'
      WHERE COALESCE(p.approved, false) = true
        AND ur.role IN ('admin'::public.app_role, 'user'::public.app_role)
      GROUP BY p.id, p.full_name
      ORDER BY COUNT(pcs.purchase_order_id) ASC, p.full_name NULLS LAST, p.id
      LIMIT 1;
    END IF;

    INSERT INTO public.po_collection_state (
      purchase_order_id,
      purchase_order_number,
      vendor_id,
      vendor_name,
      assigned_to,
      last_seen_at,
      updated_at
    ) VALUES (
      COALESCE(po->>'purchaseOrderId', po->>'purchaseorder_id'),
      COALESCE(po->>'purchaseOrderNumber', po->>'purchaseorder_number', 'Unknown PO'),
      COALESCE(po->>'vendorId', po->>'vendor_id'),
      COALESCE(po->>'vendorName', po->>'vendor_name', 'Unknown supplier'),
      candidate,
      now(),
      now()
    )
    ON CONFLICT (purchase_order_id) DO UPDATE SET
      purchase_order_number = EXCLUDED.purchase_order_number,
      vendor_id = EXCLUDED.vendor_id,
      vendor_name = EXCLUDED.vendor_name,
      assigned_to = COALESCE(public.po_collection_state.assigned_to, EXCLUDED.assigned_to),
      last_seen_at = now(),
      updated_at = now();
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_po_collection_state_from_cache ON public.po_tracking_cache;
CREATE TRIGGER trg_sync_po_collection_state_from_cache
AFTER INSERT OR UPDATE OF payload ON public.po_tracking_cache
FOR EACH ROW EXECUTE FUNCTION public.sync_po_collection_state_from_cache();

-- Existing cache rows are also upserted by the Fulfillment UI on first load.

-- Collection is now supplier-PO based. Customer sales orders always use the Delivery lane.
UPDATE public.fulfillment_settings
SET default_method = 'delivery', updated_at = now()
WHERE id = true;

UPDATE public.orders
SET
  fulfillment_method = 'delivery',
  fulfillment_status = CASE WHEN fulfillment_status = 'ready-for-collection' THEN 'pending' ELSE fulfillment_status END,
  fulfillment_routed_at = COALESCE(fulfillment_routed_at, now())
WHERE COALESCE(status, '') <> 'delivered'
  AND fulfillment_method = 'collection';

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

  IF COALESCE(cfg.auto_assign_enabled, false) THEN
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
    fulfillment_method = 'delivery',
    fulfillment_assigned_to = COALESCE(fulfillment_assigned_to, candidate),
    fulfillment_status = CASE WHEN fulfillment_status = 'ready-for-collection' THEN 'pending' ELSE COALESCE(fulfillment_status, 'pending') END,
    fulfillment_routed_at = COALESCE(fulfillment_routed_at, now())
  WHERE id = NEW.order_id;

  RETURN NEW;
END;
$$;
