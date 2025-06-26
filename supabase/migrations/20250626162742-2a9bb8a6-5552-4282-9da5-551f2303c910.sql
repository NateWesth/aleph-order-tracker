
-- Add progress_stage column to orders table to store the current progress stage
ALTER TABLE public.orders 
ADD COLUMN progress_stage TEXT;

-- Add a comment to describe the column
COMMENT ON COLUMN public.orders.progress_stage IS 'Stores the current progress stage: awaiting-stock, packing, out-for-delivery, completed';
