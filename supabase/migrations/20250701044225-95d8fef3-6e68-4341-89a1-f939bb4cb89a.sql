
-- Fix the RLS policies for order_files table to handle role checking properly
-- The issue is likely that the role check is failing

-- Drop existing policies
DROP POLICY IF EXISTS "Users can view accessible order files" ON public.order_files;
DROP POLICY IF EXISTS "Users can upload order files" ON public.order_files;
DROP POLICY IF EXISTS "Users can update their own files" ON public.order_files;
DROP POLICY IF EXISTS "Users can delete their own files" ON public.order_files;

-- Create a more robust policy for viewing files
CREATE POLICY "Users can view order files" 
  ON public.order_files 
  FOR SELECT 
  USING (
    -- Allow if user is admin
    EXISTS (
      SELECT 1 FROM public.user_roles 
      WHERE user_id = auth.uid() AND role = 'admin'
    )
    OR
    -- Allow if user has access to the order
    EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = order_id 
      AND (
        o.user_id = auth.uid() 
        OR EXISTS (
          SELECT 1 FROM public.profiles p
          WHERE p.id = auth.uid() AND p.company_id = o.company_id
        )
      )
    )
  );

-- Create a more permissive policy for file uploads that should work
CREATE POLICY "Allow file uploads" 
  ON public.order_files 
  FOR INSERT 
  WITH CHECK (
    -- Must be the user uploading the file
    uploaded_by_user_id = auth.uid()
    AND
    -- Either user is admin (can upload any file type)
    (
      EXISTS (
        SELECT 1 FROM public.user_roles 
        WHERE user_id = auth.uid() AND role = 'admin'
      )
      OR
      -- Or user is client uploading purchase orders only
      (
        file_type = 'purchase-order'
        AND NOT EXISTS (
          SELECT 1 FROM public.user_roles 
          WHERE user_id = auth.uid() AND role = 'admin'
        )
      )
    )
  );

-- Simple policies for updates and deletes
CREATE POLICY "Users can update their files" 
  ON public.order_files 
  FOR UPDATE 
  USING (uploaded_by_user_id = auth.uid());

CREATE POLICY "Users can delete their files" 
  ON public.order_files 
  FOR DELETE 
  USING (uploaded_by_user_id = auth.uid());
