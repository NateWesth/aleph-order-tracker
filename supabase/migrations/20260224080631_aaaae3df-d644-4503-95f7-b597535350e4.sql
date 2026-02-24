
-- Table to store Zoho OAuth tokens
CREATE TABLE public.zoho_tokens (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id text,
  access_token text NOT NULL,
  refresh_token text NOT NULL,
  token_type text DEFAULT 'Bearer',
  expires_at timestamp with time zone,
  scope text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id)
);

-- Table to log sync history
CREATE TABLE public.zoho_sync_log (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  sync_type text NOT NULL, -- 'items', 'contacts', 'purchase_orders', 'full'
  status text NOT NULL DEFAULT 'running', -- 'running', 'completed', 'failed'
  items_synced integer DEFAULT 0,
  error_message text,
  started_at timestamp with time zone NOT NULL DEFAULT now(),
  completed_at timestamp with time zone
);

-- Enable RLS
ALTER TABLE public.zoho_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.zoho_sync_log ENABLE ROW LEVEL SECURITY;

-- Only admins can access tokens
CREATE POLICY "Admins can manage zoho tokens"
ON public.zoho_tokens FOR ALL
USING (EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin'));

-- Only admins can view sync log
CREATE POLICY "Admins can view sync log"
ON public.zoho_sync_log FOR SELECT
USING (EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin'));

-- System can insert/update sync log
CREATE POLICY "System can manage sync log"
ON public.zoho_sync_log FOR ALL
USING (true) WITH CHECK (true);

-- Updated at trigger
CREATE TRIGGER update_zoho_tokens_updated_at
BEFORE UPDATE ON public.zoho_tokens
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
