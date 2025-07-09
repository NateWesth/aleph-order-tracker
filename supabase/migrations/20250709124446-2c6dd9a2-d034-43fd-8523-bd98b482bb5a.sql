
-- Add urgency column to orders table
ALTER TABLE public.orders 
ADD COLUMN urgency TEXT DEFAULT 'normal';

-- Add a check constraint to ensure valid urgency values
ALTER TABLE public.orders 
ADD CONSTRAINT orders_urgency_check 
CHECK (urgency IN ('low', 'normal', 'medium', 'high'));
