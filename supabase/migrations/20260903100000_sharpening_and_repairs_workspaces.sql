-- Manual workshop workspaces. These tables never depend on Zoho, webhooks or API polling.
CREATE TABLE IF NOT EXISTS public.sharpening_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  date_received date NOT NULL DEFAULT CURRENT_DATE,
  job_number text NOT NULL,
  customer_name text NOT NULL,
  quantity integer NOT NULL DEFAULT 1 CHECK (quantity > 0),
  priority text NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  order_number text,
  assigned_to uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  legacy_assignee_names text,
  status text NOT NULL DEFAULT 'not_started' CHECK (status IN ('not_started', 'next', 'awaiting_quote_approval', 'pending_sent_in', 'working_on_it', 'completed')),
  deadline_date date,
  invoiced boolean NOT NULL DEFAULT false,
  invoice_number text,
  third_party_name text,
  third_party_quantity integer CHECK (third_party_quantity IS NULL OR third_party_quantity >= 0),
  third_party_reference text,
  third_party_status text CHECK (third_party_status IS NULL OR third_party_status IN ('not_started', 'next', 'awaiting_quote_approval', 'pending_sent_in', 'working_on_it', 'completed')),
  notes text,
  completed_at timestamptz,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (job_number)
);

CREATE TABLE IF NOT EXISTS public.repair_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_number text NOT NULL,
  client text NOT NULL,
  tool_code text NOT NULL,
  tool_information text NOT NULL,
  date_received_by_client date NOT NULL DEFAULT CURRENT_DATE,
  supplier_information text,
  customer_information text,
  assigned_to uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  priority text NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  status text NOT NULL DEFAULT 'not_started' CHECK (status IN ('not_started', 'next', 'awaiting_quote_approval', 'pending_sent_in', 'working_on_it', 'completed', 'scrapped')),
  deadline_date date,
  date_received_back_from_supplier date,
  warranty_months integer CHECK (warranty_months IS NULL OR warranty_months BETWEEN 0 AND 120),
  warranty_expires_at date,
  is_warranty boolean NOT NULL DEFAULT false,
  warranty_source_ticket_id uuid REFERENCES public.repair_tickets(id) ON DELETE SET NULL,
  invoiced boolean NOT NULL DEFAULT false,
  invoice_number text,
  notes text,
  scrap_reason text,
  scrapped_at timestamptz,
  scrapped_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  completed_at timestamptz,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (ticket_number)
);

CREATE INDEX IF NOT EXISTS sharpening_jobs_active_idx ON public.sharpening_jobs(status, deadline_date, date_received DESC);
CREATE INDEX IF NOT EXISTS sharpening_jobs_month_idx ON public.sharpening_jobs(date_received DESC);
CREATE INDEX IF NOT EXISTS repair_tickets_active_idx ON public.repair_tickets(status, is_warranty, deadline_date, date_received_by_client DESC);
CREATE INDEX IF NOT EXISTS repair_tickets_tool_warranty_idx ON public.repair_tickets(lower(btrim(tool_code)), warranty_expires_at DESC)
  WHERE warranty_expires_at IS NOT NULL;

ALTER TABLE public.sharpening_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.repair_tickets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Team can view sharpening jobs" ON public.sharpening_jobs;
CREATE POLICY "Team can view sharpening jobs" ON public.sharpening_jobs FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Team can create sharpening jobs" ON public.sharpening_jobs;
CREATE POLICY "Team can create sharpening jobs" ON public.sharpening_jobs FOR INSERT TO authenticated WITH CHECK (created_by = auth.uid());
DROP POLICY IF EXISTS "Team can update sharpening jobs" ON public.sharpening_jobs;
CREATE POLICY "Team can update sharpening jobs" ON public.sharpening_jobs FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Admins can delete sharpening jobs" ON public.sharpening_jobs;
CREATE POLICY "Admins can delete sharpening jobs" ON public.sharpening_jobs FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Team can view repair tickets" ON public.repair_tickets;
CREATE POLICY "Team can view repair tickets" ON public.repair_tickets FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Team can create repair tickets" ON public.repair_tickets;
CREATE POLICY "Team can create repair tickets" ON public.repair_tickets FOR INSERT TO authenticated WITH CHECK (created_by = auth.uid());
DROP POLICY IF EXISTS "Team can update repair tickets" ON public.repair_tickets;
CREATE POLICY "Team can update repair tickets" ON public.repair_tickets FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Admins can delete repair tickets" ON public.repair_tickets;
CREATE POLICY "Admins can delete repair tickets" ON public.repair_tickets FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

GRANT SELECT, INSERT, UPDATE ON public.sharpening_jobs, public.repair_tickets TO authenticated;
GRANT ALL ON public.sharpening_jobs, public.repair_tickets TO service_role;

CREATE OR REPLACE FUNCTION public.prepare_manual_workshop_record()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  matched_ticket public.repair_tickets%ROWTYPE;
  comparison_date date;
BEGIN
  NEW.updated_at := now();

  IF TG_TABLE_NAME = 'sharpening_jobs' THEN
    NEW.invoice_number := CASE WHEN NEW.invoiced THEN nullif(btrim(NEW.invoice_number), '') ELSE NULL END;
    IF NEW.status = 'completed' AND NEW.completed_at IS NULL THEN NEW.completed_at := now(); END IF;
    IF NEW.status <> 'completed' THEN NEW.completed_at := NULL; END IF;
    RETURN NEW;
  END IF;

  NEW.tool_code := upper(btrim(NEW.tool_code));
  NEW.invoice_number := CASE WHEN NEW.invoiced THEN nullif(btrim(NEW.invoice_number), '') ELSE NULL END;
  IF NEW.date_received_back_from_supplier IS NOT NULL AND coalesce(NEW.warranty_months, 0) > 0 THEN
    NEW.warranty_expires_at := (NEW.date_received_back_from_supplier + make_interval(months => NEW.warranty_months))::date;
  ELSIF TG_OP <> 'INSERT' THEN
    NEW.warranty_expires_at := NULL;
  END IF;

  IF NEW.status = 'scrapped' THEN
    NEW.scrapped_at := coalesce(NEW.scrapped_at, now());
    NEW.scrapped_by := coalesce(NEW.scrapped_by, auth.uid());
    NEW.completed_at := coalesce(NEW.completed_at, now());
  ELSIF NEW.status = 'completed' THEN
    NEW.completed_at := coalesce(NEW.completed_at, now());
    NEW.scrapped_at := NULL;
    NEW.scrapped_by := NULL;
  ELSE
    NEW.completed_at := NULL;
    NEW.scrapped_at := NULL;
    NEW.scrapped_by := NULL;
  END IF;

  -- A repeat ticket is a warranty job when the same tool code has a prior
  -- supplier-return date and its selected warranty term covers this intake date.
  comparison_date := coalesce(NEW.date_received_by_client, CURRENT_DATE);
  SELECT * INTO matched_ticket
  FROM public.repair_tickets candidate
  WHERE candidate.id IS DISTINCT FROM NEW.id
    AND lower(btrim(candidate.tool_code)) = lower(btrim(NEW.tool_code))
    AND candidate.date_received_back_from_supplier IS NOT NULL
    AND candidate.warranty_expires_at IS NOT NULL
    AND candidate.date_received_back_from_supplier <= comparison_date
    AND candidate.warranty_expires_at >= comparison_date
    AND candidate.status IN ('completed', 'scrapped')
  ORDER BY candidate.warranty_expires_at DESC
  LIMIT 1;

  IF FOUND THEN
    NEW.is_warranty := true;
    NEW.warranty_source_ticket_id := matched_ticket.id;
  ELSIF TG_OP = 'INSERT' AND coalesce(NEW.is_warranty, false) THEN
    NULL; -- Preserve explicitly imported warranty-sheet records.
  ELSIF NEW.warranty_source_ticket_id IS NULL THEN
    NEW.is_warranty := false;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prepare_sharpening_job ON public.sharpening_jobs;
CREATE TRIGGER trg_prepare_sharpening_job BEFORE INSERT OR UPDATE ON public.sharpening_jobs
FOR EACH ROW EXECUTE FUNCTION public.prepare_manual_workshop_record();
DROP TRIGGER IF EXISTS trg_prepare_repair_ticket ON public.repair_tickets;
CREATE TRIGGER trg_prepare_repair_ticket BEFORE INSERT OR UPDATE ON public.repair_tickets
FOR EACH ROW EXECUTE FUNCTION public.prepare_manual_workshop_record();

CREATE OR REPLACE FUNCTION public.notify_workshop_assignment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  reference_number text;
  workspace text;
BEGIN
  IF NEW.created_by IS NULL OR NEW.assigned_to IS NULL OR (TG_OP = 'UPDATE' AND NEW.assigned_to IS NOT DISTINCT FROM OLD.assigned_to) THEN RETURN NEW; END IF;
  IF TG_TABLE_NAME = 'sharpening_jobs' THEN
    reference_number := NEW.job_number; workspace := 'sharpening';
  ELSE
    reference_number := NEW.ticket_number; workspace := 'repairs';
  END IF;
  INSERT INTO public.notifications(user_id, type, title, message, order_number, metadata)
  VALUES (NEW.assigned_to, 'workshop_assignment', 'Workshop job assigned',
    reference_number || ' has been assigned to you.', reference_number,
    jsonb_build_object('entity_type', workspace, 'entity_id', NEW.id, 'workspace', workspace));
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_sharpening_assignment ON public.sharpening_jobs;
CREATE TRIGGER trg_notify_sharpening_assignment AFTER INSERT OR UPDATE OF assigned_to ON public.sharpening_jobs
FOR EACH ROW EXECUTE FUNCTION public.notify_workshop_assignment();
DROP TRIGGER IF EXISTS trg_notify_repair_assignment ON public.repair_tickets;
CREATE TRIGGER trg_notify_repair_assignment AFTER INSERT OR UPDATE OF assigned_to ON public.repair_tickets
FOR EACH ROW EXECUTE FUNCTION public.notify_workshop_assignment();

-- Allow the existing comments, replies, mentions and reactions on both workspaces.
ALTER TABLE public.entity_comments DROP CONSTRAINT IF EXISTS entity_comments_entity_type_check;
ALTER TABLE public.entity_comments ADD CONSTRAINT entity_comments_entity_type_check
  CHECK (entity_type IN ('delivery', 'collection', 'sharpening', 'repair'));

ALTER TABLE public.sharpening_jobs REPLICA IDENTITY FULL;
ALTER TABLE public.repair_tickets REPLICA IDENTITY FULL;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='sharpening_jobs') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.sharpening_jobs;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='repair_tickets') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.repair_tickets;
  END IF;
END $$;
