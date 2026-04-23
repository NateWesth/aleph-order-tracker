ALTER TABLE public.reps
ADD COLUMN IF NOT EXISTS commission_method text NOT NULL DEFAULT 'margin_scaled';

ALTER TABLE public.reps
DROP CONSTRAINT IF EXISTS reps_commission_method_check;

ALTER TABLE public.reps
ADD CONSTRAINT reps_commission_method_check
CHECK (commission_method IN ('margin_scaled', 'half_markup_below_25'));