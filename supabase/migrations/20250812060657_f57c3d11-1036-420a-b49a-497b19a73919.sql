-- Remove the public access policy that exposes sensitive company data
DROP POLICY IF EXISTS "Allow anonymous users to read companies" ON public.companies;

-- Create a secure function to validate company codes without exposing sensitive data
CREATE OR REPLACE FUNCTION public.validate_company_code(company_code text)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.companies 
    WHERE code = company_code
  );
$$;

-- Grant execute permission to anonymous users for this specific function only
GRANT EXECUTE ON FUNCTION public.validate_company_code(text) TO anon;