
CREATE OR REPLACE FUNCTION public.get_invitation_by_token(_token uuid)
RETURNS TABLE (
  id uuid,
  email text,
  company_id uuid,
  status text,
  expires_at timestamptz,
  company_name text,
  company_code text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT ci.id, ci.email, ci.company_id, ci.status, ci.expires_at,
         c.name AS company_name, c.code AS company_code
  FROM public.client_invitations ci
  LEFT JOIN public.companies c ON c.id = ci.company_id
  WHERE ci.token = _token
  LIMIT 1;
$$;

REVOKE EXECUTE ON FUNCTION public.get_invitation_by_token(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_invitation_by_token(uuid) TO anon, authenticated;
