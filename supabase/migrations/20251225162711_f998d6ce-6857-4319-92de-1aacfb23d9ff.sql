-- Security Fix: Drop plaintext token columns (encrypted versions exist)
-- These columns contain sensitive data that should only exist in encrypted form

-- Drop plaintext access_token from email_provider_configs (keep encrypted version)
ALTER TABLE public.email_provider_configs 
  ALTER COLUMN access_token DROP NOT NULL;

-- Drop plaintext tokens from gmail_channel_configs (keep encrypted versions)
ALTER TABLE public.gmail_channel_configs 
  ALTER COLUMN access_token DROP NOT NULL,
  ALTER COLUMN refresh_token DROP NOT NULL;

-- Add comment explaining the encryption setup
COMMENT ON COLUMN public.email_provider_configs.access_token_encrypted IS 'Encrypted access token - use decrypt_token() to read';
COMMENT ON COLUMN public.gmail_channel_configs.access_token_encrypted IS 'Encrypted access token - use decrypt_token() to read';
COMMENT ON COLUMN public.gmail_channel_configs.refresh_token_encrypted IS 'Encrypted refresh token - use decrypt_token() to read';