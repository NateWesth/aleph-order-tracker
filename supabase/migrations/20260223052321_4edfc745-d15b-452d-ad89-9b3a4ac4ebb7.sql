
-- Create notifications table
CREATE TABLE public.notifications (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  type TEXT NOT NULL, -- 'order_created', 'order_status_changed', 'order_update_message'
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  order_id UUID REFERENCES public.orders(id) ON DELETE CASCADE,
  order_number TEXT,
  metadata JSONB DEFAULT '{}',
  read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Users can only see their own notifications
CREATE POLICY "Users can view their own notifications"
  ON public.notifications FOR SELECT
  USING (auth.uid() = user_id);

-- System inserts via triggers (SECURITY DEFINER), but users can also insert for themselves
CREATE POLICY "Users can insert their own notifications"
  ON public.notifications FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can update (mark as read) their own notifications
CREATE POLICY "Users can update their own notifications"
  ON public.notifications FOR UPDATE
  USING (auth.uid() = user_id);

-- Users can delete their own notifications
CREATE POLICY "Users can delete their own notifications"
  ON public.notifications FOR DELETE
  USING (auth.uid() = user_id);

-- Index for fast lookups
CREATE INDEX idx_notifications_user_id_read ON public.notifications(user_id, read);
CREATE INDEX idx_notifications_created_at ON public.notifications(created_at DESC);

-- Add to realtime publication
ALTER PUBLICATION supabase_realtime ADD TABLE notifications;

-- Trigger function: create notifications for all relevant users when an order changes
CREATE OR REPLACE FUNCTION public.notify_order_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  recipient RECORD;
  notif_type TEXT;
  notif_title TEXT;
  notif_message TEXT;
  order_num TEXT;
BEGIN
  -- Determine notification type and message
  IF TG_OP = 'INSERT' THEN
    notif_type := 'order_created';
    order_num := NEW.order_number;
    notif_title := 'New Order Created';
    notif_message := 'Order ' || NEW.order_number || ' has been created.';
  ELSIF TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status THEN
    notif_type := 'order_status_changed';
    order_num := NEW.order_number;
    notif_title := 'Order Status Changed';
    notif_message := 'Order ' || NEW.order_number || ' status changed to ' || COALESCE(NEW.status, 'unknown') || '.';
  ELSE
    -- No notification for other updates
    RETURN NEW;
  END IF;

  -- Notify all admin users
  FOR recipient IN
    SELECT ur.user_id FROM public.user_roles ur WHERE ur.role = 'admin'
  LOOP
    -- Don't notify the user who made the change (if we can determine it)
    IF recipient.user_id IS DISTINCT FROM auth.uid() THEN
      INSERT INTO public.notifications (user_id, type, title, message, order_id, order_number)
      VALUES (recipient.user_id, notif_type, notif_title, notif_message, NEW.id, order_num);
    END IF;
  END LOOP;

  -- Notify the order owner if they're not the one making the change
  IF NEW.user_id IS NOT NULL AND NEW.user_id IS DISTINCT FROM auth.uid() THEN
    -- Check if already notified as admin
    IF NOT EXISTS (
      SELECT 1 FROM public.user_roles WHERE user_id = NEW.user_id AND role = 'admin'
    ) THEN
      INSERT INTO public.notifications (user_id, type, title, message, order_id, order_number)
      VALUES (NEW.user_id, notif_type, notif_title, notif_message, NEW.id, order_num);
    END IF;
  END IF;

  -- Notify users from the same company
  IF NEW.company_id IS NOT NULL THEN
    FOR recipient IN
      SELECT p.id AS user_id FROM public.profiles p
      WHERE p.company_id = NEW.company_id
      AND p.id IS DISTINCT FROM auth.uid()
      AND p.id IS DISTINCT FROM NEW.user_id
      AND NOT EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = p.id AND ur.role = 'admin')
    LOOP
      INSERT INTO public.notifications (user_id, type, title, message, order_id, order_number)
      VALUES (recipient.user_id, notif_type, notif_title, notif_message, NEW.id, order_num);
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$;

-- Attach trigger to orders table
CREATE TRIGGER trigger_notify_order_change
  AFTER INSERT OR UPDATE ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_order_change();

-- Trigger function: notify when a new order update message is posted
CREATE OR REPLACE FUNCTION public.notify_order_update_message()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  recipient RECORD;
  order_rec RECORD;
  sender_name TEXT;
BEGIN
  -- Get order info
  SELECT id, order_number, user_id, company_id INTO order_rec
  FROM public.orders WHERE id = NEW.order_id;

  IF order_rec IS NULL THEN RETURN NEW; END IF;

  -- Get sender name
  SELECT full_name INTO sender_name FROM public.profiles WHERE id = NEW.user_id;

  -- Notify all admin users
  FOR recipient IN
    SELECT ur.user_id FROM public.user_roles ur WHERE ur.role = 'admin'
  LOOP
    IF recipient.user_id IS DISTINCT FROM NEW.user_id THEN
      INSERT INTO public.notifications (user_id, type, title, message, order_id, order_number)
      VALUES (
        recipient.user_id,
        'order_update_message',
        'New Message on Order ' || order_rec.order_number,
        COALESCE(sender_name, 'Someone') || ': ' || LEFT(NEW.message, 100),
        order_rec.id,
        order_rec.order_number
      );
    END IF;
  END LOOP;

  -- Notify order owner
  IF order_rec.user_id IS NOT NULL AND order_rec.user_id IS DISTINCT FROM NEW.user_id THEN
    IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = order_rec.user_id AND role = 'admin') THEN
      INSERT INTO public.notifications (user_id, type, title, message, order_id, order_number)
      VALUES (
        order_rec.user_id,
        'order_update_message',
        'New Message on Order ' || order_rec.order_number,
        COALESCE(sender_name, 'Someone') || ': ' || LEFT(NEW.message, 100),
        order_rec.id,
        order_rec.order_number
      );
    END IF;
  END IF;

  -- Notify company users
  IF order_rec.company_id IS NOT NULL THEN
    FOR recipient IN
      SELECT p.id AS user_id FROM public.profiles p
      WHERE p.company_id = order_rec.company_id
      AND p.id IS DISTINCT FROM NEW.user_id
      AND p.id IS DISTINCT FROM order_rec.user_id
      AND NOT EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = p.id AND ur.role = 'admin')
    LOOP
      INSERT INTO public.notifications (user_id, type, title, message, order_id, order_number)
      VALUES (
        recipient.user_id,
        'order_update_message',
        'New Message on Order ' || order_rec.order_number,
        COALESCE(sender_name, 'Someone') || ': ' || LEFT(NEW.message, 100),
        order_rec.id,
        order_rec.order_number
      );
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$;

-- Attach trigger to order_updates table
CREATE TRIGGER trigger_notify_order_update_message
  AFTER INSERT ON public.order_updates
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_order_update_message();
