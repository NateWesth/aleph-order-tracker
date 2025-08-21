-- Ensure Johan Minnie's profile is properly configured
UPDATE public.profiles 
SET 
  company_code = '4VUN8Y',
  company_id = '5bec4af2-895a-421a-86bc-996fbcf65cc7',
  full_name = 'Johan Minnie',
  email = 'store@admoeng.co.za',
  phone = '0824820980'
WHERE id = '84252959-deaa-4b7f-948e-5ebc2aa89c4b';

-- Update the validate_company_code function to be case-insensitive and handle whitespace
CREATE OR REPLACE FUNCTION public.validate_company_code(company_code text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.companies 
    WHERE UPPER(TRIM(code)) = UPPER(TRIM(company_code))
  );
$function$;