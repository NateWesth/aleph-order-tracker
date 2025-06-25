
-- Check if RLS is properly configured and add missing policies if needed
-- Ensure RLS is enabled on all tables
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Drop any remaining problematic policies that might still exist
DROP POLICY IF EXISTS "Users can view related orders" ON public.orders;
DROP POLICY IF EXISTS "Users can create orders" ON public.orders;
DROP POLICY IF EXISTS "Users can update related orders" ON public.orders;
DROP POLICY IF EXISTS "Users can delete related orders" ON public.orders;

DROP POLICY IF EXISTS "Authenticated users can view companies" ON public.companies;
DROP POLICY IF EXISTS "Authenticated users can manage companies" ON public.companies;

-- Recreate the policies with explicit permissions
-- Companies policies - allow all authenticated users to view and manage
CREATE POLICY "Allow authenticated users to view companies" 
  ON public.companies 
  FOR SELECT 
  TO authenticated
  USING (true);

CREATE POLICY "Allow authenticated users to insert companies" 
  ON public.companies 
  FOR INSERT 
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Allow authenticated users to update companies" 
  ON public.companies 
  FOR UPDATE 
  TO authenticated
  USING (true);

CREATE POLICY "Allow authenticated users to delete companies" 
  ON public.companies 
  FOR DELETE 
  TO authenticated
  USING (true);

-- Orders policies - allow users to see their own orders or if they're admin
CREATE POLICY "Allow users to view their orders or admin to view all" 
  ON public.orders 
  FOR SELECT 
  TO authenticated
  USING (
    user_id = auth.uid() OR 
    public.get_user_role_simple(auth.uid()) = 'admin'
  );

CREATE POLICY "Allow users to create orders" 
  ON public.orders 
  FOR INSERT 
  TO authenticated
  WITH CHECK (
    user_id = auth.uid() OR 
    public.get_user_role_simple(auth.uid()) = 'admin'
  );

CREATE POLICY "Allow users to update their orders or admin to update all" 
  ON public.orders 
  FOR UPDATE 
  TO authenticated
  USING (
    user_id = auth.uid() OR 
    public.get_user_role_simple(auth.uid()) = 'admin'
  );

CREATE POLICY "Allow users to delete their orders or admin to delete all" 
  ON public.orders 
  FOR DELETE 
  TO authenticated
  USING (
    user_id = auth.uid() OR 
    public.get_user_role_simple(auth.uid()) = 'admin'
  );
