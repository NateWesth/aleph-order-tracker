ALTER TABLE public.reps DROP CONSTRAINT IF EXISTS reps_commission_method_check;
ALTER TABLE public.reps ADD CONSTRAINT reps_commission_method_check
CHECK (commission_method IN ('margin_scaled', 'half_markup_below_25', 'profit_split_60', 'profit_split_28'));