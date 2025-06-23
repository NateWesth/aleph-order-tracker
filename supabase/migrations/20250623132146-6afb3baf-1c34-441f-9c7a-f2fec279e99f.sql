
-- First, let's drop the existing overly permissive policies on orders
DROP POLICY IF EXISTS "Users can view all orders" ON public.orders;
DROP POLICY IF EXISTS "Users can insert orders" ON public.orders;
DROP POLICY IF EXISTS "Users can update orders" ON public.orders;
DROP POLICY IF EXISTS "Users can delete orders" ON public.orders;

-- Create a function to check if the current user is an admin
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles 
    WHERE user_id = auth.uid() AND role = 'admin'
  );
$function$;

-- Create proper RLS policies for orders
-- Allow all users to view orders they are associated with
CREATE POLICY "Users can view their own orders" 
  ON public.orders 
  FOR SELECT 
  USING (
    user_id = auth.uid() OR 
    public.is_admin()
  );

-- Allow admins to insert any orders, users can only insert their own
CREATE POLICY "Users can create orders" 
  ON public.orders 
  FOR INSERT 
  WITH CHECK (
    public.is_admin() OR 
    user_id = auth.uid()
  );

-- Allow admins to update any orders, users can only update their own
CREATE POLICY "Users can update orders" 
  ON public.orders 
  FOR UPDATE 
  USING (
    public.is_admin() OR 
    user_id = auth.uid()
  );

-- Allow admins to delete any orders, users can only delete their own
CREATE POLICY "Users can delete orders" 
  ON public.orders 
  FOR DELETE 
  USING (
    public.is_admin() OR 
    user_id = auth.uid()
  );
