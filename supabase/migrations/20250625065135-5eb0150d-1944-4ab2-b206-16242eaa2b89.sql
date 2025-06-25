
-- Fix the infinite recursion issue in RLS policies
-- First, drop all existing problematic policies
DROP POLICY IF EXISTS "Users can view orders" ON public.orders;
DROP POLICY IF EXISTS "Users can create orders" ON public.orders;
DROP POLICY IF EXISTS "Users can update orders" ON public.orders;
DROP POLICY IF EXISTS "Users can delete orders" ON public.orders;

DROP POLICY IF EXISTS "Authenticated users can view companies" ON public.companies;
DROP POLICY IF EXISTS "Authenticated users can insert companies" ON public.companies;
DROP POLICY IF EXISTS "Authenticated users can update companies" ON public.companies;

DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can insert their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Admins can update all profiles" ON public.profiles;

DROP POLICY IF EXISTS "Users can view their own role" ON public.user_roles;
DROP POLICY IF EXISTS "Users can insert their own role" ON public.user_roles;
DROP POLICY IF EXISTS "Users can update their own role" ON public.user_roles;
DROP POLICY IF EXISTS "Users can delete their own role" ON public.user_roles;
DROP POLICY IF EXISTS "Service role can access all user roles" ON public.user_roles;
DROP POLICY IF EXISTS "Enable read access for users to their own role" ON public.user_roles;
DROP POLICY IF EXISTS "Enable insert for service role only" ON public.user_roles;

-- Create a simple function to get user role without recursion
CREATE OR REPLACE FUNCTION public.get_user_role_simple(user_uuid uuid)
RETURNS app_role
LANGUAGE sql
STABLE SECURITY DEFINER
AS $$
  SELECT role FROM public.user_roles WHERE user_id = user_uuid LIMIT 1;
$$;

-- Create simple RLS policies for user_roles that don't cause recursion
CREATE POLICY "Users can view own role" 
  ON public.user_roles 
  FOR SELECT 
  USING (auth.uid() = user_id);

CREATE POLICY "Service role can manage roles" 
  ON public.user_roles 
  FOR ALL 
  TO service_role
  USING (true);

-- Create simple RLS policies for profiles
CREATE POLICY "Users can view own profile" 
  ON public.profiles 
  FOR SELECT 
  USING (auth.uid() = id);

CREATE POLICY "Users can update own profile" 
  ON public.profiles 
  FOR UPDATE 
  USING (auth.uid() = id);

CREATE POLICY "Users can insert own profile" 
  ON public.profiles 
  FOR INSERT 
  WITH CHECK (auth.uid() = id);

-- Create simple RLS policies for companies - allow all authenticated users
CREATE POLICY "Authenticated users can view companies" 
  ON public.companies 
  FOR SELECT 
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can manage companies" 
  ON public.companies 
  FOR ALL 
  TO authenticated
  USING (true);

-- Create simple RLS policies for orders
CREATE POLICY "Users can view related orders" 
  ON public.orders 
  FOR SELECT 
  TO authenticated
  USING (
    user_id = auth.uid() OR 
    public.get_user_role_simple(auth.uid()) = 'admin'
  );

CREATE POLICY "Users can create orders" 
  ON public.orders 
  FOR INSERT 
  TO authenticated
  WITH CHECK (
    user_id = auth.uid() OR 
    public.get_user_role_simple(auth.uid()) = 'admin'
  );

CREATE POLICY "Users can update related orders" 
  ON public.orders 
  FOR UPDATE 
  TO authenticated
  USING (
    user_id = auth.uid() OR 
    public.get_user_role_simple(auth.uid()) = 'admin'
  );

CREATE POLICY "Users can delete related orders" 
  ON public.orders 
  FOR DELETE 
  TO authenticated
  USING (
    user_id = auth.uid() OR 
    public.get_user_role_simple(auth.uid()) = 'admin'
  );
