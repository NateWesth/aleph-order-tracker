
-- Temporarily disable RLS on user_roles to isolate the recursion issue
-- This will help us identify if the problem is with the policies or something else
ALTER TABLE public.user_roles DISABLE ROW LEVEL SECURITY;

-- Also check if there are any other policies that might still exist
-- Drop ALL policies on user_roles to ensure clean slate
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN (SELECT policyname FROM pg_policies WHERE tablename = 'user_roles' AND schemaname = 'public')
    LOOP
        EXECUTE 'DROP POLICY IF EXISTS ' || quote_ident(r.policyname) || ' ON public.user_roles';
    END LOOP;
END $$;

-- Re-enable RLS and create one simple policy
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Create a very basic policy that should not cause recursion
CREATE POLICY "basic_user_roles_access" 
  ON public.user_roles 
  FOR ALL 
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
