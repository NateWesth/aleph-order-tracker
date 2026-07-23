
CREATE TABLE public.commission_item_cost_overrides (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  item_name TEXT NOT NULL,
  item_description TEXT NOT NULL DEFAULT '',
  cost NUMERIC NOT NULL,
  note TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX commission_item_cost_overrides_unique_idx
  ON public.commission_item_cost_overrides (lower(item_name), lower(item_description));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.commission_item_cost_overrides TO authenticated;
GRANT ALL ON public.commission_item_cost_overrides TO service_role;

ALTER TABLE public.commission_item_cost_overrides ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Commission editors can view cost overrides"
ON public.commission_item_cost_overrides
FOR SELECT TO authenticated
USING (public.can_edit_commission(auth.uid()));

CREATE POLICY "Commission editors can insert cost overrides"
ON public.commission_item_cost_overrides
FOR INSERT TO authenticated
WITH CHECK (public.can_edit_commission(auth.uid()));

CREATE POLICY "Commission editors can update cost overrides"
ON public.commission_item_cost_overrides
FOR UPDATE TO authenticated
USING (public.can_edit_commission(auth.uid()))
WITH CHECK (public.can_edit_commission(auth.uid()));

CREATE POLICY "Commission editors can delete cost overrides"
ON public.commission_item_cost_overrides
FOR DELETE TO authenticated
USING (public.can_edit_commission(auth.uid()));

CREATE TRIGGER update_commission_item_cost_overrides_updated_at
BEFORE UPDATE ON public.commission_item_cost_overrides
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
