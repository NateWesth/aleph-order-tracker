-- Operational continuity, service registers and guarded order tools.
-- Everything in this migration is local to Supabase; no Zoho API calls are made.

CREATE TABLE IF NOT EXISTS public.user_activity_checkpoints (
  user_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.responsibility_delegations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  delegate_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  scopes text[] NOT NULL DEFAULT ARRAY['all']::text[],
  notes text,
  status text NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled','active','cancelled','completed')),
  created_by uuid NOT NULL DEFAULT auth.uid() REFERENCES public.profiles(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (owner_id <> delegate_id),
  CHECK (ends_at > starts_at)
);

CREATE TABLE IF NOT EXISTS public.return_cases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rma_number text NOT NULL UNIQUE,
  client_name text NOT NULL,
  order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  item_description text NOT NULL,
  quantity integer NOT NULL DEFAULT 1 CHECK (quantity > 0),
  reason text NOT NULL,
  resolution text,
  status text NOT NULL DEFAULT 'requested' CHECK (status IN ('requested','received','inspecting','supplier_return','replacement','refund','completed','rejected')),
  priority text NOT NULL DEFAULT 'normal' CHECK (priority IN ('low','normal','high','urgent')),
  assigned_to uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  due_date date,
  completed_at timestamptz,
  created_by uuid NOT NULL DEFAULT auth.uid() REFERENCES public.profiles(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.loan_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_code text NOT NULL UNIQUE,
  tool_name text NOT NULL,
  serial_number text,
  borrower_name text NOT NULL,
  borrower_type text NOT NULL DEFAULT 'customer' CHECK (borrower_type IN ('customer','employee','supplier')),
  checked_out_at timestamptz NOT NULL DEFAULT now(),
  due_back_at timestamptz NOT NULL,
  returned_at timestamptz,
  condition_out text,
  condition_in text,
  responsible_user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  notes text,
  created_by uuid NOT NULL DEFAULT auth.uid() REFERENCES public.profiles(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (due_back_at > checked_out_at)
);

CREATE TABLE IF NOT EXISTS public.calibration_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_code text NOT NULL UNIQUE,
  tool_name text NOT NULL,
  serial_number text,
  calibration_interval_months integer NOT NULL DEFAULT 12 CHECK (calibration_interval_months BETWEEN 1 AND 120),
  last_calibrated_on date,
  next_due_on date NOT NULL,
  provider text,
  certificate_reference text,
  certificate_url text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','due','out_for_calibration','expired','retired')),
  responsible_user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  notes text,
  created_by uuid NOT NULL DEFAULT auth.uid() REFERENCES public.profiles(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.product_substitutions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_item_id uuid NOT NULL REFERENCES public.items(id) ON DELETE CASCADE,
  alternative_item_id uuid NOT NULL REFERENCES public.items(id) ON DELETE CASCADE,
  compatibility_note text,
  preference_rank integer NOT NULL DEFAULT 1 CHECK (preference_rank BETWEEN 1 AND 99),
  active boolean NOT NULL DEFAULT true,
  created_by uuid NOT NULL DEFAULT auth.uid() REFERENCES public.profiles(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source_item_id, alternative_item_id),
  CHECK (source_item_id <> alternative_item_id)
);

CREATE TABLE IF NOT EXISTS public.order_relationships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  related_order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  relationship_type text NOT NULL CHECK (relationship_type IN ('split_from','merged_into')),
  created_by uuid NOT NULL DEFAULT auth.uid() REFERENCES public.profiles(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source_order_id, related_order_id, relationship_type),
  CHECK (source_order_id <> related_order_id)
);

CREATE INDEX IF NOT EXISTS delegation_active_window_idx ON public.responsibility_delegations(delegate_id, starts_at, ends_at) WHERE status <> 'cancelled';
CREATE INDEX IF NOT EXISTS return_cases_open_idx ON public.return_cases(status, priority, due_date) WHERE completed_at IS NULL;
CREATE INDEX IF NOT EXISTS loan_assets_due_idx ON public.loan_assets(due_back_at) WHERE returned_at IS NULL;
CREATE INDEX IF NOT EXISTS calibration_assets_due_idx ON public.calibration_assets(next_due_on) WHERE status <> 'retired';
CREATE INDEX IF NOT EXISTS product_substitutions_source_idx ON public.product_substitutions(source_item_id, preference_rank) WHERE active;

CREATE OR REPLACE FUNCTION public.prepare_operational_register_record()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  NEW.updated_at := now();
  IF TG_TABLE_NAME = 'responsibility_delegations' THEN
    IF NEW.status <> 'cancelled' THEN
      NEW.status := CASE WHEN now() < NEW.starts_at THEN 'scheduled' WHEN now() <= NEW.ends_at THEN 'active' ELSE 'completed' END;
    END IF;
  ELSIF TG_TABLE_NAME = 'return_cases' THEN
    NEW.completed_at := CASE WHEN NEW.status IN ('completed','rejected') THEN coalesce(NEW.completed_at, now()) ELSE NULL END;
  ELSIF TG_TABLE_NAME = 'loan_assets' THEN
    NEW.asset_code := upper(btrim(NEW.asset_code));
  ELSIF TG_TABLE_NAME = 'calibration_assets' THEN
    NEW.asset_code := upper(btrim(NEW.asset_code));
    IF NEW.last_calibrated_on IS NOT NULL AND (TG_OP = 'INSERT' OR NEW.last_calibrated_on IS DISTINCT FROM OLD.last_calibrated_on OR NEW.calibration_interval_months IS DISTINCT FROM OLD.calibration_interval_months) THEN
      NEW.next_due_on := (NEW.last_calibrated_on + make_interval(months => NEW.calibration_interval_months))::date;
    END IF;
    IF NEW.status NOT IN ('out_for_calibration','retired') THEN
      NEW.status := CASE WHEN NEW.next_due_on < CURRENT_DATE THEN 'expired' WHEN NEW.next_due_on <= CURRENT_DATE + 30 THEN 'due' ELSE 'active' END;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prepare_delegation ON public.responsibility_delegations;
CREATE TRIGGER trg_prepare_delegation BEFORE INSERT OR UPDATE ON public.responsibility_delegations FOR EACH ROW EXECUTE FUNCTION public.prepare_operational_register_record();
DROP TRIGGER IF EXISTS trg_prepare_return_case ON public.return_cases;
CREATE TRIGGER trg_prepare_return_case BEFORE INSERT OR UPDATE ON public.return_cases FOR EACH ROW EXECUTE FUNCTION public.prepare_operational_register_record();
DROP TRIGGER IF EXISTS trg_prepare_loan_asset ON public.loan_assets;
CREATE TRIGGER trg_prepare_loan_asset BEFORE INSERT OR UPDATE ON public.loan_assets FOR EACH ROW EXECUTE FUNCTION public.prepare_operational_register_record();
DROP TRIGGER IF EXISTS trg_prepare_calibration_asset ON public.calibration_assets;
CREATE TRIGGER trg_prepare_calibration_asset BEFORE INSERT OR UPDATE ON public.calibration_assets FOR EACH ROW EXECUTE FUNCTION public.prepare_operational_register_record();

CREATE OR REPLACE FUNCTION public.notify_responsibility_cover()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE owner_name text;
BEGIN
  IF NEW.status = 'cancelled' OR (TG_OP = 'UPDATE' AND NEW.delegate_id IS NOT DISTINCT FROM OLD.delegate_id AND NEW.starts_at IS NOT DISTINCT FROM OLD.starts_at AND NEW.ends_at IS NOT DISTINCT FROM OLD.ends_at) THEN RETURN NEW; END IF;
  SELECT coalesce(full_name, email, 'A teammate') INTO owner_name FROM public.profiles WHERE id = NEW.owner_id;
  INSERT INTO public.notifications(user_id, type, title, message, metadata)
  VALUES (NEW.delegate_id, 'responsibility_cover', 'Temporary cover assigned', owner_name || ' asked you to cover work from ' || to_char(NEW.starts_at AT TIME ZONE 'Africa/Johannesburg','DD Mon') || ' to ' || to_char(NEW.ends_at AT TIME ZONE 'Africa/Johannesburg','DD Mon') || '.', jsonb_build_object('workspace','my-work','delegation_id',NEW.id));
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_notify_responsibility_cover ON public.responsibility_delegations;
CREATE TRIGGER trg_notify_responsibility_cover AFTER INSERT OR UPDATE ON public.responsibility_delegations FOR EACH ROW EXECUTE FUNCTION public.notify_responsibility_cover();

-- A split moves whole, untouched item lines only. This prevents PO, receipt,
-- invoice or fulfillment quantities from being silently divided incorrectly.
CREATE OR REPLACE FUNCTION public.split_order_items(p_source_order_id uuid, p_item_ids uuid[], p_new_order_number text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE source public.orders%ROWTYPE; new_id uuid; invalid_count integer; valid_count integer;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND approved IS TRUE) THEN RAISE EXCEPTION 'Approved team access required'; END IF;
  IF coalesce(array_length(p_item_ids,1),0) = 0 THEN RAISE EXCEPTION 'Select at least one item'; END IF;
  IF nullif(btrim(p_new_order_number),'') IS NULL THEN RAISE EXCEPTION 'A new order number is required'; END IF;
  SELECT * INTO source FROM public.orders WHERE id = p_source_order_id FOR UPDATE;
  IF source.id IS NULL OR source.status = 'delivered' THEN RAISE EXCEPTION 'Only an open order can be split'; END IF;
  SELECT count(*) INTO valid_count FROM public.order_items WHERE id = ANY(p_item_ids) AND order_id = p_source_order_id;
  IF valid_count <> cardinality(p_item_ids) THEN RAISE EXCEPTION 'One or more selected items do not belong to this order'; END IF;
  SELECT count(*) INTO invalid_count FROM public.order_items WHERE id = ANY(p_item_ids) AND order_id = p_source_order_id AND (qty_on_po > 0 OR qty_received > 0 OR qty_invoiced > 0 OR qty_completed > 0);
  IF invalid_count > 0 THEN RAISE EXCEPTION 'Processed item lines cannot be split; move only untouched lines'; END IF;
  IF (SELECT count(*) FROM public.order_items WHERE order_id = p_source_order_id) <= coalesce(array_length(p_item_ids,1),0) THEN RAISE EXCEPTION 'At least one item must remain on the original order'; END IF;
  INSERT INTO public.orders(order_number, company_id, user_id, assigned_to, status, urgency, description, notes, reference, total_amount, fulfillment_method)
  VALUES (btrim(p_new_order_number), source.company_id, source.user_id, source.assigned_to, source.status, source.urgency, source.description, 'Split from ' || source.order_number, source.reference, NULL, source.fulfillment_method)
  RETURNING id INTO new_id;
  UPDATE public.order_items SET order_id = new_id, updated_at = now() WHERE order_id = p_source_order_id AND id = ANY(p_item_ids);
  INSERT INTO public.order_relationships(source_order_id, related_order_id, relationship_type) VALUES (p_source_order_id, new_id, 'split_from');
  INSERT INTO public.order_activity_log(order_id, activity_type, title, description) VALUES (p_source_order_id, 'order_split', 'Order split', array_length(p_item_ids,1) || ' item line(s) moved to ' || btrim(p_new_order_number));
  INSERT INTO public.order_activity_log(order_id, activity_type, title, description) VALUES (new_id, 'order_split', 'Created from split', 'Created from ' || source.order_number);
  RETURN new_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.merge_orders(p_source_order_id uuid, p_target_order_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE source public.orders%ROWTYPE; target public.orders%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND approved IS TRUE) THEN RAISE EXCEPTION 'Approved team access required'; END IF;
  IF p_source_order_id = p_target_order_id THEN RAISE EXCEPTION 'Choose two different orders'; END IF;
  SELECT * INTO source FROM public.orders WHERE id = p_source_order_id FOR UPDATE;
  SELECT * INTO target FROM public.orders WHERE id = p_target_order_id FOR UPDATE;
  IF source.id IS NULL OR target.id IS NULL OR source.status = 'delivered' OR target.status = 'delivered' THEN RAISE EXCEPTION 'Both orders must be open'; END IF;
  IF source.company_id IS DISTINCT FROM target.company_id THEN RAISE EXCEPTION 'Orders for different customers cannot be merged'; END IF;
  UPDATE public.order_items SET order_id = target.id, updated_at = now() WHERE order_id = source.id;
  UPDATE public.order_purchase_orders SET order_id = target.id, updated_at = now() WHERE order_id = source.id AND NOT EXISTS (SELECT 1 FROM public.order_purchase_orders existing WHERE existing.order_id = target.id AND existing.purchase_order_number = public.order_purchase_orders.purchase_order_number);
  DELETE FROM public.order_purchase_orders WHERE order_id = source.id;
  UPDATE public.orders SET status = 'delivered', completed_date = now(), notes = concat_ws(E'\n', notes, '[Merged into ' || target.order_number || ']'), updated_at = now() WHERE id = source.id;
  INSERT INTO public.order_relationships(source_order_id, related_order_id, relationship_type) VALUES (source.id, target.id, 'merged_into');
  INSERT INTO public.order_activity_log(order_id, activity_type, title, description) VALUES (target.id, 'order_merge', 'Orders merged', source.order_number || ' was merged into this order');
  RETURN target.id;
END;
$$;

CREATE OR REPLACE FUNCTION public.apply_item_substitution(p_order_item_id uuid, p_alternative_item_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE current_line public.order_items%ROWTYPE; replacement public.items%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND approved IS TRUE) THEN RAISE EXCEPTION 'Approved team access required'; END IF;
  SELECT * INTO current_line FROM public.order_items WHERE id = p_order_item_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order item not found'; END IF;
  IF current_line.qty_on_po > 0 OR current_line.qty_received > 0 OR current_line.qty_invoiced > 0 OR current_line.qty_completed > 0 THEN RAISE EXCEPTION 'A processed item cannot be substituted'; END IF;
  SELECT * INTO replacement FROM public.items WHERE id = p_alternative_item_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Alternative item not found'; END IF;
  UPDATE public.order_items SET name = replacement.name, code = replacement.code, description = replacement.description, notes = concat_ws(E'\n', notes, '[Substituted from ' || coalesce(current_line.code,current_line.name) || ']'), updated_at = now() WHERE id = p_order_item_id;
  INSERT INTO public.order_activity_log(order_id, activity_type, title, description) VALUES (current_line.order_id, 'item_substitution', 'Alternative product applied', coalesce(current_line.code,current_line.name) || ' changed to ' || coalesce(replacement.code,replacement.name));
END;
$$;

ALTER TABLE public.user_activity_checkpoints ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.responsibility_delegations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.return_cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loan_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.calibration_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_substitutions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_relationships ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own checkpoint" ON public.user_activity_checkpoints FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "Participants view cover" ON public.responsibility_delegations FOR SELECT TO authenticated USING (owner_id = auth.uid() OR delegate_id = auth.uid() OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "Users create own cover" ON public.responsibility_delegations FOR INSERT TO authenticated WITH CHECK (owner_id = auth.uid() AND created_by = auth.uid());
CREATE POLICY "Owners manage cover" ON public.responsibility_delegations FOR UPDATE TO authenticated USING (owner_id = auth.uid() OR public.has_role(auth.uid(),'admin')) WITH CHECK (owner_id = auth.uid() OR public.has_role(auth.uid(),'admin'));

CREATE POLICY "Team views return cases" ON public.return_cases FOR SELECT TO authenticated USING (true);
CREATE POLICY "Team creates return cases" ON public.return_cases FOR INSERT TO authenticated WITH CHECK (created_by = auth.uid());
CREATE POLICY "Team updates return cases" ON public.return_cases FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Team views loan assets" ON public.loan_assets FOR SELECT TO authenticated USING (true);
CREATE POLICY "Team creates loan assets" ON public.loan_assets FOR INSERT TO authenticated WITH CHECK (created_by = auth.uid());
CREATE POLICY "Team updates loan assets" ON public.loan_assets FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Team views calibration assets" ON public.calibration_assets FOR SELECT TO authenticated USING (true);
CREATE POLICY "Team creates calibration assets" ON public.calibration_assets FOR INSERT TO authenticated WITH CHECK (created_by = auth.uid());
CREATE POLICY "Team updates calibration assets" ON public.calibration_assets FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Team views substitutions" ON public.product_substitutions FOR SELECT TO authenticated USING (true);
CREATE POLICY "Team creates substitutions" ON public.product_substitutions FOR INSERT TO authenticated WITH CHECK (created_by = auth.uid());
CREATE POLICY "Team updates substitutions" ON public.product_substitutions FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Team views order relationships" ON public.order_relationships FOR SELECT TO authenticated USING (true);
CREATE POLICY "Functions create order relationships" ON public.order_relationships FOR INSERT TO authenticated WITH CHECK (created_by = auth.uid());

GRANT SELECT, INSERT, UPDATE ON public.user_activity_checkpoints, public.responsibility_delegations, public.return_cases, public.loan_assets, public.calibration_assets, public.product_substitutions, public.order_relationships TO authenticated;
GRANT EXECUTE ON FUNCTION public.split_order_items(uuid,uuid[],text), public.merge_orders(uuid,uuid), public.apply_item_substitution(uuid,uuid) TO authenticated;
GRANT ALL ON public.user_activity_checkpoints, public.responsibility_delegations, public.return_cases, public.loan_assets, public.calibration_assets, public.product_substitutions, public.order_relationships TO service_role;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='return_cases') THEN ALTER PUBLICATION supabase_realtime ADD TABLE public.return_cases; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='loan_assets') THEN ALTER PUBLICATION supabase_realtime ADD TABLE public.loan_assets; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='calibration_assets') THEN ALTER PUBLICATION supabase_realtime ADD TABLE public.calibration_assets; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='responsibility_delegations') THEN ALTER PUBLICATION supabase_realtime ADD TABLE public.responsibility_delegations; END IF;
END $$;
