CREATE OR REPLACE FUNCTION public.company_name_key(p text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public
AS $$ SELECT lower(regexp_replace(trim(coalesce(p,'')), '\s+', ' ', 'g')) $$;

CREATE OR REPLACE FUNCTION public.merge_duplicate_companies()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE r record; keeper uuid; merged integer := 0;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only admins can merge clients';
  END IF;
  FOR r IN
    SELECT public.company_name_key(name) k FROM companies GROUP BY 1 HAVING count(*) > 1
  LOOP
    SELECT id INTO keeper FROM companies WHERE public.company_name_key(name) = r.k
      ORDER BY (code LIKE 'ZOHO-%') DESC, created_at ASC LIMIT 1;
    -- drop assignments that would duplicate the keeper's
    DELETE FROM rep_company_assignments a USING companies c
      WHERE a.company_id = c.id AND c.id <> keeper AND public.company_name_key(c.name) = r.k
        AND EXISTS (SELECT 1 FROM rep_company_assignments b WHERE b.company_id = keeper AND b.rep_id = a.rep_id);
    UPDATE orders SET company_id = keeper WHERE company_id IN (SELECT id FROM companies WHERE public.company_name_key(name) = r.k AND id <> keeper);
    UPDATE profiles SET company_id = keeper WHERE company_id IN (SELECT id FROM companies WHERE public.company_name_key(name) = r.k AND id <> keeper);
    UPDATE order_templates SET company_id = keeper WHERE company_id IN (SELECT id FROM companies WHERE public.company_name_key(name) = r.k AND id <> keeper);
    UPDATE client_invitations SET company_id = keeper WHERE company_id IN (SELECT id FROM companies WHERE public.company_name_key(name) = r.k AND id <> keeper);
    UPDATE rep_company_assignments SET company_id = keeper WHERE company_id IN (SELECT id FROM companies WHERE public.company_name_key(name) = r.k AND id <> keeper);
    UPDATE fabrication_projects SET company_id = keeper WHERE company_id IN (SELECT id FROM companies WHERE public.company_name_key(name) = r.k AND id <> keeper);
    DELETE FROM companies WHERE public.company_name_key(name) = r.k AND id <> keeper;
    merged := merged + 1;
  END LOOP;
  UPDATE companies SET name = regexp_replace(trim(name), '\s+', ' ', 'g') WHERE name <> regexp_replace(trim(name), '\s+', ' ', 'g');
  RETURN merged;
END $$;

REVOKE EXECUTE ON FUNCTION public.merge_duplicate_companies() FROM anon, public;
GRANT EXECUTE ON FUNCTION public.merge_duplicate_companies() TO authenticated, service_role;

SELECT public.merge_duplicate_companies();

CREATE UNIQUE INDEX IF NOT EXISTS companies_name_key_unique ON public.companies (public.company_name_key(name));