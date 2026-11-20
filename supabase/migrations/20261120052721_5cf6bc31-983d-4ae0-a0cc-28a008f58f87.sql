ALTER TABLE public.commission_bill_cache ADD COLUMN IF NOT EXISTS vendor_name text;

CREATE OR REPLACE FUNCTION public.get_supplier_price_history(p_skus text[])
RETURNS TABLE(sku text, bill_date date, unit_rate numeric, vendor_name text, bill_id text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT (public.is_user_approved(auth.uid()) OR public.is_admin()) THEN
    RAISE EXCEPTION 'Not authorised';
  END IF;
  IF p_skus IS NULL OR array_length(p_skus,1) IS NULL THEN RETURN; END IF;
  IF array_length(p_skus,1) > 2000 THEN RAISE EXCEPTION 'Too many items'; END IF;
  RETURN QUERY
  SELECT lower(trim(coalesce(li->>'sku', li->>'item_code'))) AS sku,
         NULLIF(c.bill_date,'')::date,
         coalesce(NULLIF(li->>'rate','')::numeric, NULLIF(li->>'item_rate','')::numeric),
         c.vendor_name, c.bill_id
  FROM public.commission_bill_cache c
  CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(c.line_items)='array' THEN c.line_items ELSE '[]'::jsonb END) li
  WHERE lower(trim(coalesce(li->>'sku', li->>'item_code'))) = ANY (SELECT lower(trim(x)) FROM unnest(p_skus) x WHERE coalesce(trim(x),'') <> '')
    AND coalesce(NULLIF(li->>'rate','')::numeric, NULLIF(li->>'item_rate','')::numeric) > 0
    AND c.bill_date ~ '^\d{4}-\d{2}-\d{2}'
  ORDER BY 1, 2 DESC
  LIMIT 20000;
END $$;
REVOKE ALL ON FUNCTION public.get_supplier_price_history(text[]) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_supplier_price_history(text[]) TO authenticated;