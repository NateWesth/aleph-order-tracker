-- Shared, real-time notes/comments on individual order line items.
-- Any user who can already see an order's items can read and add comments
-- on those items - this mirrors the existing access model for order_items
-- itself (own orders, same-company orders, or admin).

CREATE TABLE public.order_item_comments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  order_item_id UUID NOT NULL REFERENCES public.order_items(id) ON DELETE CASCADE,
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  author_name TEXT NOT NULL,
  content TEXT NOT NULL CHECK (char_length(trim(content)) > 0),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.order_item_comments ENABLE ROW LEVEL SECURITY;

-- Admins can do everything
CREATE POLICY "Admins can manage order item comments"
ON public.order_item_comments
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_roles.user_id = auth.uid()
    AND user_roles.role = 'admin'
  )
);

-- Any user who can see the order can read its item comments
CREATE POLICY "Users can view order item comments"
ON public.order_item_comments
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM orders o
    WHERE o.id = order_item_comments.order_id
    AND (
      o.user_id = auth.uid()
      OR EXISTS (
        SELECT 1 FROM profiles p
        WHERE p.id = auth.uid() AND p.company_id = o.company_id
      )
    )
  )
);

-- Any user who can see the order can add a comment on its items
CREATE POLICY "Users can add order item comments"
ON public.order_item_comments
FOR INSERT
WITH CHECK (
  author_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM orders o
    WHERE o.id = order_item_comments.order_id
    AND (
      o.user_id = auth.uid()
      OR EXISTS (
        SELECT 1 FROM profiles p
        WHERE p.id = auth.uid() AND p.company_id = o.company_id
      )
    )
  )
);

-- Authors can edit or remove their own comments; admins already covered above
CREATE POLICY "Users can update their own order item comments"
ON public.order_item_comments
FOR UPDATE
USING (author_id = auth.uid())
WITH CHECK (author_id = auth.uid());

CREATE POLICY "Users can delete their own order item comments"
ON public.order_item_comments
FOR DELETE
USING (author_id = auth.uid());

CREATE INDEX idx_order_item_comments_item_id ON public.order_item_comments(order_item_id);
CREATE INDEX idx_order_item_comments_order_id ON public.order_item_comments(order_id);

-- Realtime: lets everyone viewing an order see new comments (and the
-- "has a comment" indicator dot) appear live without refreshing.
ALTER TABLE public.order_item_comments REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.order_item_comments;
