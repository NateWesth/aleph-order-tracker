-- Create suppliers table
CREATE TABLE public.suppliers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  code TEXT NOT NULL UNIQUE,
  contact_person TEXT,
  email TEXT,
  phone TEXT,
  address TEXT,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on suppliers
ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;

-- RLS policies for suppliers (same as companies - all authenticated users can view/manage)
CREATE POLICY "Authenticated users can view suppliers"
ON public.suppliers
FOR SELECT
TO authenticated
USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can insert suppliers"
ON public.suppliers
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can update suppliers"
ON public.suppliers
FOR UPDATE
TO authenticated
USING (auth.uid() IS NOT NULL)
WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Admins can delete suppliers"
ON public.suppliers
FOR DELETE
USING (EXISTS (
  SELECT 1 FROM user_roles
  WHERE user_roles.user_id = auth.uid() AND user_roles.role = 'admin'
));

-- Add purchase order fields to orders table
ALTER TABLE public.orders
ADD COLUMN supplier_id UUID REFERENCES public.suppliers(id),
ADD COLUMN purchase_order_number TEXT;

-- Create trigger for updated_at on suppliers
CREATE TRIGGER update_suppliers_updated_at
BEFORE UPDATE ON public.suppliers
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();