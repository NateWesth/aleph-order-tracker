-- Persistent dispatch-area learning for mixed delivery + collection route planning.
CREATE TABLE IF NOT EXISTS public.dispatch_areas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT dispatch_areas_name_unique UNIQUE (name)
);

CREATE TABLE IF NOT EXISTS public.dispatch_area_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_type text NOT NULL CHECK (source_type IN ('company','vendor')),
  source_id text NOT NULL,
  area_id uuid NOT NULL REFERENCES public.dispatch_areas(id) ON DELETE CASCADE,
  address_override text,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT dispatch_area_links_source_unique UNIQUE (source_type, source_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.dispatch_areas, public.dispatch_area_links TO authenticated;
GRANT ALL ON public.dispatch_areas, public.dispatch_area_links TO service_role;

CREATE INDEX IF NOT EXISTS dispatch_areas_sort_idx ON public.dispatch_areas(sort_order, name);
CREATE INDEX IF NOT EXISTS dispatch_area_links_area_idx ON public.dispatch_area_links(area_id);
CREATE INDEX IF NOT EXISTS dispatch_area_links_source_idx ON public.dispatch_area_links(source_type, source_id);

ALTER TABLE public.dispatch_areas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dispatch_area_links ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users manage dispatch areas" ON public.dispatch_areas;
CREATE POLICY "Authenticated users manage dispatch areas" ON public.dispatch_areas
  FOR ALL TO authenticated USING (true) WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Authenticated users manage dispatch area links" ON public.dispatch_area_links;
CREATE POLICY "Authenticated users manage dispatch area links" ON public.dispatch_area_links
  FOR ALL TO authenticated USING (true) WITH CHECK (auth.uid() IS NOT NULL);

DROP TRIGGER IF EXISTS update_dispatch_areas_updated_at ON public.dispatch_areas;
CREATE TRIGGER update_dispatch_areas_updated_at
BEFORE UPDATE ON public.dispatch_areas
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_dispatch_area_links_updated_at ON public.dispatch_area_links;
CREATE TRIGGER update_dispatch_area_links_updated_at
BEFORE UPDATE ON public.dispatch_area_links
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'dispatch_areas'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.dispatch_areas;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'dispatch_area_links'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.dispatch_area_links;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';