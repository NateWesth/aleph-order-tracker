-- Drop the restrictive update policy for orders
DROP POLICY IF EXISTS "Users can update their own orders" ON public.orders;

-- Create a new policy that allows all authenticated users to update orders
-- This is needed so non-admin users can move orders through the workflow
CREATE POLICY "Authenticated users can update orders"
ON public.orders
FOR UPDATE
TO authenticated
USING (true)
WITH CHECK (true);

-- Also ensure the order_items update policy allows all authenticated users
DROP POLICY IF EXISTS "Authenticated users can update order items" ON public.order_items;

CREATE POLICY "Authenticated users can update order items"
ON public.order_items
FOR UPDATE
TO authenticated
USING (true)
WITH CHECK (true);