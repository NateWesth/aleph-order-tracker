-- Shared, realtime comments attached to individual order line items.
CREATE TABLE IF NOT EXISTS public.order_item_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_item_id uuid NOT NULL REFERENCES public.order_items(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  body text NOT NULL CHECK (length(trim(body)) > 0 AND length(body) <= 1000),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS order_item_comments_item_idx
  ON public.order_item_comments(order_item_id, created_at);

CREATE INDEX IF NOT EXISTS order_item_comments_user_idx
  ON public.order_item_comments(user_id);

ALTER TABLE public.order_item_comments ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, DELETE ON public.order_item_comments TO authenticated;
GRANT ALL ON public.order_item_comments TO service_role;

DROP POLICY IF EXISTS "Authenticated users can view order item comments" ON public.order_item_comments;
CREATE POLICY "Authenticated users can view order item comments"
ON public.order_item_comments
FOR SELECT
TO authenticated
USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Authenticated users can add order item comments" ON public.order_item_comments;
CREATE POLICY "Authenticated users can add order item comments"
ON public.order_item_comments
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their own order item comments" ON public.order_item_comments;
CREATE POLICY "Users can delete their own order item comments"
ON public.order_item_comments
FOR DELETE
TO authenticated
USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

-- Realtime is used by the frontend so every open order view updates immediately.
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.order_item_comments;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
