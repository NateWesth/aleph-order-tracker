CREATE OR REPLACE FUNCTION public.notify_comment_reaction()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  comment_rec RECORD;
  order_rec RECORD;
  reactor_name text;
BEGIN
  SELECT oic.user_id, oic.body, oic.order_item_id
    INTO comment_rec
  FROM public.order_item_comments oic
  WHERE oic.id = NEW.comment_id;

  IF comment_rec IS NULL OR comment_rec.user_id IS DISTINCT FROM NEW.user_id THEN
    IF comment_rec IS NOT NULL THEN
      SELECT o.id, o.order_number INTO order_rec
      FROM public.order_items oi
      JOIN public.orders o ON o.id = oi.order_id
      WHERE oi.id = comment_rec.order_item_id;

      SELECT COALESCE(NULLIF(btrim(full_name), ''), 'Someone') INTO reactor_name
      FROM public.profiles WHERE id = NEW.user_id;

      INSERT INTO public.notifications (user_id, type, title, message, order_id, order_number, metadata)
      VALUES (
        comment_rec.user_id,
        'comment_reaction',
        'New reaction · ' || COALESCE(order_rec.order_number, 'Order'),
        COALESCE(reactor_name, 'Someone') || ' reacted ' || NEW.emoji || ' to your comment: ' || LEFT(comment_rec.body, 80),
        order_rec.id,
        order_rec.order_number,
        jsonb_build_object('comment_id', NEW.comment_id, 'emoji', NEW.emoji, 'reactor_id', NEW.user_id)
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_comment_reaction ON public.order_item_comment_reactions;
CREATE TRIGGER trg_notify_comment_reaction
AFTER INSERT ON public.order_item_comment_reactions
FOR EACH ROW EXECUTE FUNCTION public.notify_comment_reaction();

REVOKE EXECUTE ON FUNCTION public.notify_comment_reaction() FROM PUBLIC;