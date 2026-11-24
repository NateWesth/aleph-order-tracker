CREATE TABLE public.buying_sync_state (id boolean PRIMARY KEY DEFAULT true, last_attempt_at timestamptz, last_success_at timestamptz, error text, updated_at timestamptz NOT NULL DEFAULT now());
GRANT SELECT ON public.buying_sync_state TO authenticated;
GRANT ALL ON public.buying_sync_state TO service_role;
ALTER TABLE public.buying_sync_state ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Approved staff read buying refresh status" ON public.buying_sync_state FOR SELECT TO authenticated USING (public.is_user_approved(auth.uid()) OR public.has_role(auth.uid(),'admin'));
INSERT INTO public.buying_sync_state(id) VALUES(true);
CREATE TRIGGER buying_sync_state_updated_at BEFORE UPDATE ON public.buying_sync_state FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();