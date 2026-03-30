
CREATE OR REPLACE FUNCTION public.auto_progress_on_stock_received()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.stock_status = 'in-stock' AND OLD.stock_status IS DISTINCT FROM 'in-stock' 
     AND NEW.progress_stage = 'awaiting-stock' THEN
    NEW.progress_stage := 'ready-for-delivery';
  END IF;
  RETURN NEW;
END;
$function$;
