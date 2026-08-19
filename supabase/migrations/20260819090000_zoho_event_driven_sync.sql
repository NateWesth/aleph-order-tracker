-- Event-driven Zoho ingestion.
--
-- The browser reads shared cache tables and receives Realtime updates. Zoho is
-- contacted only by a newly accepted webhook (one detail read per changed
-- document) or by an explicit administrator recovery sync.

CREATE TABLE IF NOT EXISTS public.zoho_webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dedupe_key text NOT NULL UNIQUE,
  event_type text,
  document_type text NOT NULL,
  document_id text NOT NULL,
  operation text,
  status text NOT NULL DEFAULT 'processing'
    CHECK (status IN ('processing', 'completed', 'failed')),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  error_message text,
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz
);

CREATE INDEX IF NOT EXISTS zoho_webhook_events_document_idx
  ON public.zoho_webhook_events (document_type, document_id, received_at DESC);

CREATE TABLE IF NOT EXISTS public.zoho_document_cache (
  organization_id text NOT NULL,
  document_type text NOT NULL,
  document_id text NOT NULL,
  payload jsonb NOT NULL,
  payload_hash text NOT NULL,
  source_modified_at timestamptz,
  synced_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, document_type, document_id)
);

CREATE INDEX IF NOT EXISTS zoho_document_cache_type_modified_idx
  ON public.zoho_document_cache (document_type, source_modified_at DESC);

-- Prevent overlapping recovery scans and serialize the very short database-only
-- cache patches made by concurrent webhooks (this does not add Zoho API calls).
CREATE TABLE IF NOT EXISTS public.zoho_sync_locks (
  lock_key text PRIMARY KEY,
  locked_until timestamptz NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.try_acquire_zoho_sync_lock(
  requested_key text,
  lease_seconds integer DEFAULT 300
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  acquired boolean := false;
BEGIN
  INSERT INTO public.zoho_sync_locks (lock_key, locked_until, updated_at)
  VALUES (requested_key, now() + make_interval(secs => greatest(30, lease_seconds)), now())
  ON CONFLICT (lock_key) DO UPDATE
    SET locked_until = EXCLUDED.locked_until,
        updated_at = now()
    WHERE public.zoho_sync_locks.locked_until <= now()
  RETURNING true INTO acquired;

  RETURN coalesce(acquired, false);
END;
$$;

CREATE OR REPLACE FUNCTION public.release_zoho_sync_lock(requested_key text)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  DELETE FROM public.zoho_sync_locks WHERE lock_key = requested_key;
$$;

ALTER TABLE public.zoho_webhook_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.zoho_document_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.zoho_sync_locks ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.zoho_webhook_events FROM anon, authenticated;
REVOKE ALL ON public.zoho_document_cache FROM anon, authenticated;
REVOKE ALL ON public.zoho_sync_locks FROM anon, authenticated;
GRANT ALL ON public.zoho_webhook_events TO service_role;
GRANT ALL ON public.zoho_document_cache TO service_role;
GRANT ALL ON public.zoho_sync_locks TO service_role;
REVOKE ALL ON FUNCTION public.try_acquire_zoho_sync_lock(text, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.release_zoho_sync_lock(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.try_acquire_zoho_sync_lock(text, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.release_zoho_sync_lock(text) TO service_role;

-- Cache changes, rather than browser polling, fan out to every signed-in app.
DO $$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['buying_sheet_cache', 'po_tracking_cache', 'suppliers']
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
