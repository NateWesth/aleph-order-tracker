
-- Drop existing admin policies for profiles first
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Admins can update all profiles" ON public.profiles;

-- First, let's fix the user_roles table RLS policies to prevent recursion
DROP POLICY IF EXISTS "Users can view their own role" ON public.user_roles;
DROP POLICY IF EXISTS "Users can update their own role" ON public.user_roles;
DROP POLICY IF EXISTS "Users can insert their own role" ON public.user_roles;

-- Enable RLS on user_roles
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Create simple RLS policies for user_roles that don't cause recursion
CREATE POLICY "Users can view their own role" 
  ON public.user_roles 
  FOR SELECT 
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own role" 
  ON public.user_roles 
  FOR INSERT 
  WITH CHECK (auth.uid() = user_id);

-- Allow service role to access all user roles (this avoids recursion issues)
CREATE POLICY "Service role can access all user roles" 
  ON public.user_roles 
  FOR ALL 
  TO service_role
  USING (true);

-- Update the get_current_user_role function to be simpler and avoid RLS issues
CREATE OR REPLACE FUNCTION public.get_current_user_role()
RETURNS app_role
LANGUAGE sql
STABLE SECURITY DEFINER
AS $function$
  SELECT role FROM public.user_roles WHERE user_id = auth.uid() LIMIT 1;
$function$;

-- Create policies that allow admins to manage profiles without causing recursion
CREATE POLICY "Admins can view all profiles" 
  ON public.profiles 
  FOR SELECT 
  TO authenticated
  USING (
    auth.uid() = id OR 
    EXISTS (
      SELECT 1 FROM public.user_roles 
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "Admins can update all profiles" 
  ON public.profiles 
  FOR UPDATE 
  TO authenticated
  USING (
    auth.uid() = id OR 
    EXISTS (
      SELECT 1 FROM public.user_roles 
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );
