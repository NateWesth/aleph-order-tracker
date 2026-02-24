
-- Create order_templates table
CREATE TABLE public.order_templates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  company_id UUID REFERENCES public.companies(id),
  default_items JSONB DEFAULT '[]'::jsonb,
  default_notes TEXT,
  default_urgency TEXT DEFAULT 'normal',
  created_by UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.order_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage templates" ON public.order_templates FOR ALL
  USING (EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin'));

CREATE POLICY "Users can view templates" ON public.order_templates FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE TRIGGER update_order_templates_updated_at
  BEFORE UPDATE ON public.order_templates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
