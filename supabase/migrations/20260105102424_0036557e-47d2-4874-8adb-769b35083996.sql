-- Add approved field to profiles for admin approval workflow
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS approved boolean DEFAULT false;

-- Add an index for efficient querying of unapproved users
CREATE INDEX IF NOT EXISTS idx_profiles_approved ON public.profiles(approved);

-- Update existing profiles to be approved (current users get grandfathered in)
UPDATE public.profiles SET approved = true WHERE approved IS NULL OR approved = false;

-- Create a simpler order status check - orders will use: 'ordered', 'in-stock', 'delivered'
-- Update existing orders to map to new status
UPDATE public.orders SET status = 'ordered' WHERE status = 'pending';
UPDATE public.orders SET status = 'in-stock' WHERE status = 'in-progress' OR status = 'processing';
UPDATE public.orders SET status = 'delivered' WHERE status = 'completed';

-- Drop the admin_access_codes table since we no longer need it
DROP TABLE IF EXISTS public.admin_access_codes;

-- Make all existing users admins since this is now an admin-only app
-- First, update existing user_roles to admin
UPDATE public.user_roles SET role = 'admin' WHERE role = 'user';

-- Create a function to check if user is approved
CREATE OR REPLACE FUNCTION public.is_user_approved(user_uuid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT approved FROM public.profiles WHERE id = user_uuid),
    false
  )
$$;