-- Drop the existing check constraint and recreate with all valid stock statuses
ALTER TABLE public.order_items DROP CONSTRAINT IF EXISTS order_items_stock_status_check;

ALTER TABLE public.order_items ADD CONSTRAINT order_items_stock_status_check 
CHECK (stock_status = ANY (ARRAY['awaiting'::text, 'ordered'::text, 'in-stock'::text]));