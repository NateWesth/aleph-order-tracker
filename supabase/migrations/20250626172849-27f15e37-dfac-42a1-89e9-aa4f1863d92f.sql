
-- Enable Row Level Security on the companies table
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;

-- Create a policy that allows all authenticated users to read company data
-- This is needed for company code validation during registration
CREATE POLICY "Allow authenticated users to read companies" 
  ON public.companies 
  FOR SELECT 
  TO authenticated 
  USING (true);

-- Create a policy that allows anonymous users to read companies
-- This is needed for registration form validation before user is authenticated
CREATE POLICY "Allow anonymous users to read companies" 
  ON public.companies 
  FOR SELECT 
  TO anon 
  USING (true);
