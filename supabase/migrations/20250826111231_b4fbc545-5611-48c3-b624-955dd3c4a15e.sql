-- Add notes field to orders table
ALTER TABLE public.orders 
ADD COLUMN notes TEXT;