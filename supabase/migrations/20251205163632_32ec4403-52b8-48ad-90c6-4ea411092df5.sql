-- Add CSAT timing columns to conversations table
ALTER TABLE public.conversations ADD COLUMN IF NOT EXISTS csat_requested_at TIMESTAMPTZ;
ALTER TABLE public.conversations ADD COLUMN IF NOT EXISTS csat_responded_at TIMESTAMPTZ;

-- Add index for efficient CSAT query
CREATE INDEX IF NOT EXISTS idx_conversations_csat_pending 
ON public.conversations (resolved_at, csat_requested_at) 
WHERE status = 'resolved' AND csat_requested_at IS NULL;