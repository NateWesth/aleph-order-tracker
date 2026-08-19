-- High-volume workspace query indexes.
-- These match the filters and joins used by Orders, Buying Sheet, Progress,
-- Files, tags and supplier/PO workflows. All statements are idempotent.

CREATE INDEX IF NOT EXISTS orders_status_created_idx
  ON public.orders (status, created_at DESC);

CREATE INDEX IF NOT EXISTS orders_company_status_idx
  ON public.orders (company_id, status)
  WHERE company_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS orders_user_status_idx
  ON public.orders (user_id, status)
  WHERE user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS order_items_progress_created_idx
  ON public.order_items (progress_stage, created_at DESC);

CREATE INDEX IF NOT EXISTS order_items_completed_recent_idx
  ON public.order_items (completed_at DESC, code)
  WHERE completed_at IS NOT NULL AND code IS NOT NULL;

CREATE INDEX IF NOT EXISTS order_items_code_created_idx
  ON public.order_items (code, created_at DESC)
  WHERE code IS NOT NULL;

CREATE INDEX IF NOT EXISTS order_purchase_orders_order_idx
  ON public.order_purchase_orders (order_id);

CREATE INDEX IF NOT EXISTS order_purchase_orders_supplier_idx
  ON public.order_purchase_orders (supplier_id);

CREATE INDEX IF NOT EXISTS order_files_order_created_idx
  ON public.order_files (order_id, created_at DESC);

CREATE INDEX IF NOT EXISTS order_tag_assignments_order_idx
  ON public.order_tag_assignments (order_id);

CREATE INDEX IF NOT EXISTS order_tag_assignments_tag_idx
  ON public.order_tag_assignments (tag_id);

CREATE INDEX IF NOT EXISTS webhook_events_status_received_idx
  ON public.zoho_webhook_events (status, received_at DESC);
