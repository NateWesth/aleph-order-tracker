
-- Let's create a more permissive policy that allows all authenticated users to upload files
-- and then we'll handle the file type restrictions in the application logic

-- Drop the restrictive policy
DROP POLICY IF EXISTS "Allow file uploads" ON public.order_files;

-- Create a simpler, more permissive policy for file uploads
CREATE POLICY "Authenticated users can upload files" 
  ON public.order_files 
  FOR INSERT 
  WITH CHECK (
    -- Must be authenticated and uploading their own file
    auth.uid() IS NOT NULL 
    AND uploaded_by_user_id = auth.uid()
  );
