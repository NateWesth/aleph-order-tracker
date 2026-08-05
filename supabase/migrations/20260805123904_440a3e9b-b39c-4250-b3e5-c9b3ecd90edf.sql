ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS qty_on_po integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS qty_received integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS qty_invoiced integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS qty_completed integer NOT NULL DEFAULT 0;

-- Backfill from existing stage labels so nothing regresses visually
UPDATE public.order_items SET
  qty_on_po = CASE WHEN progress_stage IN ('ordered','in-stock','ready-for-delivery','packing','delivery','completed') THEN quantity ELSE qty_on_po END,
  qty_received = CASE WHEN progress_stage IN ('in-stock','ready-for-delivery','packing','delivery','completed') THEN quantity ELSE qty_received END,
  qty_invoiced = CASE WHEN progress_stage IN ('ready-for-delivery','packing','delivery','completed') THEN quantity ELSE qty_invoiced END,
  qty_completed = CASE WHEN progress_stage = 'completed' THEN quantity ELSE qty_completed END;

CREATE TABLE IF NOT EXISTS public.order_item_po_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_item_id uuid NOT NULL REFERENCES public.order_items(id) ON DELETE CASCADE,
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  sku text,
  zoho_purchaseorder_id text,
  purchase_order_number text,
  vendor_name text,
  quantity_ordered integer NOT NULL DEFAULT 0,
  quantity_received integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.order_item_po_allocations TO authenticated;
GRANT ALL ON public.order_item_po_allocations TO service_role;

ALTER TABLE public.order_item_po_allocations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view po allocations"
  ON public.order_item_po_allocations FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated users can manage po allocations"
  ON public.order_item_po_allocations FOR ALL TO authenticated
  USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

CREATE INDEX IF NOT EXISTS order_item_po_allocations_po_idx ON public.order_item_po_allocations (zoho_purchaseorder_id);
CREATE INDEX IF NOT EXISTS order_item_po_allocations_item_idx ON public.order_item_po_allocations (order_item_id);

CREATE TRIGGER order_item_po_allocations_updated_at
  BEFORE UPDATE ON public.order_item_po_allocations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Keep the item's stage label in sync with its quantity buckets
CREATE OR REPLACE FUNCTION public.sync_order_item_stage_from_quantities()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  q integer := GREATEST(COALESCE(NEW.quantity, 0), 0);
BEGIN
  NEW.qty_on_po := LEAST(GREATEST(COALESCE(NEW.qty_on_po,0), 0), q);
  NEW.qty_received := LEAST(GREATEST(COALESCE(NEW.qty_received,0), 0), NEW.qty_on_po);
  NEW.qty_invoiced := LEAST(GREATEST(COALESCE(NEW.qty_invoiced,0), 0), NEW.qty_received);
  NEW.qty_completed := LEAST(GREATEST(COALESCE(NEW.qty_completed,0), 0), NEW.qty_invoiced);

  IF q = 0 THEN
    RETURN NEW;
  END IF;

  IF NEW.qty_completed >= q THEN
    NEW.progress_stage := 'completed';
  ELSIF NEW.qty_on_po < q THEN
    NEW.progress_stage := 'awaiting-stock';
  ELSIF NEW.qty_received < q THEN
    NEW.progress_stage := 'ordered';
  ELSIF NEW.qty_invoiced < q THEN
    NEW.progress_stage := 'in-stock';
  ELSE
    NEW.progress_stage := 'ready-for-delivery';
  END IF;

  NEW.stock_status := CASE
    WHEN NEW.qty_received >= q THEN 'in-stock'
    WHEN NEW.qty_on_po > 0 THEN 'ordered'
    ELSE 'awaiting'
  END;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_order_item_stage ON public.order_items;
CREATE TRIGGER sync_order_item_stage
  BEFORE INSERT OR UPDATE OF quantity, qty_on_po, qty_received, qty_invoiced, qty_completed
  ON public.order_items
  FOR EACH ROW EXECUTE FUNCTION public.sync_order_item_stage_from_quantities();