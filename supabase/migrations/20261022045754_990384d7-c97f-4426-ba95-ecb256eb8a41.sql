CREATE OR REPLACE FUNCTION public.merge_orders(p_source_order_id uuid, p_target_order_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE source public.orders%ROWTYPE; target public.orders%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND approved IS TRUE) THEN RAISE EXCEPTION 'Approved team access required'; END IF;
  IF p_source_order_id = p_target_order_id THEN RAISE EXCEPTION 'Choose two different orders'; END IF;
  SELECT * INTO source FROM public.orders WHERE id = p_source_order_id FOR UPDATE;
  SELECT * INTO target FROM public.orders WHERE id = p_target_order_id FOR UPDATE;
  IF source.id IS NULL OR target.id IS NULL OR source.status = 'delivered' OR target.status = 'delivered' OR source.completed_date IS NOT NULL OR target.completed_date IS NOT NULL THEN RAISE EXCEPTION 'Both orders must be open'; END IF;
  IF source.company_id IS DISTINCT FROM target.company_id THEN RAISE EXCEPTION 'Orders for different customers cannot be merged'; END IF;
  UPDATE public.order_items SET order_id = target.id, updated_at = now() WHERE order_id = source.id;
  UPDATE public.order_item_po_allocations SET order_id = target.id WHERE order_id = source.id;
  UPDATE public.order_purchase_orders SET order_id = target.id, updated_at = now() WHERE order_id = source.id AND NOT EXISTS (SELECT 1 FROM public.order_purchase_orders existing WHERE existing.order_id = target.id AND existing.purchase_order_number = public.order_purchase_orders.purchase_order_number AND existing.supplier_id IS NOT DISTINCT FROM public.order_purchase_orders.supplier_id);
  DELETE FROM public.order_purchase_orders WHERE order_id = source.id;
  UPDATE public.orders SET status = 'delivered', completed_date = now(), notes = concat_ws(E'\n', notes, '[Merged into ' || target.order_number || ']'), updated_at = now() WHERE id = source.id;
  INSERT INTO public.order_relationships(source_order_id, related_order_id, relationship_type) VALUES (source.id, target.id, 'merged_into');
  INSERT INTO public.order_activity_log(order_id, activity_type, title, description) VALUES (target.id, 'order_merge', 'Orders merged', source.order_number || ' was merged into this order');
  RETURN target.id;
END;
$$;

CREATE OR REPLACE FUNCTION public.apply_item_substitution(p_order_item_id uuid, p_alternative_item_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE current_line public.order_items%ROWTYPE; replacement public.items%ROWTYPE; parent public.orders%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND approved IS TRUE) THEN RAISE EXCEPTION 'Approved team access required'; END IF;
  SELECT * INTO current_line FROM public.order_items WHERE id = p_order_item_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order item not found'; END IF;
  SELECT * INTO parent FROM public.orders WHERE id = current_line.order_id FOR UPDATE;
  IF parent.status = 'delivered' OR parent.completed_date IS NOT NULL THEN RAISE EXCEPTION 'Only open orders can be changed'; END IF;
  IF current_line.qty_on_po > 0 OR current_line.qty_received > 0 OR current_line.qty_invoiced > 0 OR current_line.qty_completed > 0 THEN RAISE EXCEPTION 'A processed item cannot be substituted'; END IF;
  SELECT * INTO replacement FROM public.items WHERE id = p_alternative_item_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Alternative item not found'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.product_substitutions ps JOIN public.items src ON src.id = ps.source_item_id WHERE ps.active AND ps.alternative_item_id = p_alternative_item_id AND src.code = current_line.code) THEN RAISE EXCEPTION 'This alternative is not approved for this product'; END IF;
  UPDATE public.order_items SET name = replacement.name, code = replacement.code, description = replacement.description, notes = concat_ws(E'\n', notes, '[Substituted from ' || coalesce(current_line.code,current_line.name) || ']'), updated_at = now() WHERE id = p_order_item_id;
  INSERT INTO public.order_activity_log(order_id, activity_type, title, description) VALUES (current_line.order_id, 'item_substitution', 'Alternative product applied', coalesce(current_line.code,current_line.name) || ' changed to ' || coalesce(replacement.code,replacement.name));
END;
$$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='product_substitutions') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.product_substitutions;
  END IF;
END $$;