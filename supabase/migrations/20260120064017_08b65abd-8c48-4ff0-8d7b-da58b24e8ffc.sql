-- Create a junction table for multiple purchase orders per order
CREATE TABLE public.order_purchase_orders (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  supplier_id UUID NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
  purchase_order_number TEXT NOT NULL,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(order_id, supplier_id, purchase_order_number)
);

-- Enable RLS
ALTER TABLE public.order_purchase_orders ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Authenticated users can view order purchase orders"
ON public.order_purchase_orders
FOR SELECT
USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can insert order purchase orders"
ON public.order_purchase_orders
FOR INSERT
WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can update order purchase orders"
ON public.order_purchase_orders
FOR UPDATE
USING (auth.uid() IS NOT NULL)
WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Admins can delete order purchase orders"
ON public.order_purchase_orders
FOR DELETE
USING (EXISTS (
  SELECT 1 FROM user_roles
  WHERE user_roles.user_id = auth.uid() AND user_roles.role = 'admin'
));

-- Add trigger for updated_at
CREATE TRIGGER update_order_purchase_orders_updated_at
BEFORE UPDATE ON public.order_purchase_orders
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();