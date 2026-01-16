-- Allow all authenticated users to insert companies (not just admins)
CREATE POLICY "Authenticated users can insert companies"
ON public.companies
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() IS NOT NULL);

-- Allow all authenticated users to update companies
CREATE POLICY "Authenticated users can update companies"
ON public.companies
FOR UPDATE
TO authenticated
USING (auth.uid() IS NOT NULL)
WITH CHECK (auth.uid() IS NOT NULL);