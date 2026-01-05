CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  user_company_id UUID;
BEGIN
  IF NEW.raw_user_meta_data ->> 'company_code' IS NOT NULL THEN
    SELECT id INTO user_company_id 
    FROM public.companies 
    WHERE code = NEW.raw_user_meta_data ->> 'company_code';
  END IF;

  INSERT INTO public.profiles (id, full_name, email, phone, position, company_code, company_id, approved)
  VALUES (
    NEW.id, 
    NEW.raw_user_meta_data ->> 'full_name',
    NEW.email,
    NEW.raw_user_meta_data ->> 'phone',
    NEW.raw_user_meta_data ->> 'position',
    NEW.raw_user_meta_data ->> 'company_code',
    user_company_id,
    false
  );

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'admin'::app_role);

  RETURN NEW;
END;
$function$;