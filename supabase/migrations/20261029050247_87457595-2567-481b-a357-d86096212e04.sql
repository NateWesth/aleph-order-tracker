DO $$
DECLARE r record; q text; c text; s text;
BEGIN
  FOR r IN SELECT tablename, policyname, cmd, qual, with_check FROM pg_policies
    WHERE schemaname='public' AND tablename IN ('dispatch_areas','order_items','team_action_items','companies','order_templates','operations_exceptions','fulfillment_timeline_events','order_tags','order_purchase_orders','order_item_po_allocations','dispatch_routes','dispatch_area_links','items','orders','suppliers','order_tag_assignments','return_cases','po_collection_state','entity_comments','product_substitutions','po_tracking_cache','order_item_comments','po_collection_events','sharpening_jobs','loan_assets','repair_tickets','order_item_comment_reactions','buying_sheet_cache','entity_comment_reactions','operational_rules','order_relationships','po_collection_event_lines','calibration_assets','fulfillment_settings')
    AND (qual IN ('true','(auth.uid() IS NOT NULL)') OR with_check IN ('true','(auth.uid() IS NOT NULL)'))
  LOOP
    s := '(public.is_user_approved(auth.uid()) OR public.has_role(auth.uid(), ''admin''::public.app_role))';
    q := ''; c := '';
    IF r.qual IN ('true','(auth.uid() IS NOT NULL)') THEN q := ' USING ' || s; END IF;
    IF r.with_check IN ('true','(auth.uid() IS NOT NULL)') THEN c := ' WITH CHECK ' || s; END IF;
    EXECUTE format('ALTER POLICY %I ON public.%I', r.policyname, r.tablename) || q || c;
  END LOOP;
END $$;