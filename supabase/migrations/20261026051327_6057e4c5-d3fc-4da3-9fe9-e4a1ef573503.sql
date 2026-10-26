CREATE OR REPLACE FUNCTION public.get_buying_sheet_live_coverage()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE result jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  WITH po_lines AS (
    SELECT upper(trim(li->>'sku')) AS sku,
           d.payload->>'purchaseorder_number' AS po_number,
           d.payload->>'vendor_name' AS vendor_name,
           d.payload->>'date' AS po_date,
           greatest(0, coalesce((li->>'quantity')::numeric,0)
             - greatest(coalesce((li->>'quantity_billed')::numeric,0), coalesce((li->>'quantity_marked_as_received')::numeric,0))
             - coalesce((li->>'quantity_cancelled')::numeric,0)) AS outstanding
    FROM zoho_document_cache d, jsonb_array_elements(coalesce(d.payload->'line_items','[]'::jsonb)) li
    WHERE d.document_type = 'purchase_order'
      AND coalesce(d.payload->>'order_status','') NOT IN ('closed','cancelled')
      AND coalesce(d.payload->>'status','') NOT IN ('cancelled','draft','closed','billed','void')
      AND coalesce(d.payload->>'received_status','') NOT IN ('received','fully_received')
      AND coalesce(li->>'sku','') <> ''
  ), po AS (
    SELECT sku, sum(outstanding) AS outstanding,
           jsonb_agg(DISTINCT po_number) AS po_numbers,
           (array_agg(vendor_name ORDER BY po_date DESC))[1] AS vendor_name
    FROM po_lines WHERE outstanding > 0 GROUP BY sku
  ), inv_lines AS (
    SELECT d.payload->>'reference_number' AS ref,
           ARRAY(SELECT s->>'salesorder_number' FROM jsonb_array_elements(coalesce(d.payload->'salesorders','[]'::jsonb)) s) AS sos,
           upper(trim(li->>'sku')) AS sku,
           coalesce((li->>'quantity')::numeric,0) AS qty
    FROM zoho_document_cache d, jsonb_array_elements(coalesce(d.payload->'line_items','[]'::jsonb)) li
    WHERE d.document_type = 'invoice'
      AND coalesce(d.payload->>'status','') NOT IN ('void','draft')
      AND coalesce(li->>'sku','') <> ''
  ), invoiced AS (
    SELECT o.id AS order_id, i.sku, sum(i.qty) AS qty
    FROM orders o JOIN inv_lines i ON (i.ref = o.order_number OR o.order_number = ANY(i.sos))
    WHERE o.completed_date IS NULL
    GROUP BY o.id, i.sku
  )
  SELECT jsonb_build_object(
    'asOf', (SELECT max(synced_at) FROM zoho_document_cache WHERE document_type IN ('purchase_order','invoice')),
    'purchaseOrders', coalesce((SELECT jsonb_object_agg(sku, jsonb_build_object('outstanding', outstanding, 'poNumbers', po_numbers, 'vendorName', vendor_name)) FROM po), '{}'::jsonb),
    'invoiced', coalesce((SELECT jsonb_agg(jsonb_build_object('orderId', order_id, 'sku', sku, 'qty', qty)) FROM invoiced), '[]'::jsonb)
  ) INTO result;
  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_buying_sheet_live_coverage() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_buying_sheet_live_coverage() TO authenticated;