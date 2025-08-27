-- Create order updates table for messages/comments
CREATE TABLE public.order_updates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id UUID NOT NULL,
  user_id UUID NOT NULL,
  message TEXT NOT NULL,
  parent_id UUID NULL, -- For replies to updates
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create table to track read status of updates
CREATE TABLE public.order_update_reads (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  order_update_id UUID NOT NULL,
  user_id UUID NOT NULL,
  read_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(order_update_id, user_id)
);

-- Enable RLS
ALTER TABLE public.order_updates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_update_reads ENABLE ROW LEVEL SECURITY;

-- RLS policies for order_updates
CREATE POLICY "Users can view updates for orders they have access to" 
ON public.order_updates 
FOR SELECT 
USING (
  EXISTS (
    SELECT 1 FROM orders o 
    WHERE o.id = order_updates.order_id 
    AND (
      o.user_id = auth.uid() 
      OR EXISTS (
        SELECT 1 FROM profiles p 
        WHERE p.id = auth.uid() 
        AND p.company_id = o.company_id
      )
      OR EXISTS (
        SELECT 1 FROM user_roles ur 
        WHERE ur.user_id = auth.uid() 
        AND ur.role = 'admin'
      )
    )
  )
);

CREATE POLICY "Users can create updates for orders they have access to" 
ON public.order_updates 
FOR INSERT 
WITH CHECK (
  auth.uid() = user_id 
  AND EXISTS (
    SELECT 1 FROM orders o 
    WHERE o.id = order_updates.order_id 
    AND (
      o.user_id = auth.uid() 
      OR EXISTS (
        SELECT 1 FROM profiles p 
        WHERE p.id = auth.uid() 
        AND p.company_id = o.company_id
      )
      OR EXISTS (
        SELECT 1 FROM user_roles ur 
        WHERE ur.user_id = auth.uid() 
        AND ur.role = 'admin'
      )
    )
  )
);

CREATE POLICY "Users can update their own updates" 
ON public.order_updates 
FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own updates" 
ON public.order_updates 
FOR DELETE 
USING (auth.uid() = user_id);

-- RLS policies for order_update_reads
CREATE POLICY "Users can view their own read status" 
ON public.order_update_reads 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can mark updates as read" 
ON public.order_update_reads 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their read status" 
ON public.order_update_reads 
FOR UPDATE 
USING (auth.uid() = user_id);

-- Add indexes for performance
CREATE INDEX idx_order_updates_order_id ON public.order_updates(order_id);
CREATE INDEX idx_order_updates_user_id ON public.order_updates(user_id);
CREATE INDEX idx_order_updates_parent_id ON public.order_updates(parent_id);
CREATE INDEX idx_order_updates_created_at ON public.order_updates(created_at);
CREATE INDEX idx_order_update_reads_order_update_id ON public.order_update_reads(order_update_id);
CREATE INDEX idx_order_update_reads_user_id ON public.order_update_reads(user_id);

-- Create function to automatically mark updates as read when user views them
CREATE OR REPLACE FUNCTION mark_order_update_as_read(update_id UUID, user_uuid UUID)
RETURNS VOID AS $$
BEGIN
  INSERT INTO public.order_update_reads (order_update_id, user_id)
  VALUES (update_id, user_uuid)
  ON CONFLICT (order_update_id, user_id) DO NOTHING;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create function to get unread update count for an order
CREATE OR REPLACE FUNCTION get_unread_updates_count(order_uuid UUID, user_uuid UUID)
RETURNS INTEGER AS $$
DECLARE
  unread_count INTEGER;
BEGIN
  SELECT COUNT(*)::INTEGER INTO unread_count
  FROM public.order_updates ou
  LEFT JOIN public.order_update_reads our ON ou.id = our.order_update_id AND our.user_id = user_uuid
  WHERE ou.order_id = order_uuid 
  AND ou.user_id != user_uuid -- Don't count user's own updates
  AND our.id IS NULL; -- Not read yet
  
  RETURN COALESCE(unread_count, 0);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Enable realtime for order_updates
ALTER publication supabase_realtime ADD TABLE public.order_updates;
ALTER publication supabase_realtime ADD TABLE public.order_update_reads;