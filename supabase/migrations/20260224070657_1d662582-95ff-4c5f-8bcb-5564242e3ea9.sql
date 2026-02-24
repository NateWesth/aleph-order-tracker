
-- Create order_tags table for reusable tag definitions
CREATE TABLE public.order_tags (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  color TEXT NOT NULL DEFAULT '#6366f1',
  created_by UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.order_tags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view tags" ON public.order_tags FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Admins can manage tags" ON public.order_tags FOR ALL
  USING (EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin'));

-- Junction table for order <-> tag relationship
CREATE TABLE public.order_tag_assignments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  tag_id UUID NOT NULL REFERENCES public.order_tags(id) ON DELETE CASCADE,
  assigned_by UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(order_id, tag_id)
);

ALTER TABLE public.order_tag_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view tag assignments" ON public.order_tag_assignments FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Admins can manage tag assignments" ON public.order_tag_assignments FOR ALL
  USING (EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin'));

-- Seed some default tags
INSERT INTO public.order_tags (name, color, created_by) VALUES
  ('Rush', '#ef4444', '00000000-0000-0000-0000-000000000000'),
  ('Sample', '#8b5cf6', '00000000-0000-0000-0000-000000000000'),
  ('Repeat', '#3b82f6', '00000000-0000-0000-0000-000000000000'),
  ('VIP', '#f59e0b', '00000000-0000-0000-0000-000000000000'),
  ('Fragile', '#ec4899', '00000000-0000-0000-0000-000000000000');
