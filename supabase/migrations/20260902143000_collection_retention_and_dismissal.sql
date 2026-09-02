-- Keep Collections operationally current and make manual removal durable.
ALTER TABLE public.po_collection_state
  ADD COLUMN IF NOT EXISTS dismissed_at timestamptz,
  ADD COLUMN IF NOT EXISTS dismissed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_po_collection_state_visible
  ON public.po_collection_state (last_seen_at DESC)
  WHERE dismissed_at IS NULL AND completed_at IS NULL;

-- Retire stale state rows already created by older cache synchronizers.
UPDATE public.po_collection_state pcs
SET dismissed_at = now(), updated_at = now()
WHERE pcs.dismissed_at IS NULL
  AND pcs.completed_at IS NULL
  AND (
    pcs.last_seen_at < now() - interval '21 days'
    OR EXISTS (
      SELECT 1
      FROM public.po_tracking_cache cache
      CROSS JOIN LATERAL jsonb_array_elements(
        CASE WHEN jsonb_typeof(cache.payload) = 'array' THEN cache.payload ELSE '[]'::jsonb END
      ) entry
      WHERE cache.id = '00000000-0000-0000-0000-000000000003'::uuid
        AND COALESCE(entry->>'purchaseOrderId', entry->>'purchaseorder_id') = pcs.purchase_order_id
        AND (
          COALESCE(entry->>'date', '') !~ '^\d{4}-\d{2}-\d{2}$'
          OR (entry->>'date')::date < current_date - 21
        )
    )
  );

-- Remove historic records from the shared cache immediately. Subsequent
-- recovery syncs and webhooks enforce the same cutoff before writing.
UPDATE public.po_tracking_cache cache
SET payload = COALESCE((
      SELECT jsonb_agg(entry ORDER BY entry->>'date' DESC)
      FROM jsonb_array_elements(
        CASE WHEN jsonb_typeof(cache.payload) = 'array' THEN cache.payload ELSE '[]'::jsonb END
      ) entry
      WHERE COALESCE(entry->>'date', '') ~ '^\d{4}-\d{2}-\d{2}$'
        AND (entry->>'date')::date >= current_date - 21
    ), '[]'::jsonb),
    fetched_at = now()
WHERE cache.id = '00000000-0000-0000-0000-000000000003'::uuid;

-- Dismissed collections must also disappear from each user's overdue inbox.
CREATE OR REPLACE FUNCTION public.generate_my_overdue_fulfillment_notifications()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target uuid := auth.uid();
  inserted_count integer := 0;
  row_count_value integer := 0;
BEGIN
  IF target IS NULL THEN RETURN 0; END IF;

  INSERT INTO public.notifications (user_id, type, title, message, order_id, order_number, metadata)
  SELECT target, 'overdue_fulfillment', 'Delivery overdue',
    'Delivery ' || o.order_number || ' is overdue and still assigned to you.',
    o.id, o.order_number,
    jsonb_build_object('kind','delivery','entity_type','delivery','entity_id',o.id)
  FROM public.orders o
  WHERE o.fulfillment_assigned_to = target
    AND o.fulfillment_scheduled_for < now()
    AND o.completed_date IS NULL
    AND COALESCE(o.fulfillment_status, 'pending') <> 'completed'
    AND NOT EXISTS (
      SELECT 1 FROM public.notifications n
      WHERE n.user_id = target AND n.type = 'overdue_fulfillment'
        AND n.order_id = o.id AND n.created_at > now() - interval '24 hours'
    );
  GET DIAGNOSTICS row_count_value = ROW_COUNT;
  inserted_count := inserted_count + row_count_value;

  INSERT INTO public.notifications (user_id, type, title, message, order_number, metadata)
  SELECT target, 'overdue_fulfillment', 'Collection overdue',
    'Supplier collection ' || pcs.purchase_order_number || ' is overdue and still assigned to you.',
    pcs.purchase_order_number,
    jsonb_build_object('kind','collection','entity_type','collection','entity_id',pcs.purchase_order_id,'purchase_order_id',pcs.purchase_order_id)
  FROM public.po_collection_state pcs
  WHERE pcs.assigned_to = target
    AND pcs.scheduled_for < now()
    AND pcs.completed_at IS NULL
    AND pcs.dismissed_at IS NULL
    AND COALESCE(pcs.status, 'pending') <> 'collected'
    AND NOT EXISTS (
      SELECT 1 FROM public.notifications n
      WHERE n.user_id = target AND n.type = 'overdue_fulfillment'
        AND n.metadata->>'purchase_order_id' = pcs.purchase_order_id
        AND n.created_at > now() - interval '24 hours'
    );
  GET DIAGNOSTICS row_count_value = ROW_COUNT;
  RETURN inserted_count + row_count_value;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.generate_my_overdue_fulfillment_notifications() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.generate_my_overdue_fulfillment_notifications() TO authenticated;
