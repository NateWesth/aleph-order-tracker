DO $$
DECLARE definition text;
BEGIN
 definition := pg_get_functiondef('public.emit_stock_depletion_notifications(jsonb)'::regprocedure);
 definition := replace(definition,'current_time','v_now');
 EXECUTE definition;
END;
$$;
CREATE OR REPLACE FUNCTION public.stock_alert_days(p_entry jsonb,p_daily numeric,p_now timestamptz)
RETURNS integer LANGUAGE plpgsql STABLE SET search_path = public AS $$
DECLARE observed timestamptz; quantity numeric;
BEGIN
 IF p_daily IS NULL OR p_daily <= 0 OR jsonb_typeof(p_entry->'stockOnHand') IS DISTINCT FROM 'number' OR jsonb_typeof(p_entry->'stockUpdatedAt') IS DISTINCT FROM 'string' THEN RETURN NULL; END IF;
 observed := (p_entry->>'stockUpdatedAt')::timestamptz;
 IF observed > p_now OR observed < p_now-interval '24 hours' THEN RETURN NULL; END IF;
 quantity := (p_entry->>'stockOnHand')::numeric;
 RETURN ceil(greatest(0,quantity)/p_daily)::integer;
EXCEPTION WHEN invalid_datetime_format OR datetime_field_overflow OR numeric_value_out_of_range OR invalid_text_representation THEN RETURN NULL;
END;
$$;