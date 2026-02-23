-- Create order_activity_log table to track all order events
CREATE TABLE public.order_activity_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  user_id UUID,
  activity_type TEXT NOT NULL, -- 'status_change', 'file_upload', 'message', 'po_added', 'item_updated', 'created'
  title TEXT NOT NULL,
  description TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.order_activity_log ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Users can view activity for accessible orders"
ON public.order_activity_log FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM orders o
    WHERE o.id = order_activity_log.order_id
    AND (
      o.user_id = auth.uid()
      OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.company_id = o.company_id)
      OR EXISTS (SELECT 1 FROM user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'admin')
    )
  )
);

CREATE POLICY "System can insert activity logs"
ON public.order_activity_log FOR INSERT
WITH CHECK (auth.uid() IS NOT NULL);

-- Index for fast lookups
CREATE INDEX idx_order_activity_log_order_id ON public.order_activity_log(order_id);
CREATE INDEX idx_order_activity_log_created_at ON public.order_activity_log(created_at DESC);

-- Trigger to auto-log status changes on orders
CREATE OR REPLACE FUNCTION public.log_order_status_change()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO public.order_activity_log (order_id, user_id, activity_type, title, description, metadata)
    VALUES (
      NEW.id,
      auth.uid(),
      'status_change',
      'Status changed to ' || COALESCE(NEW.status, 'unknown'),
      'Order status changed from ' || COALESCE(OLD.status, 'pending') || ' to ' || COALESCE(NEW.status, 'unknown'),
      jsonb_build_object('old_status', OLD.status, 'new_status', NEW.status)
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER trigger_log_order_status_change
AFTER UPDATE ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.log_order_status_change();

-- Trigger to auto-log new order creation
CREATE OR REPLACE FUNCTION public.log_order_created()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.order_activity_log (order_id, user_id, activity_type, title, description)
  VALUES (
    NEW.id,
    auth.uid(),
    'created',
    'Order created',
    'Order ' || NEW.order_number || ' was created'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER trigger_log_order_created
AFTER INSERT ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.log_order_created();

-- Trigger to auto-log file uploads
CREATE OR REPLACE FUNCTION public.log_order_file_upload()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.order_activity_log (order_id, user_id, activity_type, title, description, metadata)
  VALUES (
    NEW.order_id,
    NEW.uploaded_by_user_id,
    'file_upload',
    'File uploaded: ' || NEW.file_name,
    NEW.file_name || ' (' || NEW.file_type || ') was uploaded',
    jsonb_build_object('file_name', NEW.file_name, 'file_type', NEW.file_type)
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER trigger_log_order_file_upload
AFTER INSERT ON public.order_files
FOR EACH ROW
EXECUTE FUNCTION public.log_order_file_upload();

-- Trigger to auto-log PO additions
CREATE OR REPLACE FUNCTION public.log_order_po_added()
RETURNS TRIGGER AS $$
DECLARE
  supplier_name TEXT;
BEGIN
  SELECT name INTO supplier_name FROM public.suppliers WHERE id = NEW.supplier_id;
  
  INSERT INTO public.order_activity_log (order_id, user_id, activity_type, title, description, metadata)
  VALUES (
    NEW.order_id,
    auth.uid(),
    'po_added',
    'Purchase order linked: ' || NEW.purchase_order_number,
    'PO ' || NEW.purchase_order_number || ' from ' || COALESCE(supplier_name, 'Unknown') || ' was linked',
    jsonb_build_object('po_number', NEW.purchase_order_number, 'supplier', supplier_name)
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER trigger_log_order_po_added
AFTER INSERT ON public.order_purchase_orders
FOR EACH ROW
EXECUTE FUNCTION public.log_order_po_added();
