-- Atomic workflow commands for the rebuilt Delivery & Collection workspace.

CREATE OR REPLACE FUNCTION public.complete_fulfillment_delivery(p_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_order public.orders%ROWTYPE;
  changed_lines integer := 0;
  fully_done boolean := false;
  completed_at_value timestamptz := now();
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT * INTO target_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found'; END IF;

  UPDATE public.order_items
  SET
    qty_completed = LEAST(COALESCE(qty_invoiced, 0), COALESCE(quantity, 0)),
    updated_at = completed_at_value
  WHERE order_id = p_order_id
    AND GREATEST(0,
      LEAST(COALESCE(qty_invoiced, 0), COALESCE(quantity, 0))
      - LEAST(COALESCE(qty_completed, 0), COALESCE(quantity, 0))
    ) > 0;
  GET DIAGNOSTICS changed_lines = ROW_COUNT;

  IF changed_lines = 0 THEN
    RAISE EXCEPTION 'No invoiced quantities are ready to deliver';
  END IF;

  SELECT NOT EXISTS (
    SELECT 1 FROM public.order_items
    WHERE order_id = p_order_id
      AND LEAST(COALESCE(qty_completed, 0), COALESCE(quantity, 0)) < COALESCE(quantity, 0)
  ) INTO fully_done;

  UPDATE public.orders
  SET
    fulfillment_status = CASE WHEN fully_done THEN 'completed' ELSE 'pending' END,
    status = CASE WHEN fully_done THEN 'delivered' ELSE status END,
    completed_date = CASE WHEN fully_done THEN completed_at_value ELSE completed_date END,
    fulfillment_scheduled_for = NULL,
    updated_at = completed_at_value
  WHERE id = p_order_id;

  INSERT INTO public.order_activity_log (order_id, activity_type, title, description, user_id)
  VALUES (
    p_order_id,
    'fulfillment_delivery',
    CASE WHEN fully_done THEN 'Delivery completed' ELSE 'Partial delivery completed' END,
    CASE
      WHEN fully_done THEN target_order.order_number || ' moved to Delivery History.'
      ELSE changed_lines || ' ready line(s) delivered; remaining quantities stay active.'
    END,
    auth.uid()
  );

  RETURN jsonb_build_object(
    'order_id', p_order_id,
    'fully_done', fully_done,
    'changed_lines', changed_lines,
    'completed_at', completed_at_value
  );
END;
$$;

REVOKE ALL ON FUNCTION public.complete_fulfillment_delivery(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.complete_fulfillment_delivery(uuid) TO authenticated;

-- Two-week fulfillment: methods, priority, and quantity-ledger sync
ALTER TABLE public.po_collection_state
  ADD COLUMN IF NOT EXISTS collection_method text NOT NULL DEFAULT 'pickup',
  ADD COLUMN IF NOT EXISTS is_urgent boolean NOT NULL DEFAULT false;

ALTER TABLE public.po_collection_state
  DROP CONSTRAINT IF EXISTS po_collection_state_collection_method_check;
ALTER TABLE public.po_collection_state
  ADD CONSTRAINT po_collection_state_collection_method_check
  CHECK (collection_method IN ('pickup', 'supplier-delivery'));

CREATE INDEX IF NOT EXISTS idx_po_collection_state_urgent
  ON public.po_collection_state (is_urgent, scheduled_for)
  WHERE status <> 'collected';

DROP FUNCTION IF EXISTS public.record_po_collection(text, text, text, text, jsonb, boolean, text, jsonb);

CREATE OR REPLACE FUNCTION public.record_po_collection(
  p_purchase_order_id text,
  p_purchase_order_number text,
  p_vendor_id text,
  p_vendor_name text,
  p_lines jsonb,
  p_fully_collected boolean,
  p_notes text DEFAULT NULL,
  p_source_snapshot jsonb DEFAULT '{}'::jsonb,
  p_collection_method text DEFAULT 'pickup'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  event_id_value uuid;
  total_units_value numeric;
  line_count_value integer;
  synced_units_value integer := 0;
  remaining_to_apply integer;
  take_units integer;
  line_record record;
  allocation_record record;
  fallback_record record;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF COALESCE(trim(p_purchase_order_id), '') = '' THEN RAISE EXCEPTION 'Purchase-order id is required'; END IF;
  IF COALESCE(p_collection_method, 'pickup') NOT IN ('pickup', 'supplier-delivery') THEN
    RAISE EXCEPTION 'Invalid collection method';
  END IF;
  IF jsonb_typeof(p_lines) <> 'array' OR jsonb_array_length(p_lines) = 0 THEN
    RAISE EXCEPTION 'At least one received line is required';
  END IF;

  SELECT COALESCE(SUM(quantity_collected), 0), COUNT(*)
  INTO total_units_value, line_count_value
  FROM jsonb_to_recordset(p_lines) AS line(
    line_key text, sku text, name text, description text,
    quantity_collected numeric, source_unbilled_quantity numeric
  )
  WHERE quantity_collected > 0;

  IF total_units_value <= 0 OR line_count_value = 0 THEN
    RAISE EXCEPTION 'Received quantities must be greater than zero';
  END IF;

  INSERT INTO public.po_collection_events (
    purchase_order_id, purchase_order_number, vendor_id, vendor_name,
    collected_by, total_units, fully_collected, notes, source_snapshot
  ) VALUES (
    p_purchase_order_id,
    COALESCE(NULLIF(trim(p_purchase_order_number), ''), 'Unknown PO'),
    NULLIF(trim(COALESCE(p_vendor_id, '')), ''),
    COALESCE(NULLIF(trim(p_vendor_name), ''), 'Unknown supplier'),
    auth.uid(), total_units_value, COALESCE(p_fully_collected, false),
    NULLIF(trim(COALESCE(p_notes, '')), ''),
    COALESCE(p_source_snapshot, '{}'::jsonb) || jsonb_build_object('collectionMethod', p_collection_method)
  ) RETURNING id INTO event_id_value;

  INSERT INTO public.po_collection_event_lines (
    event_id, line_key, sku, name, description,
    quantity_collected, source_unbilled_quantity
  )
  SELECT
    event_id_value, line.line_key,
    NULLIF(trim(COALESCE(line.sku, '')), ''),
    COALESCE(NULLIF(trim(line.name), ''), 'PO item'),
    NULLIF(trim(COALESCE(line.description, '')), ''),
    line.quantity_collected,
    GREATEST(0, COALESCE(line.source_unbilled_quantity, 0))
  FROM jsonb_to_recordset(p_lines) AS line(
    line_key text, sku text, name text, description text,
    quantity_collected numeric, source_unbilled_quantity numeric
  )
  WHERE line.quantity_collected > 0;

  FOR line_record IN
    SELECT * FROM jsonb_to_recordset(p_lines) AS line(
      line_key text, sku text, name text, description text,
      quantity_collected numeric, source_unbilled_quantity numeric
    )
    WHERE quantity_collected > 0
  LOOP
    remaining_to_apply := GREATEST(0, floor(line_record.quantity_collected)::integer);

    FOR allocation_record IN
      SELECT a.id, a.order_item_id, a.quantity_ordered, a.quantity_received
      FROM public.order_item_po_allocations a
      WHERE (
          a.zoho_purchaseorder_id = p_purchase_order_id
          OR upper(trim(COALESCE(a.purchase_order_number, ''))) = upper(trim(COALESCE(p_purchase_order_number, '')))
        )
        AND NULLIF(lower(trim(COALESCE(line_record.sku, ''))), '') IS NOT NULL
        AND lower(trim(COALESCE(a.sku, ''))) = lower(trim(line_record.sku))
        AND a.quantity_received < a.quantity_ordered
      ORDER BY a.created_at, a.id
      FOR UPDATE
    LOOP
      EXIT WHEN remaining_to_apply <= 0;
      take_units := LEAST(
        remaining_to_apply,
        GREATEST(0, allocation_record.quantity_ordered - allocation_record.quantity_received)
      );
      IF take_units <= 0 THEN CONTINUE; END IF;

      UPDATE public.order_item_po_allocations
      SET quantity_received = LEAST(quantity_ordered, quantity_received + take_units), updated_at = now()
      WHERE id = allocation_record.id;

      UPDATE public.order_items
      SET qty_received = LEAST(qty_on_po, COALESCE(qty_received, 0) + take_units), updated_at = now()
      WHERE id = allocation_record.order_item_id;

      remaining_to_apply := remaining_to_apply - take_units;
      synced_units_value := synced_units_value + take_units;
    END LOOP;

    IF remaining_to_apply > 0 THEN
      FOR fallback_record IN
        SELECT oi.id, oi.qty_on_po, oi.qty_received
        FROM public.order_items oi
        WHERE EXISTS (
            SELECT 1
            FROM public.order_purchase_orders opo
            WHERE opo.order_id = oi.order_id
              AND upper(trim(opo.purchase_order_number)) = upper(trim(COALESCE(p_purchase_order_number, '')))
          )
          AND COALESCE(oi.qty_received, 0) < COALESCE(oi.qty_on_po, 0)
          AND (
            (
              NULLIF(lower(trim(COALESCE(line_record.sku, ''))), '') IS NOT NULL
              AND lower(trim(COALESCE(oi.code, ''))) = lower(trim(line_record.sku))
            )
            OR (
              NULLIF(lower(trim(COALESCE(line_record.sku, ''))), '') IS NULL
              AND lower(trim(COALESCE(oi.name, ''))) = lower(trim(COALESCE(line_record.name, '')))
            )
          )
        ORDER BY oi.id
        FOR UPDATE OF oi
      LOOP
        EXIT WHEN remaining_to_apply <= 0;
        take_units := LEAST(remaining_to_apply, GREATEST(0, fallback_record.qty_on_po - fallback_record.qty_received));
        IF take_units <= 0 THEN CONTINUE; END IF;
        UPDATE public.order_items
        SET qty_received = LEAST(qty_on_po, COALESCE(qty_received, 0) + take_units), updated_at = now()
        WHERE id = fallback_record.id;
        remaining_to_apply := remaining_to_apply - take_units;
        synced_units_value := synced_units_value + take_units;
      END LOOP;
    END IF;
  END LOOP;

  INSERT INTO public.po_collection_state (
    purchase_order_id, purchase_order_number, vendor_id, vendor_name,
    assigned_to, status, scheduled_for, completed_at, notes,
    collection_method, last_seen_at, updated_at
  ) VALUES (
    p_purchase_order_id,
    COALESCE(NULLIF(trim(p_purchase_order_number), ''), 'Unknown PO'),
    NULLIF(trim(COALESCE(p_vendor_id, '')), ''),
    COALESCE(NULLIF(trim(p_vendor_name), ''), 'Unknown supplier'),
    auth.uid(), CASE WHEN p_fully_collected THEN 'collected' ELSE 'pending' END,
    NULL, CASE WHEN p_fully_collected THEN now() ELSE NULL END,
    NULLIF(trim(COALESCE(p_notes, '')), ''), COALESCE(p_collection_method, 'pickup'), now(), now()
  )
  ON CONFLICT (purchase_order_id) DO UPDATE SET
    purchase_order_number = EXCLUDED.purchase_order_number,
    vendor_id = EXCLUDED.vendor_id,
    vendor_name = EXCLUDED.vendor_name,
    assigned_to = COALESCE(public.po_collection_state.assigned_to, EXCLUDED.assigned_to),
    status = EXCLUDED.status,
    scheduled_for = CASE WHEN p_fully_collected THEN NULL ELSE public.po_collection_state.scheduled_for END,
    completed_at = EXCLUDED.completed_at,
    notes = COALESCE(EXCLUDED.notes, public.po_collection_state.notes),
    collection_method = EXCLUDED.collection_method,
    last_seen_at = now(),
    updated_at = now();

  RETURN jsonb_build_object(
    'event_id', event_id_value,
    'total_units', total_units_value,
    'line_count', line_count_value,
    'fully_collected', p_fully_collected,
    'order_units_synced', synced_units_value,
    'collection_method', p_collection_method
  );
END;
$$;

REVOKE ALL ON FUNCTION public.record_po_collection(text, text, text, text, jsonb, boolean, text, jsonb, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_po_collection(text, text, text, text, jsonb, boolean, text, jsonb, text) TO authenticated;