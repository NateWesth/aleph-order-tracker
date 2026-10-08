CREATE OR REPLACE FUNCTION public.protect_fabrication_project_identity()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.project_type IS DISTINCT FROM OLD.project_type THEN
    RAISE EXCEPTION 'Project type cannot be changed once the project is created';
  END IF;
  IF NEW.start_date IS DISTINCT FROM OLD.start_date THEN
    RAISE EXCEPTION 'Start date cannot be changed once the project is created';
  END IF;
  IF NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'Created date cannot be changed';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_fabrication_project_identity ON public.fabrication_projects;
CREATE TRIGGER protect_fabrication_project_identity
BEFORE UPDATE ON public.fabrication_projects
FOR EACH ROW EXECUTE FUNCTION public.protect_fabrication_project_identity();