
-- Fix the user_roles table RLS policies to prevent infinite recursion
-- Drop all existing policies on user_roles that might cause recursion
DROP POLICY IF EXISTS "Users can view their own roles" ON public.user_roles;
DROP POLICY IF EXISTS "Users can insert their own roles" ON public.user_roles;
DROP POLICY IF EXISTS "Users can update their own roles" ON public.user_roles;
DROP POLICY IF EXISTS "Users can delete their own roles" ON public.user_roles;
DROP POLICY IF EXISTS "Service role can insert roles" ON public.user_roles;

-- Create simple, non-recursive policies for user_roles
-- These policies only use auth.uid() and don't reference any other tables
CREATE POLICY "Users can view their own roles" 
  ON public.user_roles 
  FOR SELECT 
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert their own roles" 
  ON public.user_roles 
  FOR INSERT 
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update their own roles" 
  ON public.user_roles 
  FOR UPDATE 
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can delete their own roles" 
  ON public.user_roles 
  FOR DELETE 
  TO authenticated
  USING (user_id = auth.uid());
