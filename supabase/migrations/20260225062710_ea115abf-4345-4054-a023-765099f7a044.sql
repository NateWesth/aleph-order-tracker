
-- Fix 1: Tighten overly permissive RLS policies
-- Per project memory: all authenticated users should access orders/companies,
-- but policies should at least REQUIRE authentication (not USING true)

-- Orders: Fix "Authenticated users can view all orders" 
DROP POLICY IF EXISTS "Authenticated users can view all orders" ON public.orders;
CREATE POLICY "Authenticated users can view all orders" 
ON public.orders FOR SELECT 
USING (auth.uid() IS NOT NULL);

-- Orders: Fix "Authenticated users can update orders"
DROP POLICY IF EXISTS "Authenticated users can update orders" ON public.orders;
CREATE POLICY "Authenticated users can update orders" 
ON public.orders FOR UPDATE 
USING (auth.uid() IS NOT NULL)
WITH CHECK (auth.uid() IS NOT NULL);

-- Order Items: Fix "Authenticated users can update order items"
DROP POLICY IF EXISTS "Authenticated users can update order items" ON public.order_items;
CREATE POLICY "Authenticated users can update order items" 
ON public.order_items FOR UPDATE 
USING (auth.uid() IS NOT NULL)
WITH CHECK (auth.uid() IS NOT NULL);

-- Order Items: Fix "Authenticated users can view all order items"
DROP POLICY IF EXISTS "Authenticated users can view all order items" ON public.order_items;
CREATE POLICY "Authenticated users can view all order items" 
ON public.order_items FOR SELECT 
USING (auth.uid() IS NOT NULL);

-- Fix 2: Make order-files storage bucket private
UPDATE storage.buckets SET public = false WHERE id = 'order-files';

-- Fix storage policies - require ownership checks
DROP POLICY IF EXISTS "Authenticated users can view order files" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload order files" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update order files" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete order files" ON storage.objects;

-- View: admins see all, users see files for their orders/company
CREATE POLICY "Users can view their order files" ON storage.objects
FOR SELECT USING (
  bucket_id = 'order-files' AND
  auth.uid() IS NOT NULL AND
  (
    public.has_role(auth.uid(), 'admin') OR
    EXISTS (
      SELECT 1 FROM public.order_files of_tbl
      JOIN public.orders o ON of_tbl.order_id = o.id
      WHERE of_tbl.file_url LIKE '%' || storage.objects.name || '%'
      AND (
        o.user_id = auth.uid() OR 
        o.company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid())
      )
    )
  )
);

-- Upload: any authenticated user (upload control is via order_files table RLS)
CREATE POLICY "Authenticated users can upload order files" ON storage.objects
FOR INSERT WITH CHECK (
  bucket_id = 'order-files' AND auth.uid() IS NOT NULL
);

-- Update: admins or file owner
CREATE POLICY "Users can update their order files" ON storage.objects
FOR UPDATE USING (
  bucket_id = 'order-files' AND
  auth.uid() IS NOT NULL AND
  (public.has_role(auth.uid(), 'admin') OR owner = auth.uid())
);

-- Delete: admins or file owner
CREATE POLICY "Users can delete their order files" ON storage.objects
FOR DELETE USING (
  bucket_id = 'order-files' AND
  auth.uid() IS NOT NULL AND
  (public.has_role(auth.uid(), 'admin') OR owner = auth.uid())
);
