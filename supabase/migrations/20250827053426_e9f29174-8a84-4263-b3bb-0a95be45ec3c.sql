-- Add foreign key constraint for order_updates.user_id to reference profiles.id
ALTER TABLE public.order_updates 
ADD CONSTRAINT fk_order_updates_user_id 
FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;