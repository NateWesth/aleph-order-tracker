-- Fix search_path for the protect function to address security warning
CREATE OR REPLACE FUNCTION public.protect_order_critical_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Check if order_number or created_at is being changed
  IF (OLD.order_number IS DISTINCT FROM NEW.order_number) OR 
     (OLD.created_at IS DISTINCT FROM NEW.created_at) THEN
    -- Only allow admins to modify these fields
    IF NOT public.is_admin() THEN
      RAISE EXCEPTION 'Only administrators can modify order number or order date';
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;