CREATE TABLE public.stock_alert_state (
 sku text PRIMARY KEY,
 active boolean NOT NULL DEFAULT false,
 episode uuid NOT NULL DEFAULT gen_random_uuid(),
 stock_on_hand numeric,
 daily_demand numeric,
 days_remaining integer,
 stock_updated_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.stock_alert_state TO authenticated;
GRANT ALL ON public.stock_alert_state TO service_role;
ALTER TABLE public.stock_alert_state ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Approved staff can view stock shortages" ON public.stock_alert_state FOR SELECT TO authenticated USING (public.is_user_approved(auth.uid()));

CREATE OR REPLACE FUNCTION public.touch_stock_alert_state()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END;
$$;
CREATE TRIGGER touch_stock_alert_state BEFORE UPDATE ON public.stock_alert_state FOR EACH ROW EXECUTE FUNCTION public.touch_stock_alert_state();
REVOKE ALL ON FUNCTION public.touch_stock_alert_state() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.touch_stock_alert_state() TO service_role;

CREATE OR REPLACE FUNCTION public.stock_alert_days(p_entry jsonb, p_daily numeric, p_now timestamptz)
RETURNS integer LANGUAGE plpgsql STABLE SET search_path = public AS $$
DECLARE observed timestamptz; quantity numeric;
BEGIN
 IF p_daily IS NULL OR p_daily <= 0 OR jsonb_typeof(p_entry->'stockOnHand') IS DISTINCT FROM 'number' OR jsonb_typeof(p_entry->'stockUpdatedAt') IS DISTINCT FROM 'string' THEN RETURN NULL; END IF;
 observed := (p_entry->>'stockUpdatedAt')::timestamptz;
 IF observed > p_now OR observed < p_now - interval '24 hours' THEN RETURN NULL; END IF;
 quantity := (p_entry->>'stockOnHand')::numeric;
 RETURN floor(greatest(0, quantity) / p_daily)::integer;
EXCEPTION WHEN invalid_datetime_format OR datetime_field_overflow OR numeric_value_out_of_range OR invalid_text_representation THEN RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.stock_alert_days(jsonb,numeric,timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.stock_alert_days(jsonb,numeric,timestamptz) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.emit_stock_depletion_notifications(p_payload jsonb)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE item record; previous public.stock_alert_state%ROWTYPE; emitted integer := 0; count_added integer; current_time timestamptz := now();
BEGIN
 IF jsonb_typeof(p_payload) IS DISTINCT FROM 'object' THEN RETURN 0; END IF;
 IF NOT pg_try_advisory_xact_lock(hashtext('aleph-stock-depletion-notifications')) THEN RETURN 0; END IF;
 FOR item IN
  WITH history AS (
   SELECT upper(trim(code)) sku,
    (coalesce(sum(greatest(coalesce(nullif(quantity,0),1),0)) FILTER (WHERE created_at >= date_trunc('month',current_time)-interval '1 month'),0)*0.7
     + coalesce(sum(greatest(coalesce(nullif(quantity,0),1),0)) FILTER (WHERE created_at < date_trunc('month',current_time)-interval '1 month'),0)*0.3)/30.0 daily
   FROM public.order_items
   WHERE created_at >= date_trunc('month',current_time)-interval '2 months' AND created_at < date_trunc('month',current_time) AND code IS NOT NULL
   GROUP BY upper(trim(code))
  ), restock AS (
   SELECT upper(trim(code)) sku, round(sum(greatest(coalesce(nullif(quantity,0),1),0))::numeric/count(DISTINCT to_char(completed_at,'YYYY-MM')))/30.0 daily
   FROM public.order_items
   WHERE progress_stage='completed' AND completed_at >= current_time-interval '3 months' AND code IS NOT NULL
   GROUP BY upper(trim(code)) HAVING count(DISTINCT to_char(completed_at,'YYYY-MM')) >= 2
  ), active AS (
   SELECT DISTINCT upper(trim(code)) sku FROM public.order_items WHERE progress_stage='awaiting-stock' AND code IS NOT NULL
  ), candidates AS (
   SELECT a.sku, coalesce(h.daily,0) daily FROM active a LEFT JOIN history h USING(sku)
   UNION ALL SELECT r.sku,r.daily FROM restock r WHERE NOT EXISTS(SELECT 1 FROM active a WHERE a.sku=r.sku)
  )
  SELECT c.sku,c.daily, e.value entry, public.stock_alert_days(e.value,c.daily,current_time) remaining
  FROM candidates c JOIN jsonb_each(p_payload) e ON upper(trim(e.key))=c.sku
  WHERE c.sku NOT IN ('','M-MISC','M-MISCELLANEOUS','MISC','MISCELLANEOUS','NO-SKU')
 LOOP
  IF item.remaining IS NULL THEN CONTINUE; END IF;
  INSERT INTO public.stock_alert_state(sku) VALUES(item.sku) ON CONFLICT(sku) DO NOTHING;
  SELECT * INTO previous FROM public.stock_alert_state WHERE sku=item.sku FOR UPDATE;
  IF item.remaining <= 7 AND NOT previous.active THEN
   UPDATE public.stock_alert_state SET active=true, episode=gen_random_uuid(), stock_on_hand=(item.entry->>'stockOnHand')::numeric, daily_demand=item.daily, days_remaining=item.remaining, stock_updated_at=(item.entry->>'stockUpdatedAt')::timestamptz WHERE sku=item.sku RETURNING * INTO previous;
   INSERT INTO public.notifications(user_id,type,title,message,metadata)
   SELECT p.id,'stock_low','Low stock: '||item.sku,
    item.sku||' has '||(item.entry->>'stockOnHand')||' units on hand and is expected to run out in about '||item.remaining||' days. Stock checked '||(item.entry->>'stockUpdatedAt')||'.',
    jsonb_build_object('kind','stock','sku',item.sku,'episode',previous.episode,'days_remaining',item.remaining,'warning_days',7,'stock_updated_at',item.entry->>'stockUpdatedAt')
   FROM public.profiles p WHERE p.approved IS TRUE;
   GET DIAGNOSTICS count_added = ROW_COUNT;
   emitted := emitted + count_added;
  ELSE
   UPDATE public.stock_alert_state SET active=(item.remaining <= 7),stock_on_hand=(item.entry->>'stockOnHand')::numeric,daily_demand=item.daily,days_remaining=item.remaining,stock_updated_at=(item.entry->>'stockUpdatedAt')::timestamptz WHERE sku=item.sku;
  END IF;
 END LOOP;
 RETURN emitted;
END;
$$;
REVOKE ALL ON FUNCTION public.emit_stock_depletion_notifications(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.emit_stock_depletion_notifications(jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.notify_stock_snapshot_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
 IF NEW.id <> 'buying-sheet' THEN RETURN NEW; END IF;
 IF TG_OP='UPDATE' AND NEW.payload IS NOT DISTINCT FROM OLD.payload THEN RETURN NEW; END IF;
 PERFORM public.emit_stock_depletion_notifications(NEW.payload);
 RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.notify_stock_snapshot_change() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.notify_stock_snapshot_change() TO service_role;
CREATE TRIGGER notify_stock_snapshot_change AFTER INSERT OR UPDATE OF payload ON public.buying_sheet_cache FOR EACH ROW EXECUTE FUNCTION public.notify_stock_snapshot_change();

DO $$
DECLARE definition text;
BEGIN
 definition := pg_get_functiondef('public.dispatch_comment_push()'::regprocedure);
 IF position('''stock_low''' IN definition)=0 THEN
  IF position('''entity_comment'',''comment_reply''' IN definition)=0 THEN RAISE EXCEPTION 'Existing push notification type list could not be found'; END IF;
  definition := replace(definition,'''entity_comment'',''comment_reply''','''stock_low'',''entity_comment'',''comment_reply''');
  EXECUTE definition;
 END IF;
END;
$$;