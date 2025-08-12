-- Remove the policy that allows anonymous users to read companies
DROP POLICY IF EXISTS "Allow anonymous users to read companies" ON public.companies;

-- Create a secure function to validate company codes without exposing sensitive data
CREATE OR REPLACE FUNCTION public.validate_company_code(company_code TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.companies 
    WHERE code = company_code
  );
$$;

-- Allow anonymous users to execute the validation function
GRANT EXECUTE ON FUNCTION public.validate_company_code(TEXT) TO anon;