
-- First, let's enable RLS on order_files if not already enabled
ALTER TABLE public.order_files ENABLE ROW LEVEL SECURITY;

-- Drop all existing policies to start fresh
DROP POLICY IF EXISTS "Admins can view all order files" ON public.order_files;
DROP POLICY IF EXISTS "Clients can view order files" ON public.order_files;
DROP POLICY IF EXISTS "Clients can view their order files" ON public.order_files;
DROP POLICY IF EXISTS "Admins can upload files" ON public.order_files;
DROP POLICY IF EXISTS "Admins can upload quotes and invoices" ON public.order_files;
DROP POLICY IF EXISTS "Clients can upload purchase orders" ON public.order_files;
DROP POLICY IF EXISTS "Users can update their files" ON public.order_files;
DROP POLICY IF EXISTS "Admins can update their files" ON public.order_files;
DROP POLICY IF EXISTS "Clients can update their files" ON public.order_files;
DROP POLICY IF EXISTS "Users can delete their files" ON public.order_files;
DROP POLICY IF EXISTS "Admins can delete their files" ON public.order_files;
DROP POLICY IF EXISTS "Clients can delete their files" ON public.order_files;

-- Create new simplified RLS policies
-- Policy for authenticated users to view files for orders they have access to
CREATE POLICY "Users can view accessible order files" 
  ON public.order_files 
  FOR SELECT 
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles 
      WHERE user_id = auth.uid() AND role = 'admin'
    )
    OR
    EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = order_id 
      AND (
        o.user_id = auth.uid() 
        OR o.company_id IN (
          SELECT company_id FROM public.profiles 
          WHERE id = auth.uid()
        )
      )
    )
  );

-- Policy for file uploads
CREATE POLICY "Users can upload order files" 
  ON public.order_files 
  FOR INSERT 
  WITH CHECK (
    uploaded_by_user_id = auth.uid()
    AND (
      -- Admins can upload any file type
      EXISTS (
        SELECT 1 FROM public.user_roles 
        WHERE user_id = auth.uid() AND role = 'admin'
      )
      OR
      -- Clients can only upload purchase orders
      (
        file_type = 'purchase-order'
        AND EXISTS (
          SELECT 1 FROM public.user_roles 
          WHERE user_id = auth.uid() AND role = 'user'
        )
        AND EXISTS (
          SELECT 1 FROM public.orders o
          WHERE o.id = order_id 
          AND (
            o.user_id = auth.uid() 
            OR o.company_id IN (
              SELECT company_id FROM public.profiles 
              WHERE id = auth.uid()
            )
          )
        )
      )
    )
  );

-- Policy for file updates
CREATE POLICY "Users can update their own files" 
  ON public.order_files 
  FOR UPDATE 
  USING (uploaded_by_user_id = auth.uid());

-- Policy for file deletion
CREATE POLICY "Users can delete their own files" 
  ON public.order_files 
  FOR DELETE 
  USING (uploaded_by_user_id = auth.uid());

-- Update the file type constraint
ALTER TABLE public.order_files 
DROP CONSTRAINT IF EXISTS order_files_file_type_check;

ALTER TABLE public.order_files 
ADD CONSTRAINT order_files_file_type_check 
CHECK (file_type IN ('quote', 'purchase-order', 'invoice', 'delivery-note'));

-- Create storage bucket if it doesn't exist
INSERT INTO storage.buckets (id, name, public) 
VALUES ('order-files', 'order-files', true)
ON CONFLICT (id) DO NOTHING;

-- Update storage policies
DROP POLICY IF EXISTS "Users can upload order files" ON storage.objects;
DROP POLICY IF EXISTS "Users can view order files" ON storage.objects;
DROP POLICY IF EXISTS "Users can update their order files" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their order files" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload order files" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can view order files" ON storage.objects;

CREATE POLICY "Authenticated users can upload order files" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'order-files' 
    AND auth.uid() IS NOT NULL
  );

CREATE POLICY "Authenticated users can view order files" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'order-files' 
    AND auth.uid() IS NOT NULL
  );

CREATE POLICY "Authenticated users can update order files" ON storage.objects
  FOR UPDATE USING (
    bucket_id = 'order-files' 
    AND auth.uid() IS NOT NULL
  );

CREATE POLICY "Authenticated users can delete order files" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'order-files' 
    AND auth.uid() IS NOT NULL
  );
