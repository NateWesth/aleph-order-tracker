CREATE TABLE IF NOT EXISTS public.team_action_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL CHECK (char_length(trim(title)) BETWEEN 2 AND 180),
  description text,
  priority text NOT NULL DEFAULT 'medium' CHECK (priority IN ('critical','high','medium','low')),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','in_progress','done')),
  workspace text NOT NULL DEFAULT 'orders' CHECK (workspace IN ('orders','buying-sheet','po-tracking','clients','suppliers','items','commission','stats')),
  entity_id text,
  created_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  assigned_to uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  due_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.team_action_items TO authenticated;
GRANT ALL ON public.team_action_items TO service_role;

CREATE INDEX IF NOT EXISTS team_action_items_active_priority_idx
  ON public.team_action_items (status, priority, due_at, created_at DESC);
CREATE INDEX IF NOT EXISTS team_action_items_assignee_idx
  ON public.team_action_items (assigned_to, status) WHERE assigned_to IS NOT NULL;

ALTER TABLE public.team_action_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can view team action items" ON public.team_action_items;
CREATE POLICY "Authenticated users can view team action items"
  ON public.team_action_items FOR SELECT TO authenticated
  USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Authenticated users can create team action items" ON public.team_action_items;
CREATE POLICY "Authenticated users can create team action items"
  ON public.team_action_items FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid());

DROP POLICY IF EXISTS "Authenticated users can collaborate on team action items" ON public.team_action_items;
CREATE POLICY "Authenticated users can collaborate on team action items"
  ON public.team_action_items FOR UPDATE TO authenticated
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Creators and admins can remove team action items" ON public.team_action_items;
CREATE POLICY "Creators and admins can remove team action items"
  ON public.team_action_items FOR DELETE TO authenticated
  USING (created_by = auth.uid() OR public.is_admin());

DROP TRIGGER IF EXISTS update_team_action_items_updated_at ON public.team_action_items;
CREATE TRIGGER update_team_action_items_updated_at
  BEFORE UPDATE ON public.team_action_items
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.team_action_items REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'team_action_items'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.team_action_items;
  END IF;
END
$$;