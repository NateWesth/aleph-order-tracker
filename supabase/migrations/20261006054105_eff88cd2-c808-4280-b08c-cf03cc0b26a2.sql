CREATE TABLE public.fabrication_projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_number text,
  name text NOT NULL,
  client_name text,
  company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL,
  start_date date NOT NULL DEFAULT current_date,
  due_date date,
  stage text NOT NULL DEFAULT 'stripping',
  priority text NOT NULL DEFAULT 'medium',
  assigned_to uuid,
  description text,
  notes text,
  completed_at timestamptz,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.fabrication_materials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.fabrication_projects(id) ON DELETE CASCADE,
  material text NOT NULL,
  quantity numeric NOT NULL DEFAULT 1,
  unit text,
  notes text,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.fabrication_parts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.fabrication_projects(id) ON DELETE CASCADE,
  name text NOT NULL,
  quantity numeric NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'todo',
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.fabrication_time_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.fabrication_projects(id) ON DELETE CASCADE,
  work_date date NOT NULL DEFAULT current_date,
  worker_name text,
  hours numeric NOT NULL DEFAULT 0,
  note text,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.fabrication_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.fabrication_projects(id) ON DELETE CASCADE,
  file_name text NOT NULL,
  storage_path text NOT NULL,
  mime_type text,
  file_size bigint,
  uploaded_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['fabrication_projects','fabrication_materials','fabrication_parts','fabrication_time_entries','fabrication_files'] LOOP
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY "Approved team manages %s" ON public.%I FOR ALL TO authenticated USING (public.is_user_approved(auth.uid())) WITH CHECK (public.is_user_approved(auth.uid()))', t, t);
    EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column()', 'touch_' || t, t);
  END LOOP;
END $$;

CREATE INDEX fabrication_materials_project_idx ON public.fabrication_materials(project_id);
CREATE INDEX fabrication_parts_project_idx ON public.fabrication_parts(project_id);
CREATE INDEX fabrication_time_project_idx ON public.fabrication_time_entries(project_id);
CREATE INDEX fabrication_files_project_idx ON public.fabrication_files(project_id);
CREATE INDEX fabrication_projects_stage_idx ON public.fabrication_projects(stage, start_date);

ALTER TABLE public.entity_comments DROP CONSTRAINT IF EXISTS entity_comments_entity_type_check;
ALTER TABLE public.entity_comments ADD CONSTRAINT entity_comments_entity_type_check
  CHECK (entity_type IN ('delivery', 'collection', 'sharpening', 'repair', 'fabrication'));

CREATE POLICY "Approved team reads fabrication files" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'fabrication-files' AND public.is_user_approved(auth.uid()));
CREATE POLICY "Approved team uploads fabrication files" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'fabrication-files' AND public.is_user_approved(auth.uid()));
CREATE POLICY "Approved team deletes fabrication files" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'fabrication-files' AND public.is_user_approved(auth.uid()));