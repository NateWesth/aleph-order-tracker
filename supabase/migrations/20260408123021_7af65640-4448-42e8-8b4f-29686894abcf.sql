
-- Create reps table
CREATE TABLE public.reps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  email text,
  commission_rate numeric NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.reps ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage reps" ON public.reps
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Authenticated users can view reps" ON public.reps
  FOR SELECT TO authenticated
  USING (auth.uid() IS NOT NULL);

CREATE TRIGGER update_reps_updated_at
  BEFORE UPDATE ON public.reps
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Create rep_company_assignments table
CREATE TABLE public.rep_company_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rep_id uuid NOT NULL REFERENCES public.reps(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (rep_id, company_id)
);

ALTER TABLE public.rep_company_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage rep assignments" ON public.rep_company_assignments
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Authenticated users can view rep assignments" ON public.rep_company_assignments
  FOR SELECT TO authenticated
  USING (auth.uid() IS NOT NULL);
