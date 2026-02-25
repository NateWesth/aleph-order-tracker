
-- Add completed_at and completed_by columns to order_items for per-item completion tracking
ALTER TABLE public.order_items
  ADD COLUMN completed_at TIMESTAMP WITH TIME ZONE DEFAULT NULL,
  ADD COLUMN completed_by UUID DEFAULT NULL;

-- Create trigger to auto-set completed_at when progress_stage changes to 'completed'
CREATE OR REPLACE FUNCTION public.set_order_item_completed_at()
RETURNS TRIGGER AS $$
BEGIN
  -- When item moves to completed stage, set completed_at if not already set
  IF NEW.progress_stage = 'completed' AND (OLD.progress_stage IS DISTINCT FROM 'completed') THEN
    NEW.completed_at := COALESCE(NEW.completed_at, now());
    NEW.completed_by := COALESCE(NEW.completed_by, auth.uid());
  END IF;
  
  -- When item moves away from completed, clear completed_at
  IF NEW.progress_stage != 'completed' AND OLD.progress_stage = 'completed' THEN
    NEW.completed_at := NULL;
    NEW.completed_by := NULL;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER set_item_completed_at
  BEFORE UPDATE ON public.order_items
  FOR EACH ROW
  EXECUTE FUNCTION public.set_order_item_completed_at();

-- Also auto-update progress_stage to 'in-stock' when stock_status changes to 'in-stock'
-- and current progress_stage is 'awaiting-stock'
CREATE OR REPLACE FUNCTION public.auto_progress_on_stock_received()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.stock_status = 'in-stock' AND OLD.stock_status IS DISTINCT FROM 'in-stock' 
     AND NEW.progress_stage = 'awaiting-stock' THEN
    NEW.progress_stage := 'in-stock';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER auto_progress_on_received
  BEFORE UPDATE ON public.order_items
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_progress_on_stock_received();
