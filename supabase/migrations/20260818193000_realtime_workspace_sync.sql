-- Guarantee that operational changes reach every authorized connected client.
-- This is intentionally idempotent because older environments enabled only a
-- subset of these tables in the Supabase Realtime publication.
DO $$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'orders',
    'order_items',
    'order_purchase_orders',
    'order_item_comments',
    'order_files',
    'order_activity_log',
    'order_updates',
    'order_update_reads',
    'notifications',
    'order_tags',
    'order_tag_assignments'
  ]
  LOOP
    IF to_regclass(format('public.%I', table_name)) IS NOT NULL THEN
      EXECUTE format('ALTER TABLE public.%I REPLICA IDENTITY FULL', table_name);

      IF NOT EXISTS (
        SELECT 1
        FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime'
          AND schemaname = 'public'
          AND tablename = table_name
      ) THEN
        EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', table_name);
      END IF;
    END IF;
  END LOOP;
END
$$;
