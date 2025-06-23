
-- First, let's check and fix the handle_new_user trigger to properly handle admin users
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user();

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  user_company_id UUID;
  user_role app_role;
BEGIN
  -- Find company by code if provided
  IF NEW.raw_user_meta_data ->> 'company_code' IS NOT NULL THEN
    SELECT id INTO user_company_id 
    FROM public.companies 
    WHERE code = NEW.raw_user_meta_data ->> 'company_code';
  END IF;

  -- Convert user_type to proper app_role enum - THIS IS THE FIX
  CASE NEW.raw_user_meta_data ->> 'user_type'
    WHEN 'admin' THEN user_role := 'admin'::app_role;
    WHEN 'user' THEN user_role := 'user'::app_role;
    ELSE user_role := 'user'::app_role; -- default fallback
  END CASE;

  -- Insert into profiles
  INSERT INTO public.profiles (id, full_name, email, phone, position, company_code, company_id)
  VALUES (
    NEW.id, 
    NEW.raw_user_meta_data ->> 'full_name',
    NEW.email,
    NEW.raw_user_meta_data ->> 'phone',
    NEW.raw_user_meta_data ->> 'position',
    NEW.raw_user_meta_data ->> 'company_code',
    user_company_id
  );

  -- Insert user role with proper casting
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, user_role);

  RETURN NEW;
END;
$function$;

-- Recreate the trigger
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
