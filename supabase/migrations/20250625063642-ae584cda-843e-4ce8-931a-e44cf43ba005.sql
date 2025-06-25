
-- First, let's create a security definer function to get user roles safely
CREATE OR REPLACE FUNCTION public.get_user_role_safe(user_uuid uuid)
RETURNS app_role
LANGUAGE sql
STABLE SECURITY DEFINER
AS $$
  SELECT role FROM public.user_roles WHERE user_id = user_uuid LIMIT 1;
$$;

-- Now let's drop any existing problematic RLS policies on user_roles
DROP POLICY IF EXISTS "Users can view their own role" ON public.user_roles;
DROP POLICY IF EXISTS "Users can manage their own roles" ON public.user_roles;
DROP POLICY IF EXISTS "Users can view roles" ON public.user_roles;
DROP POLICY IF EXISTS "Users can insert roles" ON public.user_roles;
DROP POLICY IF EXISTS "Users can update roles" ON public.user_roles;
DROP POLICY IF EXISTS "Users can delete roles" ON public.user_roles;

-- Create simple, non-recursive RLS policies
CREATE POLICY "Enable read access for users to their own role" 
ON public.user_roles FOR SELECT 
USING (user_id = auth.uid());

CREATE POLICY "Enable insert for service role only" 
ON public.user_roles FOR INSERT 
WITH CHECK (auth.role() = 'service_role');
