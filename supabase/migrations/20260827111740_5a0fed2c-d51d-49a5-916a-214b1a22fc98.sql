REVOKE EXECUTE ON FUNCTION public.notify_fulfillment_assignment() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_po_collection_assignment() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.touch_operational_rules_updated_at() FROM PUBLIC, anon, authenticated;