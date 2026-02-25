-- Fix validate_company_code: add SET search_path = public
CREATE OR REPLACE FUNCTION public.validate_company_code(company_code text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.companies 
    WHERE UPPER(TRIM(code)) = UPPER(TRIM(company_code))
  );
$$;

-- Fix mark_order_update_as_read: add SET search_path = public
CREATE OR REPLACE FUNCTION public.mark_order_update_as_read(update_id uuid, user_uuid uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.order_update_reads (order_update_id, user_id)
  VALUES (update_id, user_uuid)
  ON CONFLICT (order_update_id, user_id) DO NOTHING;
END;
$$;

-- Fix get_unread_updates_count: add SET search_path = public
CREATE OR REPLACE FUNCTION public.get_unread_updates_count(order_uuid uuid, user_uuid uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  unread_count INTEGER;
BEGIN
  SELECT COUNT(*)::INTEGER INTO unread_count
  FROM public.order_updates ou
  LEFT JOIN public.order_update_reads our ON ou.id = our.order_update_id AND our.user_id = user_uuid
  WHERE ou.order_id = order_uuid 
  AND ou.user_id != user_uuid
  AND our.id IS NULL;
  
  RETURN COALESCE(unread_count, 0);
END;
$$;

-- Fix get_user_role: add SET search_path = public
CREATE OR REPLACE FUNCTION public.get_user_role(user_uuid uuid)
RETURNS app_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.user_roles WHERE user_id = user_uuid LIMIT 1;
$$;

-- Fix get_user_role_safe: add SET search_path = public
CREATE OR REPLACE FUNCTION public.get_user_role_safe(user_uuid uuid)
RETURNS app_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.user_roles WHERE user_id = user_uuid LIMIT 1;
$$;

-- Fix get_user_role_simple: add SET search_path = public
CREATE OR REPLACE FUNCTION public.get_user_role_simple(user_uuid uuid)
RETURNS app_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.user_roles WHERE user_id = user_uuid LIMIT 1;
$$;

-- Fix is_admin: add SET search_path = public
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles 
    WHERE user_id = auth.uid() AND role = 'admin'
  );
$$;

-- Fix get_current_user_role: add SET search_path = public
CREATE OR REPLACE FUNCTION public.get_current_user_role()
RETURNS app_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.user_roles WHERE user_id = auth.uid() LIMIT 1;
$$;