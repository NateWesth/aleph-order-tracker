CREATE TABLE public.commission_rep_access (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  rep_id uuid NOT NULL REFERENCES public.reps(id) ON DELETE CASCADE,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, rep_id)
);
GRANT SELECT, INSERT, DELETE ON public.commission_rep_access TO authenticated;
GRANT ALL ON public.commission_rep_access TO service_role;
ALTER TABLE public.commission_rep_access ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage commission rep access" ON public.commission_rep_access
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Users see their own commission rep access" ON public.commission_rep_access
  FOR SELECT TO authenticated USING (user_id = auth.uid());