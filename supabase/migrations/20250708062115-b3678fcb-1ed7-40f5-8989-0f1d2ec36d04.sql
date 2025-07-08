
-- Drop the overly permissive policies on companies table
DROP POLICY IF EXISTS "Users can view companies" ON public.companies;
DROP POLICY IF EXISTS "Authenticated users can view companies" ON public.companies;
DROP POLICY IF EXISTS "Authenticated users can insert companies" ON public.companies;
DROP POLICY IF EXISTS "Authenticated users can update companies" ON public.companies;
DROP POLICY IF EXISTS "Authenticated users can delete companies" ON public.companies;
DROP POLICY IF EXISTS "Allow authenticated users to read companies" ON public.companies;
DROP POLICY IF EXISTS "Allow anonymous users to read companies" ON public.companies;

-- Create more restrictive policies that properly handle admin vs client access
CREATE POLICY "Admins can view all companies" 
  ON public.companies 
  FOR SELECT 
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles 
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "Clients can view their associated company" 
  ON public.companies 
  FOR SELECT 
  TO authenticated
  USING (
    -- Allow if user's profile is associated with this company
    EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE id = auth.uid() 
      AND (company_id = companies.id OR company_code = companies.code)
    )
  );

-- Keep admin management policies
CREATE POLICY "Admins can insert companies" 
  ON public.companies 
  FOR INSERT 
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_roles 
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "Admins can update companies" 
  ON public.companies 
  FOR UPDATE 
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles 
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "Admins can delete companies" 
  ON public.companies 
  FOR DELETE 
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles 
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

-- Allow anonymous users to read companies (needed for registration validation)
CREATE POLICY "Allow anonymous users to read companies" 
  ON public.companies 
  FOR SELECT 
  TO anon 
  USING (true);
