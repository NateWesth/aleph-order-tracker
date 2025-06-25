
-- Create a table for order files
CREATE TABLE public.order_files (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id UUID NOT NULL,
  file_name TEXT NOT NULL,
  file_url TEXT NOT NULL,
  file_type TEXT NOT NULL CHECK (file_type IN ('quote', 'purchase-order', 'invoice')),
  uploaded_by_role TEXT NOT NULL CHECK (uploaded_by_role IN ('admin', 'client')),
  uploaded_by_user_id UUID NOT NULL,
  file_size INTEGER,
  mime_type TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Add Row Level Security (RLS)
ALTER TABLE public.order_files ENABLE ROW LEVEL SECURITY;

-- Policy for admins to see all files
CREATE POLICY "Admins can view all order files" 
  ON public.order_files 
  FOR SELECT 
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles 
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

-- Policy for clients to see files for their orders only
CREATE POLICY "Clients can view their order files" 
  ON public.order_files 
  FOR SELECT 
  USING (
    EXISTS (
      SELECT 1 FROM public.orders o
      JOIN public.user_roles ur ON ur.user_id = auth.uid()
      WHERE o.id = order_id AND o.user_id = auth.uid() AND ur.role = 'user'
    )
  );

-- Policy for admins to upload quotes and invoices
CREATE POLICY "Admins can upload quotes and invoices" 
  ON public.order_files 
  FOR INSERT 
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_roles 
      WHERE user_id = auth.uid() AND role = 'admin'
    ) AND file_type IN ('quote', 'invoice') AND uploaded_by_user_id = auth.uid()
  );

-- Policy for clients to upload purchase orders
CREATE POLICY "Clients can upload purchase orders" 
  ON public.order_files 
  FOR INSERT 
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_roles 
      WHERE user_id = auth.uid() AND role = 'user'
    ) AND file_type = 'purchase-order' AND uploaded_by_user_id = auth.uid()
  );

-- Policy for admins to update their uploaded files
CREATE POLICY "Admins can update their files" 
  ON public.order_files 
  FOR UPDATE 
  USING (
    uploaded_by_user_id = auth.uid() AND
    EXISTS (
      SELECT 1 FROM public.user_roles 
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

-- Policy for clients to update their uploaded files
CREATE POLICY "Clients can update their files" 
  ON public.order_files 
  FOR UPDATE 
  USING (
    uploaded_by_user_id = auth.uid() AND
    EXISTS (
      SELECT 1 FROM public.user_roles 
      WHERE user_id = auth.uid() AND role = 'user'
    )
  );

-- Policy for admins to delete their uploaded files
CREATE POLICY "Admins can delete their files" 
  ON public.order_files 
  FOR DELETE 
  USING (
    uploaded_by_user_id = auth.uid() AND
    EXISTS (
      SELECT 1 FROM public.user_roles 
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

-- Policy for clients to delete their uploaded files
CREATE POLICY "Clients can delete their files" 
  ON public.order_files 
  FOR DELETE 
  USING (
    uploaded_by_user_id = auth.uid() AND
    EXISTS (
      SELECT 1 FROM public.user_roles 
      WHERE user_id = auth.uid() AND role = 'user'
    )
  );

-- Create a storage bucket for order files
INSERT INTO storage.buckets (id, name, public) VALUES ('order-files', 'order-files', true);

-- Create storage policies
CREATE POLICY "Users can upload order files" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'order-files' AND auth.uid() IS NOT NULL);

CREATE POLICY "Users can view order files" ON storage.objects
  FOR SELECT USING (bucket_id = 'order-files' AND auth.uid() IS NOT NULL);

CREATE POLICY "Users can update their order files" ON storage.objects
  FOR UPDATE USING (bucket_id = 'order-files' AND owner = auth.uid());

CREATE POLICY "Users can delete their order files" ON storage.objects
  FOR DELETE USING (bucket_id = 'order-files' AND owner = auth.uid());

-- Add completed_date column to orders table for categorization by completion month
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS completed_date TIMESTAMP WITH TIME ZONE;

-- Enable realtime for order_files table
ALTER TABLE public.order_files REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.order_files;
