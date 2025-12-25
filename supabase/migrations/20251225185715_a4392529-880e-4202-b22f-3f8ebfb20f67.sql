-- Add onboarding tracking columns to users table
ALTER TABLE public.users 
ADD COLUMN IF NOT EXISTS onboarding_completed boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS onboarding_step text DEFAULT 'welcome';

-- Add company logo to business_context
ALTER TABLE public.business_context 
ADD COLUMN IF NOT EXISTS company_logo_url text,
ADD COLUMN IF NOT EXISTS company_name text,
ADD COLUMN IF NOT EXISTS email_domain text,
ADD COLUMN IF NOT EXISTS business_type text,
ADD COLUMN IF NOT EXISTS automation_level text DEFAULT 'safe';

-- Create index for faster onboarding checks
CREATE INDEX IF NOT EXISTS idx_users_onboarding ON public.users(onboarding_completed) WHERE onboarding_completed = false;