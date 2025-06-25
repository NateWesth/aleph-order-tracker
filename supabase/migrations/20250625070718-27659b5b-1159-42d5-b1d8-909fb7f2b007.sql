
-- Create a simple security definer function to get user roles safely
CREATE OR REPLACE FUNCTION public.get_user_role_simple(user_uuid uuid)
RETURNS app_role
LANGUAGE sql
STABLE SECURITY DEFINER
AS $function$
  SELECT role FROM public.user_roles WHERE user_id = user_uuid LIMIT 1;
$function$;

-- Drop all existing problematic policies on user_roles
DROP POLICY IF EXISTS "Users can view their own roles" ON public.user_roles;
DROP POLICY IF EXISTS "Authenticated users can insert roles" ON public.user_roles;
DROP POLICY IF EXISTS "Users can update their own roles" ON public.user_roles;
DROP POLICY IF EXISTS "Users can delete their own roles" ON public.user_roles;

-- Create simple, non-recursive policies that allow direct access
CREATE POLICY "Allow users to view their own roles" 
  ON public.user_roles 
  FOR SELECT 
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Allow users to insert their own roles" 
  ON public.user_roles 
  FOR INSERT 
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Allow users to update their own roles" 
  ON public.user_roles 
  FOR UPDATE 
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Allow users to delete their own roles" 
  ON public.user_roles 
  FOR DELETE 
  TO authenticated
  USING (user_id = auth.uid());
