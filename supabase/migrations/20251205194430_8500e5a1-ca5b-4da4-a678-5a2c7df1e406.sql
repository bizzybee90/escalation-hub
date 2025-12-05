-- Create gmail_channel_configs table for OAuth tokens and sync state
CREATE TABLE public.gmail_channel_configs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE,
  email_address TEXT NOT NULL,
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  token_expires_at TIMESTAMPTZ,
  history_id TEXT,
  watch_expiration TIMESTAMPTZ,
  import_mode TEXT DEFAULT 'new_only' CHECK (import_mode IN ('new_only', 'unread_only', 'all_historical_90_days')),
  last_sync_at TIMESTAMPTZ,
  connected_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(workspace_id, email_address)
);

-- Create email_settings table for signature configuration
CREATE TABLE public.email_settings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE UNIQUE,
  from_name TEXT,
  reply_to_email TEXT,
  signature_html TEXT,
  logo_url TEXT,
  company_name TEXT,
  company_phone TEXT,
  company_website TEXT,
  company_address TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS on both tables
ALTER TABLE public.gmail_channel_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_settings ENABLE ROW LEVEL SECURITY;

-- RLS policies for gmail_channel_configs
CREATE POLICY "Users can view workspace gmail configs"
  ON public.gmail_channel_configs
  FOR SELECT
  USING (workspace_id = get_my_workspace_id());

CREATE POLICY "Users can manage workspace gmail configs"
  ON public.gmail_channel_configs
  FOR ALL
  USING (workspace_id = get_my_workspace_id());

-- RLS policies for email_settings
CREATE POLICY "Users can view workspace email settings"
  ON public.email_settings
  FOR SELECT
  USING (workspace_id = get_my_workspace_id());

CREATE POLICY "Users can manage workspace email settings"
  ON public.email_settings
  FOR ALL
  USING (workspace_id = get_my_workspace_id());

-- Create email-assets storage bucket for logos
INSERT INTO storage.buckets (id, name, public) 
VALUES ('email-assets', 'email-assets', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policy for email-assets bucket
CREATE POLICY "Anyone can view email assets"
  ON storage.objects
  FOR SELECT
  USING (bucket_id = 'email-assets');

CREATE POLICY "Authenticated users can upload email assets"
  ON storage.objects
  FOR INSERT
  WITH CHECK (bucket_id = 'email-assets' AND auth.uid() IS NOT NULL);

CREATE POLICY "Users can update their email assets"
  ON storage.objects
  FOR UPDATE
  USING (bucket_id = 'email-assets' AND auth.uid() IS NOT NULL);

CREATE POLICY "Users can delete their email assets"
  ON storage.objects
  FOR DELETE
  USING (bucket_id = 'email-assets' AND auth.uid() IS NOT NULL);

-- Update trigger for gmail_channel_configs
CREATE TRIGGER update_gmail_channel_configs_updated_at
  BEFORE UPDATE ON public.gmail_channel_configs
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Update trigger for email_settings
CREATE TRIGGER update_email_settings_updated_at
  BEFORE UPDATE ON public.email_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();