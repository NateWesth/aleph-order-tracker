
-- Add daily report preference columns to profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS daily_morning_report boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS daily_afternoon_report boolean NOT NULL DEFAULT false;
