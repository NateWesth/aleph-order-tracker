-- Allow all authenticated users to view and update order checklist items (per product requirement)

-- 1) order_items: relax SELECT to all authenticated users
DROP POLICY IF EXISTS "Users can view order items" ON public.order_items;

CREATE POLICY "Authenticated users can view all order items"
ON public.order_items
FOR SELECT
TO authenticated
USING (auth.uid() IS NOT NULL);

-- 2) order_items: allow UPDATE for all authenticated users (enables checklist ticking)
DROP POLICY IF EXISTS "Authenticated users can update order items" ON public.order_items;

CREATE POLICY "Authenticated users can update order items"
ON public.order_items
FOR UPDATE
TO authenticated
USING (auth.uid() IS NOT NULL)
WITH CHECK (auth.uid() IS NOT NULL);

-- Note: Admin policy "Admins can manage order items" remains in place.
