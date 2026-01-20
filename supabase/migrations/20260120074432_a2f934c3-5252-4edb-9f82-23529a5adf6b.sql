-- Add progress_stage column to order_items for item-level progress tracking
ALTER TABLE public.order_items 
ADD COLUMN progress_stage TEXT NOT NULL DEFAULT 'awaiting-stock';

-- Add a comment to document the allowed values
COMMENT ON COLUMN public.order_items.progress_stage IS 'Item progress: awaiting-stock, in-stock, packing, delivery, completed';