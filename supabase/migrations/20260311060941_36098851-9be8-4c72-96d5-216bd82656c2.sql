-- Fix all existing stuck items where stock is in but progress didn't advance
UPDATE public.order_items 
SET progress_stage = 'in-stock', updated_at = now()
WHERE stock_status = 'in-stock' 
AND progress_stage = 'awaiting-stock';