
-- First, let's fix the profiles table RLS policies
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
DROP POLICY IF EXISTS "Enable insert for authenticated users only" ON public.profiles;

-- Enable RLS on profiles if not already enabled
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Create simple RLS policies for profiles that don't cause recursion
CREATE POLICY "Users can view their own profile" 
  ON public.profiles 
  FOR SELECT 
  USING (auth.uid() = id);

CREATE POLICY "Users can update their own profile" 
  ON public.profiles 
  FOR UPDATE 
  USING (auth.uid() = id);

CREATE POLICY "Users can insert their own profile" 
  ON public.profiles 
  FOR INSERT 
  WITH CHECK (auth.uid() = id);

-- Now let's fix the companies table RLS policies
DROP POLICY IF EXISTS "Enable read access for all users" ON public.companies;
DROP POLICY IF EXISTS "Enable insert for authenticated users only" ON public.companies;
DROP POLICY IF EXISTS "Enable update for authenticated users only" ON public.companies;

-- Enable RLS on companies
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for companies - allow all authenticated users to read
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

-- Now let's update the orders policies to be simpler and avoid recursion
DROP POLICY IF EXISTS "Users can view their own orders" ON public.orders;
DROP POLICY IF EXISTS "Users can create orders" ON public.orders;
DROP POLICY IF EXISTS "Users can update orders" ON public.orders;
DROP POLICY IF EXISTS "Users can delete orders" ON public.orders;

-- Create a simple function to get user role without recursion
CREATE OR REPLACE FUNCTION public.get_current_user_role()
RETURNS app_role
LANGUAGE sql
STABLE SECURITY DEFINER
AS $function$
  SELECT role FROM public.user_roles WHERE user_id = auth.uid() LIMIT 1;
$function$;

-- Create new orders policies using the function
CREATE POLICY "Users can view orders" 
  ON public.orders 
  FOR SELECT 
  TO authenticated
  USING (
    user_id = auth.uid() OR 
    public.get_current_user_role() = 'admin'
  );

CREATE POLICY "Users can create orders" 
  ON public.orders 
  FOR INSERT 
  TO authenticated
  WITH CHECK (
    user_id = auth.uid() OR 
    public.get_current_user_role() = 'admin'
  );

CREATE POLICY "Users can update orders" 
  ON public.orders 
  FOR UPDATE 
  TO authenticated
  USING (
    user_id = auth.uid() OR 
    public.get_current_user_role() = 'admin'
  );

CREATE POLICY "Users can delete orders" 
  ON public.orders 
  FOR DELETE 
  TO authenticated
  USING (
    user_id = auth.uid() OR 
    public.get_current_user_role() = 'admin'
  );
