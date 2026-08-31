-- Preserve the customer-facing description separately from the reusable item
-- catalogue name/SKU. This is essential for M-MISCELLANEOUS lines, where the
-- same generic SKU represents many unrelated products.

BEGIN;

ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS description text;

-- Recover descriptions that older app versions stored in notes. Do not copy
-- known operational status notes into the description field.
UPDATE public.order_items
SET description = NULLIF(btrim(notes), '')
WHERE description IS NULL
  AND lower(COALESCE(code, '')) LIKE 'm-misc%'
  AND NULLIF(btrim(notes), '') IS NOT NULL
  AND lower(notes) NOT LIKE 'marked ordered from buying sheet%';

CREATE INDEX IF NOT EXISTS order_items_misc_description_idx
  ON public.order_items (lower(code), lower(description))
  WHERE lower(COALESCE(code, '')) LIKE 'm-misc%';

NOTIFY pgrst, 'reload schema';
COMMIT;
