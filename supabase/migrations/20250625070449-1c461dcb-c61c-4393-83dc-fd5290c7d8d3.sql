
-- Check if the user has admin role, and if not, assign it
-- Replace 'nathan@alepheng.co.za' with the actual admin email if different
DO $$
DECLARE
    admin_user_id UUID;
    user_role_exists BOOLEAN;
BEGIN
    -- Get the user ID for the admin email
    SELECT au.id INTO admin_user_id 
    FROM auth.users au 
    WHERE au.email = 'nathan@alepheng.co.za';
    
    IF admin_user_id IS NOT NULL THEN
        -- Check if user already has a role assigned
        SELECT EXISTS(
            SELECT 1 FROM public.user_roles 
            WHERE user_id = admin_user_id
        ) INTO user_role_exists;
        
        IF user_role_exists THEN
            -- Update existing role to admin
            UPDATE public.user_roles 
            SET role = 'admin'::app_role 
            WHERE user_id = admin_user_id;
            RAISE NOTICE 'Updated role to admin for user: %', admin_user_id;
        ELSE
            -- Insert new admin role
            INSERT INTO public.user_roles (user_id, role) 
            VALUES (admin_user_id, 'admin'::app_role);
            RAISE NOTICE 'Inserted admin role for user: %', admin_user_id;
        END IF;
    ELSE
        RAISE NOTICE 'User with email nathan@alepheng.co.za not found';
    END IF;
END $$;

-- Also verify the handle_new_user trigger is working correctly for future registrations
-- Let's check if it exists and recreate it to ensure it handles admin users properly
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
  -- Find company by code if provided (for regular users)
  IF NEW.raw_user_meta_data ->> 'company_code' IS NOT NULL THEN
    SELECT id INTO user_company_id 
    FROM public.companies 
    WHERE code = NEW.raw_user_meta_data ->> 'company_code';
  END IF;

  -- Determine user role based on user_type from registration
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

  -- Insert user role
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, user_role);

  RETURN NEW;
END;
$function$;

-- Recreate the trigger
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
