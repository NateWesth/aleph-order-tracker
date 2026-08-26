-- Cross-app collaboration, step one: comments on deliveries and collections.
CREATE TABLE IF NOT EXISTS public.entity_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type text NOT NULL CHECK (entity_type IN ('delivery', 'collection')),
  entity_id text NOT NULL,
  order_id uuid REFERENCES public.orders(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  body text NOT NULL CHECK (length(btrim(body)) BETWEEN 1 AND 1000),
  reply_to_id uuid REFERENCES public.entity_comments(id) ON DELETE SET NULL,
  mentioned_user_ids uuid[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS entity_comments_entity_idx
  ON public.entity_comments(entity_type, entity_id, created_at);
CREATE INDEX IF NOT EXISTS entity_comments_reply_to_idx
  ON public.entity_comments(reply_to_id) WHERE reply_to_id IS NOT NULL;

ALTER TABLE public.entity_comments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can read entity comments" ON public.entity_comments;
CREATE POLICY "Authenticated users can read entity comments"
  ON public.entity_comments FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Users can create their entity comments" ON public.entity_comments;
CREATE POLICY "Users can create their entity comments"
  ON public.entity_comments FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their entity comments" ON public.entity_comments;
CREATE POLICY "Users can delete their entity comments"
  ON public.entity_comments FOR DELETE TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

GRANT SELECT, INSERT, DELETE ON public.entity_comments TO authenticated;
GRANT ALL ON public.entity_comments TO service_role;

CREATE TABLE IF NOT EXISTS public.entity_comment_reactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  comment_id uuid NOT NULL REFERENCES public.entity_comments(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  emoji text NOT NULL CHECK (char_length(emoji) BETWEEN 1 AND 8),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (comment_id, user_id, emoji)
);

CREATE INDEX IF NOT EXISTS entity_comment_reactions_comment_idx
  ON public.entity_comment_reactions(comment_id);

ALTER TABLE public.entity_comment_reactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can read entity comment reactions" ON public.entity_comment_reactions;
CREATE POLICY "Authenticated users can read entity comment reactions"
  ON public.entity_comment_reactions FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Users can add their own entity comment reactions" ON public.entity_comment_reactions;
CREATE POLICY "Users can add their own entity comment reactions"
  ON public.entity_comment_reactions FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can remove their own entity comment reactions" ON public.entity_comment_reactions;
CREATE POLICY "Users can remove their own entity comment reactions"
  ON public.entity_comment_reactions FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

GRANT SELECT, INSERT, DELETE ON public.entity_comment_reactions TO authenticated;
GRANT ALL ON public.entity_comment_reactions TO service_role;

CREATE OR REPLACE FUNCTION public.notify_entity_comment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  sender_name text;
  entity_label text;
  order_rec RECORD;
  parent_user uuid;
  notified uuid[] := '{}';
  recipient uuid;
BEGIN
  SELECT COALESCE(NULLIF(btrim(full_name), ''), 'Someone') INTO sender_name
  FROM public.profiles WHERE id = NEW.user_id;

  entity_label := CASE NEW.entity_type WHEN 'delivery' THEN 'delivery' WHEN 'collection' THEN 'collection' ELSE NEW.entity_type END;

  IF NEW.order_id IS NOT NULL THEN
    SELECT id, order_number INTO order_rec FROM public.orders WHERE id = NEW.order_id;
  END IF;

  IF NEW.reply_to_id IS NOT NULL THEN
    SELECT user_id INTO parent_user FROM public.entity_comments WHERE id = NEW.reply_to_id;
    IF parent_user IS NOT NULL AND parent_user IS DISTINCT FROM NEW.user_id THEN
      INSERT INTO public.notifications (user_id, type, title, message, order_id, order_number, metadata)
      VALUES (
        parent_user, 'comment_reply',
        sender_name || ' replied · ' || initcap(entity_label),
        sender_name || ' replied to your comment: ' || LEFT(NEW.body, 100),
        order_rec.id, order_rec.order_number,
        jsonb_build_object('entity_type', NEW.entity_type, 'entity_id', NEW.entity_id, 'comment_id', NEW.id)
      );
      notified := array_append(notified, parent_user);
    END IF;
  END IF;

  FOREACH recipient IN ARRAY COALESCE(NEW.mentioned_user_ids, '{}') LOOP
    IF recipient IS DISTINCT FROM NEW.user_id AND NOT (recipient = ANY(notified)) THEN
      INSERT INTO public.notifications (user_id, type, title, message, order_id, order_number, metadata)
      VALUES (
        recipient, 'comment_mention',
        sender_name || ' mentioned you · ' || initcap(entity_label),
        sender_name || ' mentioned you: ' || LEFT(NEW.body, 100),
        order_rec.id, order_rec.order_number,
        jsonb_build_object('entity_type', NEW.entity_type, 'entity_id', NEW.entity_id, 'comment_id', NEW.id)
      );
      notified := array_append(notified, recipient);
    END IF;
  END LOOP;

  FOR recipient IN
    SELECT DISTINCT ec.user_id FROM public.entity_comments ec
    WHERE ec.entity_type = NEW.entity_type AND ec.entity_id = NEW.entity_id
      AND ec.user_id IS DISTINCT FROM NEW.user_id
  LOOP
    IF NOT (recipient = ANY(notified)) THEN
      INSERT INTO public.notifications (user_id, type, title, message, order_id, order_number, metadata)
      VALUES (
        recipient, 'entity_comment',
        sender_name || ' commented · ' || initcap(entity_label),
        sender_name || ': ' || LEFT(NEW.body, 100),
        order_rec.id, order_rec.order_number,
        jsonb_build_object('entity_type', NEW.entity_type, 'entity_id', NEW.entity_id, 'comment_id', NEW.id)
      );
      notified := array_append(notified, recipient);
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_entity_comment ON public.entity_comments;
CREATE TRIGGER trg_notify_entity_comment
AFTER INSERT ON public.entity_comments
FOR EACH ROW EXECUTE FUNCTION public.notify_entity_comment();

REVOKE EXECUTE ON FUNCTION public.notify_entity_comment() FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.notify_entity_comment_reaction()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  comment_rec RECORD;
  reactor_name text;
BEGIN
  SELECT user_id, body, entity_type, entity_id, order_id INTO comment_rec
  FROM public.entity_comments WHERE id = NEW.comment_id;

  IF comment_rec IS NOT NULL AND comment_rec.user_id IS DISTINCT FROM NEW.user_id THEN
    SELECT COALESCE(NULLIF(btrim(full_name), ''), 'Someone') INTO reactor_name
    FROM public.profiles WHERE id = NEW.user_id;

    INSERT INTO public.notifications (user_id, type, title, message, order_id, metadata)
    VALUES (
      comment_rec.user_id, 'comment_reaction',
      reactor_name || ' reacted · ' || initcap(comment_rec.entity_type),
      reactor_name || ' reacted ' || NEW.emoji || ' to your comment: ' || LEFT(comment_rec.body, 80),
      comment_rec.order_id,
      jsonb_build_object('entity_type', comment_rec.entity_type, 'entity_id', comment_rec.entity_id, 'comment_id', NEW.comment_id, 'emoji', NEW.emoji)
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_entity_comment_reaction ON public.entity_comment_reactions;
CREATE TRIGGER trg_notify_entity_comment_reaction
AFTER INSERT ON public.entity_comment_reactions
FOR EACH ROW EXECUTE FUNCTION public.notify_entity_comment_reaction();

REVOKE EXECUTE ON FUNCTION public.notify_entity_comment_reaction() FROM PUBLIC;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'entity_comments') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.entity_comments;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'entity_comment_reactions') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.entity_comment_reactions;
  END IF;
END $$;