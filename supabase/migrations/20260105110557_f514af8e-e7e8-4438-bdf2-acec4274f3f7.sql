-- Create order_items table for item-level stock tracking
CREATE TABLE public.order_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  code TEXT,
  quantity INTEGER NOT NULL DEFAULT 1,
  notes TEXT,
  stock_status TEXT NOT NULL DEFAULT 'awaiting' CHECK (stock_status IN ('awaiting', 'in-stock')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;

-- Admins can do everything
CREATE POLICY "Admins can manage order items"
ON public.order_items
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_roles.user_id = auth.uid()
    AND user_roles.role = 'admin'
  )
);

-- Users can view items for orders they have access to
CREATE POLICY "Users can view order items"
ON public.order_items
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM orders o
    WHERE o.id = order_items.order_id
    AND (
      o.user_id = auth.uid()
      OR EXISTS (
        SELECT 1 FROM profiles p
        WHERE p.id = auth.uid() AND p.company_id = o.company_id
      )
    )
  )
);

-- Users can insert items for their own orders
CREATE POLICY "Users can insert order items"
ON public.order_items
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM orders o
    WHERE o.id = order_items.order_id
    AND o.user_id = auth.uid()
  )
);

-- Create index for faster lookups
CREATE INDEX idx_order_items_order_id ON public.order_items(order_id);
CREATE INDEX idx_order_items_stock_status ON public.order_items(stock_status);

-- Create function to auto-update order status when all items are in stock
CREATE OR REPLACE FUNCTION public.check_order_stock_status()
RETURNS TRIGGER AS $$
DECLARE
  total_items INTEGER;
  in_stock_items INTEGER;
  current_status TEXT;
BEGIN
  -- Get order's current status
  SELECT status INTO current_status FROM orders WHERE id = NEW.order_id;
  
  -- Only auto-update if order is in "ordered" (awaiting stock) status
  IF current_status = 'ordered' THEN
    -- Count items
    SELECT COUNT(*), COUNT(*) FILTER (WHERE stock_status = 'in-stock')
    INTO total_items, in_stock_items
    FROM order_items
    WHERE order_id = NEW.order_id;
    
    -- If all items are in stock, move order to in-stock status
    IF total_items > 0 AND total_items = in_stock_items THEN
      UPDATE orders SET status = 'in-stock', updated_at = now() WHERE id = NEW.order_id;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Create trigger
CREATE TRIGGER on_order_item_stock_change
AFTER UPDATE OF stock_status ON public.order_items
FOR EACH ROW
EXECUTE FUNCTION public.check_order_stock_status();