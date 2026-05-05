
-- Remove duplicate order_items keeping the oldest (by created_at), preserving any with completed_at
WITH ranked AS (
  SELECT id,
    ROW_NUMBER() OVER (
      PARTITION BY order_id, lower(name), quantity
      ORDER BY (completed_at IS NOT NULL) DESC, created_at ASC, id ASC
    ) AS rn
  FROM public.order_items
)
DELETE FROM public.order_items oi
USING ranked r
WHERE oi.id = r.id AND r.rn > 1;

-- Prevent future duplicate inserts of identical line items within the same order
CREATE UNIQUE INDEX IF NOT EXISTS order_items_dedup_idx
  ON public.order_items (order_id, lower(name), quantity);
