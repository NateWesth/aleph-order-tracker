
-- Fix all remaining RLS policy recursion issues
-- Drop all existing problematic policies that might cause recursion
DROP POLICY IF EXISTS "Allow users to view their orders or admin to view all" ON public.orders;
DROP POLICY IF EXISTS "Allow users to create orders" ON public.orders;
DROP POLICY IF EXISTS "Allow users to update their orders or admin to update all" ON public.orders;
DROP POLICY IF EXISTS "Allow users to delete their orders or admin to delete all" ON public.orders;

DROP POLICY IF EXISTS "Allow authenticated users to view companies" ON public.companies;
DROP POLICY IF EXISTS "Allow authenticated users to insert companies" ON public.companies;
DROP POLICY IF EXISTS "Allow authenticated users to update companies" ON public.companies;
DROP POLICY IF EXISTS "Allow authenticated users to delete companies" ON public.companies;
DROP POLICY IF EXISTS "Allow authenticated users to manage companies" ON public.companies;

-- Create simple, non-recursive policies for orders
-- These policies avoid calling any functions that might query user_roles
CREATE POLICY "Users can view their own orders" 
  ON public.orders 
  FOR SELECT 
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert their own orders" 
  ON public.orders 
  FOR INSERT 
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update their own orders" 
  ON public.orders 
  FOR UPDATE 
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can delete their own orders" 
  ON public.orders 
  FOR DELETE 
  TO authenticated
  USING (user_id = auth.uid());

-- Create simple policies for companies - allow all authenticated users full access
-- This avoids any role checking that could cause recursion
CREATE POLICY "Authenticated users can view companies" 
  ON public.companies 
  FOR SELECT 
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert companies" 
  ON public.companies 
  FOR INSERT 
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update companies" 
  ON public.companies 
  FOR UPDATE 
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can delete companies" 
  ON public.companies 
  FOR DELETE 
  TO authenticated
  USING (true);
