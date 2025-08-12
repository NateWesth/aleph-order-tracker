-- Fix critical security vulnerability: Restrict admin_access_codes table to admin users only

-- Drop the overly permissive policies that allow any authenticated user to access admin codes
DROP POLICY IF EXISTS "Authenticated users can select admin access codes" ON public.admin_access_codes;
DROP POLICY IF EXISTS "Authenticated users can insert admin access codes" ON public.admin_access_codes;
DROP POLICY IF EXISTS "Authenticated users can update admin access codes" ON public.admin_access_codes;
DROP POLICY IF EXISTS "Authenticated users can delete admin access codes" ON public.admin_access_codes;

-- Create secure policies that only allow admin users to manage admin access codes
CREATE POLICY "Only admins can view admin access codes" 
ON public.admin_access_codes 
FOR SELECT 
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles 
    WHERE user_id = auth.uid() AND role = 'admin'::app_role
  )
);

CREATE POLICY "Only admins can insert admin access codes" 
ON public.admin_access_codes 
FOR INSERT 
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.user_roles 
    WHERE user_id = auth.uid() AND role = 'admin'::app_role
  )
);

CREATE POLICY "Only admins can update admin access codes" 
ON public.admin_access_codes 
FOR UPDATE 
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles 
    WHERE user_id = auth.uid() AND role = 'admin'::app_role
  )
);

CREATE POLICY "Only admins can delete admin access codes" 
ON public.admin_access_codes 
FOR DELETE 
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles 
    WHERE user_id = auth.uid() AND role = 'admin'::app_role
  )
);