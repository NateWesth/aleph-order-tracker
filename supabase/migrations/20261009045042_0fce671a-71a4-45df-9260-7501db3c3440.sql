CREATE OR REPLACE FUNCTION public.protect_fabrication_project_identity()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.project_type IS DISTINCT FROM OLD.project_type THEN RAISE EXCEPTION 'Project type cannot be changed once the project is created'; END IF;
  IF NEW.start_date IS DISTINCT FROM OLD.start_date THEN RAISE EXCEPTION 'Start date cannot be changed once the project is created'; END IF;
  IF NEW.created_at IS DISTINCT FROM OLD.created_at THEN RAISE EXCEPTION 'Created date cannot be changed'; END IF;
  IF NEW.name IS DISTINCT FROM OLD.name THEN RAISE EXCEPTION 'Project name cannot be changed once the project is created'; END IF;
  IF NEW.project_number IS DISTINCT FROM OLD.project_number THEN RAISE EXCEPTION 'Project number cannot be changed once the project is created'; END IF;
  IF NEW.client_name IS DISTINCT FROM OLD.client_name THEN RAISE EXCEPTION 'Client cannot be changed once the project is created'; END IF;
  IF NOT public.is_admin() AND (NEW.due_date IS DISTINCT FROM OLD.due_date OR NEW.priority IS DISTINCT FROM OLD.priority OR NEW.assigned_to IS DISTINCT FROM OLD.assigned_to) THEN
    RAISE EXCEPTION 'Due date, priority and assignee changes need admin approval';
  END IF;
  RETURN NEW;
END; $$;
REVOKE EXECUTE ON FUNCTION public.protect_fabrication_project_identity() FROM PUBLIC, anon, authenticated;

CREATE TABLE public.fabrication_change_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.fabrication_projects(id) ON DELETE CASCADE,
  field text NOT NULL CHECK (field IN ('due_date','priority','assigned_to')),
  old_value text,
  new_value text,
  requested_by uuid NOT NULL DEFAULT auth.uid(),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  reviewed_by uuid,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.fabrication_change_requests TO authenticated;
GRANT ALL ON public.fabrication_change_requests TO service_role;
ALTER TABLE public.fabrication_change_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Approved staff view change requests" ON public.fabrication_change_requests FOR SELECT TO authenticated USING (public.is_user_approved(auth.uid()));
CREATE POLICY "Approved staff request changes" ON public.fabrication_change_requests FOR INSERT TO authenticated WITH CHECK (public.is_user_approved(auth.uid()) AND requested_by = auth.uid() AND status = 'pending');

CREATE OR REPLACE FUNCTION public.review_fabrication_change(p_id uuid, p_approve boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.fabrication_change_requests;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Only admins can review changes'; END IF;
  SELECT * INTO r FROM public.fabrication_change_requests WHERE id = p_id AND status = 'pending' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Request not found or already reviewed'; END IF;
  IF p_approve THEN
    IF r.field = 'due_date' THEN UPDATE public.fabrication_projects SET due_date = NULLIF(r.new_value,'')::date WHERE id = r.project_id;
    ELSIF r.field = 'priority' THEN UPDATE public.fabrication_projects SET priority = r.new_value WHERE id = r.project_id;
    ELSIF r.field = 'assigned_to' THEN UPDATE public.fabrication_projects SET assigned_to = NULLIF(r.new_value,'')::uuid WHERE id = r.project_id;
    END IF;
  END IF;
  UPDATE public.fabrication_change_requests SET status = CASE WHEN p_approve THEN 'approved' ELSE 'rejected' END, reviewed_by = auth.uid(), reviewed_at = now() WHERE id = p_id;
END; $$;
REVOKE EXECUTE ON FUNCTION public.review_fabrication_change(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.review_fabrication_change(uuid, boolean) TO authenticated;