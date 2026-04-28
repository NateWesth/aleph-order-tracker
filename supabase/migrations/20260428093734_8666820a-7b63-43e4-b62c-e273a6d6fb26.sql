-- Switch default commission method to the half-markup rule and update existing reps.
ALTER TABLE public.reps ALTER COLUMN commission_method SET DEFAULT 'half_markup_below_25';
UPDATE public.reps SET commission_method = 'half_markup_below_25' WHERE commission_method = 'margin_scaled';