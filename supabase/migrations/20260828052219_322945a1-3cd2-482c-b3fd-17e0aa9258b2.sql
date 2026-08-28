-- Round 8: fulfillment truth reconciliation
UPDATE public.orders
SET fulfillment_status = 'completed',
    fulfillment_scheduled_for = NULL,
    completed_date = COALESCE(completed_date, updated_at, now())
WHERE lower(COALESCE(status, '')) = 'delivered'
   OR completed_date IS NOT NULL;

UPDATE public.orders o
SET status = 'delivered',
    fulfillment_status = 'completed',
    fulfillment_scheduled_for = NULL,
    completed_date = COALESCE(o.completed_date, now()),
    updated_at = now()
WHERE lower(COALESCE(o.status, '')) <> 'delivered'
  AND EXISTS (SELECT 1 FROM public.order_items oi WHERE oi.order_id = o.id)
  AND NOT EXISTS (
    SELECT 1 FROM public.order_items oi
    WHERE oi.order_id = o.id
      AND COALESCE(oi.qty_completed, 0) < COALESCE(oi.quantity, 0)
  );

UPDATE public.po_collection_state pcs
SET status = 'collected',
    scheduled_for = NULL,
    completed_at = COALESCE(
      pcs.completed_at,
      (SELECT MAX(e.collected_at) FROM public.po_collection_events e
        WHERE e.purchase_order_id = pcs.purchase_order_id AND e.fully_collected = true),
      now()
    ),
    updated_at = now()
WHERE EXISTS (
  SELECT 1 FROM public.po_collection_events e
  WHERE e.purchase_order_id = pcs.purchase_order_id AND e.fully_collected = true
);

UPDATE public.po_collection_state
SET completed_at = COALESCE(completed_at, updated_at, now()),
    scheduled_for = NULL,
    updated_at = now()
WHERE status = 'collected';

NOTIFY pgrst, 'reload schema';