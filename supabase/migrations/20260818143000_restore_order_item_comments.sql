-- Restore item-level notes/comments for every environment and enable realtime.
CREATE TABLE IF NOT EXISTS public.order_item_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_item_id uuid NOT NULL REFERENCES public.order_items(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  body text NOT NULL CHECK (length(btrim(body)) BETWEEN 1 AND 1000),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS order_item_comments_item_created_idx
  ON public.order_item_comments(order_item_id, created_at);

ALTER TABLE public.order_item_comments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can read item comments" ON public.order_item_comments;
CREATE POLICY "Authenticated users can read item comments"
  ON public.order_item_comments FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Users can create their item comments" ON public.order_item_comments;
CREATE POLICY "Users can create their item comments"
  ON public.order_item_comments FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their item comments" ON public.order_item_comments;
CREATE POLICY "Users can delete their item comments"
  ON public.order_item_comments FOR DELETE TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

GRANT SELECT, INSERT, DELETE ON public.order_item_comments TO authenticated;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'order_item_comments'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.order_item_comments;
  END IF;
END $$;
