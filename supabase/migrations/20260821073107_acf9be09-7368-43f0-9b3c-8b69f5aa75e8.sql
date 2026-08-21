ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS assigned_to uuid;
CREATE INDEX IF NOT EXISTS orders_assigned_to_idx ON public.orders(assigned_to);
ALTER TABLE public.order_item_comments ADD COLUMN IF NOT EXISTS mentioned_user_ids uuid[] NOT NULL DEFAULT '{}';
ALTER TABLE public.order_updates ADD COLUMN IF NOT EXISTS mentioned_user_ids uuid[] NOT NULL DEFAULT '{}';

CREATE OR REPLACE FUNCTION public.notify_order_assignment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.assigned_to IS NOT NULL
     AND (TG_OP = 'INSERT' OR OLD.assigned_to IS DISTINCT FROM NEW.assigned_to)
     AND NEW.assigned_to IS DISTINCT FROM auth.uid() THEN
    INSERT INTO public.notifications (user_id, type, title, message, order_id, order_number)
    VALUES (
      NEW.assigned_to,
      'order_assigned',
      'Order assigned to you',
      'You were assigned order ' || COALESCE(NEW.order_number, ''),
      NEW.id,
      NEW.order_number
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_order_assignment ON public.orders;
CREATE TRIGGER trg_notify_order_assignment
AFTER INSERT OR UPDATE OF assigned_to ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.notify_order_assignment();

CREATE OR REPLACE FUNCTION public.notify_item_comment_mentions()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  order_rec RECORD;
  sender_name text;
  target uuid;
  parent_author uuid;
  notified uuid[] := '{}';
BEGIN
  SELECT o.id, o.order_number INTO order_rec
  FROM public.order_items oi
  JOIN public.orders o ON o.id = oi.order_id
  WHERE oi.id = NEW.order_item_id;

  SELECT full_name INTO sender_name FROM public.profiles WHERE id = NEW.user_id;

  IF NEW.reply_to_id IS NOT NULL THEN
    SELECT user_id INTO parent_author FROM public.order_item_comments WHERE id = NEW.reply_to_id;
    IF parent_author IS NOT NULL AND parent_author IS DISTINCT FROM NEW.user_id THEN
      INSERT INTO public.notifications (user_id, type, title, message, order_id, order_number)
      VALUES (
        parent_author,
        'comment_reply',
        'New reply on order ' || COALESCE(order_rec.order_number, ''),
        COALESCE(sender_name, 'Someone') || ' replied: ' || LEFT(NEW.body, 100),
        order_rec.id,
        order_rec.order_number
      );
      notified := array_append(notified, parent_author);
    END IF;
  END IF;

  IF NEW.mentioned_user_ids IS NOT NULL THEN
    FOREACH target IN ARRAY NEW.mentioned_user_ids LOOP
      IF target IS DISTINCT FROM NEW.user_id AND NOT (target = ANY(notified)) THEN
        INSERT INTO public.notifications (user_id, type, title, message, order_id, order_number)
        VALUES (
          target,
          'comment_mention',
          'You were mentioned on order ' || COALESCE(order_rec.order_number, ''),
          COALESCE(sender_name, 'Someone') || ': ' || LEFT(NEW.body, 100),
          order_rec.id,
          order_rec.order_number
        );
        notified := array_append(notified, target);
      END IF;
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_item_comment_mentions ON public.order_item_comments;
CREATE TRIGGER trg_notify_item_comment_mentions
AFTER INSERT ON public.order_item_comments
FOR EACH ROW EXECUTE FUNCTION public.notify_item_comment_mentions();

CREATE OR REPLACE FUNCTION public.notify_order_update_mentions()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  order_rec RECORD;
  sender_name text;
  target uuid;
  parent_author uuid;
  notified uuid[] := '{}';
BEGIN
  SELECT id, order_number INTO order_rec FROM public.orders WHERE id = NEW.order_id;
  SELECT full_name INTO sender_name FROM public.profiles WHERE id = NEW.user_id;

  IF NEW.parent_id IS NOT NULL THEN
    SELECT user_id INTO parent_author FROM public.order_updates WHERE id = NEW.parent_id;
    IF parent_author IS NOT NULL AND parent_author IS DISTINCT FROM NEW.user_id THEN
      INSERT INTO public.notifications (user_id, type, title, message, order_id, order_number)
      VALUES (
        parent_author,
        'comment_reply',
        'New reply on order ' || COALESCE(order_rec.order_number, ''),
        COALESCE(sender_name, 'Someone') || ' replied: ' || LEFT(NEW.message, 100),
        order_rec.id,
        order_rec.order_number
      );
      notified := array_append(notified, parent_author);
    END IF;
  END IF;

  IF NEW.mentioned_user_ids IS NOT NULL THEN
    FOREACH target IN ARRAY NEW.mentioned_user_ids LOOP
      IF target IS DISTINCT FROM NEW.user_id AND NOT (target = ANY(notified)) THEN
        INSERT INTO public.notifications (user_id, type, title, message, order_id, order_number)
        VALUES (
          target,
          'comment_mention',
          'You were mentioned on order ' || COALESCE(order_rec.order_number, ''),
          COALESCE(sender_name, 'Someone') || ': ' || LEFT(NEW.message, 100),
          order_rec.id,
          order_rec.order_number
        );
        notified := array_append(notified, target);
      END IF;
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_order_update_mentions ON public.order_updates;
CREATE TRIGGER trg_notify_order_update_mentions
AFTER INSERT ON public.order_updates
FOR EACH ROW EXECUTE FUNCTION public.notify_order_update_mentions();

REVOKE EXECUTE ON FUNCTION public.notify_order_assignment() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.notify_item_comment_mentions() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.notify_order_update_mentions() FROM PUBLIC;