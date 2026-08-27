-- Operations intelligence automation rules.
CREATE TABLE IF NOT EXISTS public.operational_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  trigger_type text NOT NULL,
  action_type text NOT NULL,
  configuration jsonb NOT NULL DEFAULT '{}'::jsonb,
  enabled boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS operational_rules_enabled_idx ON public.operational_rules(enabled, trigger_type);
ALTER TABLE public.operational_rules ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated users can view operational rules" ON public.operational_rules;
CREATE POLICY "Authenticated users can view operational rules" ON public.operational_rules FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Admins manage operational rules" ON public.operational_rules;
CREATE POLICY "Admins manage operational rules" ON public.operational_rules FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));
GRANT SELECT ON public.operational_rules TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.operational_rules TO authenticated;
GRANT ALL ON public.operational_rules TO service_role;

CREATE OR REPLACE FUNCTION public.touch_operational_rules_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;
DROP TRIGGER IF EXISTS trg_operational_rules_updated_at ON public.operational_rules;
CREATE TRIGGER trg_operational_rules_updated_at BEFORE UPDATE ON public.operational_rules FOR EACH ROW EXECUTE FUNCTION public.touch_operational_rules_updated_at();

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='operational_rules') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.operational_rules;
  END IF;
END $$;
NOTIFY pgrst, 'reload schema';
