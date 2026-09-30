ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS pushed_at timestamptz;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.push_subscriptions TO authenticated;
GRANT ALL ON public.push_subscriptions TO service_role;
DROP POLICY IF EXISTS "Users can update their own subscriptions" ON public.push_subscriptions;
CREATE POLICY "Users can update their own subscriptions" ON public.push_subscriptions
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Keep the full comment text in comment alerts
DO $do$
DECLARE fn text; def text;
BEGIN
  FOREACH fn IN ARRAY ARRAY['notify_entity_comment','notify_item_comment_mentions','notify_order_update_mentions','notify_order_update_message'] LOOP
    IF to_regprocedure('public.' || fn || '()') IS NOT NULL THEN
      def := pg_get_functiondef(('public.' || fn || '()')::regprocedure);
      IF def ~* 'LEFT\(NEW\.(body|content|message), *\d+\)' THEN
        def := regexp_replace(def, 'LEFT\(NEW\.(body|content|message), *\d+\)', 'NEW.\1', 'gi');
        EXECUTE def;
      END IF;
    END IF;
  END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION public.dispatch_comment_push()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.type IN ('entity_comment','comment_reply','comment_mention','item_comment','mention','new_message','order_update','comment_reaction') THEN
    PERFORM net.http_post(
      url := 'https://cnofbtrtyiilmhlrashl.supabase.co/functions/v1/send-push',
      headers := '{"Content-Type":"application/json","Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNub2ZidHJ0eWlpbG1obHJhc2hsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDg4MzQyOTEsImV4cCI6MjA2NDQxMDI5MX0.ld1QuWFD3ARTQWDG2ZRFpxNUIf-vzPlGcG3E8HjpFqo"}'::jsonb,
      body := jsonb_build_object('notification_id', NEW.id)
    );
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_dispatch_comment_push ON public.notifications;
CREATE TRIGGER trg_dispatch_comment_push
AFTER INSERT ON public.notifications
FOR EACH ROW EXECUTE FUNCTION public.dispatch_comment_push();