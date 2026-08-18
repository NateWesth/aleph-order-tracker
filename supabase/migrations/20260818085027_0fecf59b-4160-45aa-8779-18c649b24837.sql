CREATE TABLE public.order_item_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_item_id uuid NOT NULL REFERENCES public.order_items(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.order_item_comments TO authenticated;
GRANT ALL ON public.order_item_comments TO service_role;

ALTER TABLE public.order_item_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view item comments"
ON public.order_item_comments FOR SELECT TO authenticated
USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can add item comments"
ON public.order_item_comments FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Authors can update their item comments"
ON public.order_item_comments FOR UPDATE TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Authors can delete their item comments"
ON public.order_item_comments FOR DELETE TO authenticated
USING (auth.uid() = user_id);

ALTER PUBLICATION supabase_realtime ADD TABLE public.order_item_comments;