-- WhatsApp-style replies + emoji reactions for order item comments.
--
-- NOTE: three earlier migrations created/re-created public.order_item_comments
-- with different column names (content/author_id vs body/user_id), so the
-- live schema could be in either shape depending on what actually applied.
-- Everything here is written defensively (IF NOT EXISTS / conditional column
-- adds) so it converges on one correct final shape no matter which of those
-- ran before.

-- 1) Make sure the base table exists in its current (body/user_id) shape.
CREATE TABLE IF NOT EXISTS public.order_item_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_item_id uuid NOT NULL REFERENCES public.order_items(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  body text NOT NULL CHECK (length(btrim(body)) BETWEEN 1 AND 1000),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 2) If an older deploy left the "content"/"author_id"/"author_name" shape in
--    place instead, backfill body/user_id from those columns so no comment
--    history is lost, then the app can standardize on body/user_id going forward.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'order_item_comments' AND column_name = 'content')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'order_item_comments' AND column_name = 'body') THEN
    ALTER TABLE public.order_item_comments RENAME COLUMN content TO body;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'order_item_comments' AND column_name = 'author_id')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'order_item_comments' AND column_name = 'user_id') THEN
    ALTER TABLE public.order_item_comments RENAME COLUMN author_id TO user_id;
  END IF;
END $$;

-- 3) Reply threading: a comment can point at the comment it's replying to.
ALTER TABLE public.order_item_comments
  ADD COLUMN IF NOT EXISTS reply_to_id uuid REFERENCES public.order_item_comments(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS order_item_comments_item_created_idx
  ON public.order_item_comments(order_item_id, created_at);
CREATE INDEX IF NOT EXISTS order_item_comments_reply_to_idx
  ON public.order_item_comments(reply_to_id) WHERE reply_to_id IS NOT NULL;

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
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'order_item_comments'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.order_item_comments;
  END IF;
END $$;

-- 4) Emoji reactions - one row per (comment, user, emoji). Tapping the same
--    emoji again is a DELETE from the frontend, so this table only ever
--    holds "currently active" reactions.
CREATE TABLE IF NOT EXISTS public.order_item_comment_reactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  comment_id uuid NOT NULL REFERENCES public.order_item_comments(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  emoji text NOT NULL CHECK (char_length(emoji) BETWEEN 1 AND 8),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (comment_id, user_id, emoji)
);

CREATE INDEX IF NOT EXISTS order_item_comment_reactions_comment_idx
  ON public.order_item_comment_reactions(comment_id);

ALTER TABLE public.order_item_comment_reactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can read comment reactions" ON public.order_item_comment_reactions;
CREATE POLICY "Authenticated users can read comment reactions"
  ON public.order_item_comment_reactions FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Users can add their own comment reactions" ON public.order_item_comment_reactions;
CREATE POLICY "Users can add their own comment reactions"
  ON public.order_item_comment_reactions FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can remove their own comment reactions" ON public.order_item_comment_reactions;
CREATE POLICY "Users can remove their own comment reactions"
  ON public.order_item_comment_reactions FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

GRANT SELECT, INSERT, DELETE ON public.order_item_comment_reactions TO authenticated;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'order_item_comment_reactions'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.order_item_comment_reactions;
  END IF;
END $$;
