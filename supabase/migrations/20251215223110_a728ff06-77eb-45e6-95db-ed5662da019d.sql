-- Add new triage columns to conversations table
ALTER TABLE public.conversations 
ADD COLUMN IF NOT EXISTS urgency text DEFAULT 'medium',
ADD COLUMN IF NOT EXISTS urgency_reason text,
ADD COLUMN IF NOT EXISTS extracted_entities jsonb DEFAULT '{}',
ADD COLUMN IF NOT EXISTS suggested_actions text[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS triage_reasoning text,
ADD COLUMN IF NOT EXISTS thread_context jsonb DEFAULT '{}',
ADD COLUMN IF NOT EXISTS triage_confidence numeric;

-- Add index for urgency-based queries
CREATE INDEX IF NOT EXISTS idx_conversations_urgency ON public.conversations(urgency);

-- Add comment for documentation
COMMENT ON COLUMN public.conversations.urgency IS 'Urgency level: high, medium, low';
COMMENT ON COLUMN public.conversations.urgency_reason IS 'Explanation for the urgency level';
COMMENT ON COLUMN public.conversations.extracted_entities IS 'Extracted entities: customer_name, phone, address, date_mentioned, order_id, amount, service_type';
COMMENT ON COLUMN public.conversations.suggested_actions IS 'AI-suggested actions for handling this conversation';
COMMENT ON COLUMN public.conversations.triage_reasoning IS 'AI reasoning for the classification decision';
COMMENT ON COLUMN public.conversations.thread_context IS 'Thread context: is_reply, reply_to_subject, estimated_thread_length';
COMMENT ON COLUMN public.conversations.triage_confidence IS 'Confidence score from triage agent (0-1)';