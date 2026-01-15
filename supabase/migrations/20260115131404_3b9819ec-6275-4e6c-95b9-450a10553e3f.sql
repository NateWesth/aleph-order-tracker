-- Drop the existing restrictive policies that are conflicting
DROP POLICY IF EXISTS "Authenticated users can update order items" ON public.order_items;
DROP POLICY IF EXISTS "Admins can manage order items" ON public.order_items;

-- Create permissive policies instead
-- Admins can manage all order items
CREATE POLICY "Admins can manage order items" 
ON public.order_items 
FOR ALL 
TO authenticated
USING (EXISTS ( SELECT 1
   FROM user_roles
  WHERE ((user_roles.user_id = auth.uid()) AND (user_roles.role = 'admin'::app_role))))
WITH CHECK (EXISTS ( SELECT 1
   FROM user_roles
  WHERE ((user_roles.user_id = auth.uid()) AND (user_roles.role = 'admin'::app_role))));

-- Authenticated users can update order items (permissive)
CREATE POLICY "Authenticated users can update order items" 
ON public.order_items 
FOR UPDATE 
TO authenticated
USING (auth.uid() IS NOT NULL)
WITH CHECK (auth.uid() IS NOT NULL);