DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'workshop_timer_sessions') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.workshop_timer_sessions;
  END IF;
END;
$$;