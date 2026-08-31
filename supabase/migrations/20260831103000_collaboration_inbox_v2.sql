-- Collaboration inbox v2
-- Makes fulfillment and item discussions actionable for the people responsible
-- for the work, while preserving mentions, replies and participant updates.

BEGIN;

CREATE OR REPLACE FUNCTION public.notify_entity_comment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  sender_name text := 'Someone';
  entity_label text;
  target_order_id uuid;
  target_order_number text;
  responsible_user uuid;
  parent_user uuid;
  notified uuid[] := '{}';
  recipient uuid;
  target_metadata jsonb;
BEGIN
  SELECT COALESCE(NULLIF(btrim(full_name), ''), NULLIF(btrim(email), ''), 'Someone')
    INTO sender_name
  FROM public.profiles
  WHERE id = NEW.user_id;

  entity_label := CASE NEW.entity_type
    WHEN 'delivery' THEN 'delivery'
    WHEN 'collection' THEN 'collection'
    ELSE NEW.entity_type
  END;

  IF NEW.entity_type = 'delivery' THEN
    SELECT o.id, o.order_number, o.fulfillment_assigned_to
      INTO target_order_id, target_order_number, responsible_user
    FROM public.orders o
    WHERE o.id::text = NEW.entity_id;
  ELSIF NEW.entity_type = 'collection' THEN
    SELECT pcs.assigned_to INTO responsible_user
    FROM public.po_collection_state pcs
    WHERE pcs.purchase_order_id = NEW.entity_id;
  ELSIF NEW.order_id IS NOT NULL THEN
    SELECT o.id, o.order_number, COALESCE(o.assigned_to, o.fulfillment_assigned_to)
      INTO target_order_id, target_order_number, responsible_user
    FROM public.orders o
    WHERE o.id = NEW.order_id;
  END IF;

  target_metadata := jsonb_build_object(
    'entity_type', NEW.entity_type,
    'entity_id', NEW.entity_id,
    'comment_id', NEW.id,
    'kind', NEW.entity_type,
    'purchase_order_id', CASE WHEN NEW.entity_type = 'collection' THEN NEW.entity_id ELSE NULL END
  );

  IF responsible_user IS NOT NULL AND responsible_user IS DISTINCT FROM NEW.user_id THEN
    INSERT INTO public.notifications (user_id, type, title, message, order_id, order_number, metadata)
    VALUES (
      responsible_user, 'entity_comment',
      sender_name || ' added a ' || entity_label || ' note',
      LEFT(NEW.body, 140), target_order_id, target_order_number, target_metadata
    );
    notified := array_append(notified, responsible_user);
  END IF;

  IF NEW.reply_to_id IS NOT NULL THEN
    SELECT user_id INTO parent_user FROM public.entity_comments WHERE id = NEW.reply_to_id;
    IF parent_user IS NOT NULL AND parent_user IS DISTINCT FROM NEW.user_id AND NOT (parent_user = ANY(notified)) THEN
      INSERT INTO public.notifications (user_id, type, title, message, order_id, order_number, metadata)
      VALUES (parent_user, 'comment_reply', sender_name || ' replied · ' || initcap(entity_label), LEFT(NEW.body, 140), target_order_id, target_order_number, target_metadata);
      notified := array_append(notified, parent_user);
    END IF;
  END IF;

  FOREACH recipient IN ARRAY COALESCE(NEW.mentioned_user_ids, '{}') LOOP
    IF recipient IS DISTINCT FROM NEW.user_id AND NOT (recipient = ANY(notified)) THEN
      INSERT INTO public.notifications (user_id, type, title, message, order_id, order_number, metadata)
      VALUES (recipient, 'comment_mention', sender_name || ' mentioned you · ' || initcap(entity_label), LEFT(NEW.body, 140), target_order_id, target_order_number, target_metadata);
      notified := array_append(notified, recipient);
    END IF;
  END LOOP;

  FOR recipient IN
    SELECT DISTINCT ec.user_id
    FROM public.entity_comments ec
    WHERE ec.entity_type = NEW.entity_type
      AND ec.entity_id = NEW.entity_id
      AND ec.user_id IS DISTINCT FROM NEW.user_id
  LOOP
    IF NOT (recipient = ANY(notified)) THEN
      INSERT INTO public.notifications (user_id, type, title, message, order_id, order_number, metadata)
      VALUES (recipient, 'entity_comment', sender_name || ' commented · ' || initcap(entity_label), LEFT(NEW.body, 140), target_order_id, target_order_number, target_metadata);
      notified := array_append(notified, recipient);
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.notify_item_comment_mentions()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  order_rec RECORD;
  sender_name text := 'Someone';
  target uuid;
  parent_author uuid;
  notified uuid[] := '{}';
  target_metadata jsonb;
BEGIN
  SELECT o.id, o.order_number, o.assigned_to, o.fulfillment_assigned_to
    INTO order_rec
  FROM public.order_items oi
  JOIN public.orders o ON o.id = oi.order_id
  WHERE oi.id = NEW.order_item_id;

  SELECT COALESCE(NULLIF(btrim(full_name), ''), NULLIF(btrim(email), ''), 'Someone')
    INTO sender_name FROM public.profiles WHERE id = NEW.user_id;

  target_metadata := jsonb_build_object(
    'entity_type', 'order',
    'entity_id', order_rec.id,
    'order_item_id', NEW.order_item_id,
    'comment_id', NEW.id
  );

  FOREACH target IN ARRAY ARRAY[order_rec.assigned_to, order_rec.fulfillment_assigned_to]::uuid[] LOOP
    IF target IS NOT NULL AND target IS DISTINCT FROM NEW.user_id AND NOT (target = ANY(notified)) THEN
      INSERT INTO public.notifications (user_id, type, title, message, order_id, order_number, metadata)
      VALUES (target, 'item_comment', sender_name || ' added an item note · ' || COALESCE(order_rec.order_number, 'Order'), LEFT(NEW.body, 140), order_rec.id, order_rec.order_number, target_metadata);
      notified := array_append(notified, target);
    END IF;
  END LOOP;

  IF NEW.reply_to_id IS NOT NULL THEN
    SELECT user_id INTO parent_author FROM public.order_item_comments WHERE id = NEW.reply_to_id;
    IF parent_author IS NOT NULL AND parent_author IS DISTINCT FROM NEW.user_id AND NOT (parent_author = ANY(notified)) THEN
      INSERT INTO public.notifications (user_id, type, title, message, order_id, order_number, metadata)
      VALUES (parent_author, 'comment_reply', sender_name || ' replied · ' || COALESCE(order_rec.order_number, 'Order'), LEFT(NEW.body, 140), order_rec.id, order_rec.order_number, target_metadata);
      notified := array_append(notified, parent_author);
    END IF;
  END IF;

  FOREACH target IN ARRAY COALESCE(NEW.mentioned_user_ids, '{}') LOOP
    IF target IS DISTINCT FROM NEW.user_id AND NOT (target = ANY(notified)) THEN
      INSERT INTO public.notifications (user_id, type, title, message, order_id, order_number, metadata)
      VALUES (target, 'comment_mention', sender_name || ' mentioned you · ' || COALESCE(order_rec.order_number, 'Order'), LEFT(NEW.body, 140), order_rec.id, order_rec.order_number, target_metadata);
      notified := array_append(notified, target);
    END IF;
  END LOOP;

  FOR target IN
    SELECT DISTINCT c.user_id
    FROM public.order_item_comments c
    WHERE c.order_item_id = NEW.order_item_id
      AND c.user_id IS DISTINCT FROM NEW.user_id
  LOOP
    IF NOT (target = ANY(notified)) THEN
      INSERT INTO public.notifications (user_id, type, title, message, order_id, order_number, metadata)
      VALUES (target, 'item_comment', sender_name || ' continued an item thread · ' || COALESCE(order_rec.order_number, 'Order'), LEFT(NEW.body, 140), order_rec.id, order_rec.order_number, target_metadata);
      notified := array_append(notified, target);
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.notify_entity_comment() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.notify_item_comment_mentions() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.notify_entity_comment() TO service_role;
GRANT EXECUTE ON FUNCTION public.notify_item_comment_mentions() TO service_role;

NOTIFY pgrst, 'reload schema';
COMMIT;
