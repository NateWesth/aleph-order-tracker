-- Fix order_items policies: Make them PERMISSIVE so authenticated users can view and update all items

-- Drop existing restrictive policies
DROP POLICY IF EXISTS "Authenticated users can view all order items" ON public.order_items;
DROP POLICY IF EXISTS "Authenticated users can update order items" ON public.order_items;

-- Recreate as PERMISSIVE policies (default is permissive when not specified as restrictive)
CREATE POLICY "Authenticated users can view all order items"
ON public.order_items
FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Authenticated users can update order items"
ON public.order_items
FOR UPDATE
TO authenticated
USING (true)
WITH CHECK (true);

-- Fix orders policies: Allow all authenticated users to view all orders
DROP POLICY IF EXISTS "Authenticated users can view all orders" ON public.orders;

CREATE POLICY "Authenticated users can view all orders"
ON public.orders
FOR SELECT
TO authenticated
USING (true);