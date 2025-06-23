
-- Fix the infinite recursion issue in user_roles RLS policies
-- First, drop any existing policies on user_roles
DROP POLICY IF EXISTS "Users can view their own roles" ON public.user_roles;
DROP POLICY IF EXISTS "Users can insert their own roles" ON public.user_roles;
DROP POLICY IF EXISTS "Users can update their own roles" ON public.user_roles;
DROP POLICY IF EXISTS "Users can delete their own roles" ON public.user_roles;

-- Create a security definer function to get user role without RLS recursion
CREATE OR REPLACE FUNCTION public.get_user_role(user_uuid uuid)
RETURNS app_role
LANGUAGE sql
STABLE SECURITY DEFINER
AS $function$
  SELECT role FROM public.user_roles WHERE user_id = user_uuid LIMIT 1;
$function$;

-- Create simple RLS policies that don't cause recursion
-- Allow users to view their own roles
CREATE POLICY "Users can view their own roles" 
  ON public.user_roles 
  FOR SELECT 
  USING (auth.uid() = user_id);

-- Allow service role to insert roles (for the trigger)
CREATE POLICY "Service role can insert roles" 
  ON public.user_roles 
  FOR INSERT 
  WITH CHECK (true);

-- Allow users to update their own roles (if needed)
CREATE POLICY "Users can update their own roles" 
  ON public.user_roles 
  FOR UPDATE 
  USING (auth.uid() = user_id);

-- Allow users to delete their own roles (if needed)
CREATE POLICY "Users can delete their own roles" 
  ON public.user_roles 
  FOR DELETE 
  USING (auth.uid() = user_id);
