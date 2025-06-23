
-- Create RLS policies for the orders table
CREATE POLICY "Users can view all orders" ON public.orders
  FOR SELECT 
  USING (true);

CREATE POLICY "Users can insert orders" ON public.orders
  FOR INSERT 
  WITH CHECK (true);

CREATE POLICY "Users can update orders" ON public.orders
  FOR UPDATE 
  USING (true);

CREATE POLICY "Users can delete orders" ON public.orders
  FOR DELETE 
  USING (true);

-- Ensure RLS is enabled (it should already be, but let's make sure)
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
