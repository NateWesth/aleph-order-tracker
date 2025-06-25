
-- Fix the user_roles RLS policies to prevent infinite recursion
-- Drop existing problematic policies on user_roles
DROP POLICY IF EXISTS "Users can view their own roles" ON public.user_roles;
DROP POLICY IF EXISTS "Service role can insert roles" ON public.user_roles;
DROP POLICY IF EXISTS "Users can update their own roles" ON public.user_roles;
DROP POLICY IF EXISTS "Users can delete their own roles" ON public.user_roles;

-- Create simple, non-recursive policies for user_roles
-- Allow users to view their own roles (simple auth.uid() check, no function calls)
CREATE POLICY "Users can view their own roles" 
  ON public.user_roles 
  FOR SELECT 
  TO authenticated
  USING (user_id = auth.uid());

-- Allow authenticated users to insert roles (for registration/admin management)
CREATE POLICY "Authenticated users can insert roles" 
  ON public.user_roles 
  FOR INSERT 
  TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Allow users to update their own roles (if needed)
CREATE POLICY "Users can update their own roles" 
  ON public.user_roles 
  FOR UPDATE 
  TO authenticated
  USING (user_id = auth.uid());

-- Allow users to delete their own roles (if needed)
CREATE POLICY "Users can delete their own roles" 
  ON public.user_roles 
  FOR DELETE 
  TO authenticated
  USING (user_id = auth.uid());
