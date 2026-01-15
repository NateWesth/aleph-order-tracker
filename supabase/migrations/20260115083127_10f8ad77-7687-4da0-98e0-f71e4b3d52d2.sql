-- Allow all authenticated users to view all orders (same access as admins)
CREATE POLICY "Authenticated users can view all orders" 
ON public.orders 
FOR SELECT 
USING (auth.uid() IS NOT NULL);