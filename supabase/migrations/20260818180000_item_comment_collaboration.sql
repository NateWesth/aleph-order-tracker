-- Promote item comments into first-class team activity.
-- A comment remains attached to the item, while its parent order receives an
-- activity entry and every other approved user receives a realtime notification.

CREATE OR REPLACE FUNCTION public.broadcast_order_item_comment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order_id uuid;
  v_order_number text;
  v_item_name text;
  v_author_name text;
BEGIN
  SELECT oi.order_id, oi.name, o.order_number
    INTO v_order_id, v_item_name, v_order_number
  FROM public.order_items oi
  JOIN public.orders o ON o.id = oi.order_id
  WHERE oi.id = NEW.order_item_id;

  SELECT COALESCE(NULLIF(btrim(p.full_name), ''), 'A team member')
    INTO v_author_name
  FROM public.profiles p
  WHERE p.id = NEW.user_id;

  v_author_name := COALESCE(v_author_name, 'A team member');

  INSERT INTO public.order_activity_log (
    order_id,
    user_id,
    activity_type,
    title,
    description,
    metadata
  ) VALUES (
    v_order_id,
    NEW.user_id,
    'item_comment',
    'New note on ' || COALESCE(v_item_name, 'order item'),
    v_author_name || ': ' || left(NEW.body, 180),
    jsonb_build_object(
      'comment_id', NEW.id,
      'order_item_id', NEW.order_item_id,
      'item_name', v_item_name
    )
  );

  INSERT INTO public.notifications (
    user_id,
    type,
    title,
    message,
    order_id,
    order_number,
    metadata
  )
  SELECT
    p.id,
    'item_comment',
    'New item note · ' || COALESCE(v_order_number, 'Order'),
    v_author_name || ' commented on ' || COALESCE(v_item_name, 'an item') || ': ' || left(NEW.body, 140),
    v_order_id,
    v_order_number,
    jsonb_build_object(
      'comment_id', NEW.id,
      'order_item_id', NEW.order_item_id,
      'item_name', v_item_name,
      'author_id', NEW.user_id
    )
  FROM public.profiles p
  WHERE p.id <> NEW.user_id
    AND p.approved IS TRUE;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS broadcast_order_item_comment_trigger ON public.order_item_comments;
CREATE TRIGGER broadcast_order_item_comment_trigger
  AFTER INSERT ON public.order_item_comments
  FOR EACH ROW
  EXECUTE FUNCTION public.broadcast_order_item_comment();
