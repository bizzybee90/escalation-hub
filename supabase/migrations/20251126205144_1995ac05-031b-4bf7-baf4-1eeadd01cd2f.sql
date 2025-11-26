-- Add new columns to conversations table for tracking AI-handled vs escalated conversations
ALTER TABLE conversations 
ADD COLUMN IF NOT EXISTS is_escalated boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS escalated_at timestamptz,
ADD COLUMN IF NOT EXISTS conversation_type text DEFAULT 'ai_handled',
ADD COLUMN IF NOT EXISTS ai_resolution_summary text,
ADD COLUMN IF NOT EXISTS message_count integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS ai_message_count integer DEFAULT 0;

-- Add index for filtering by conversation type and escalation status
CREATE INDEX IF NOT EXISTS idx_conversations_type_escalated ON conversations(conversation_type, is_escalated);
CREATE INDEX IF NOT EXISTS idx_conversations_customer_channel ON conversations(customer_id, channel, status);

-- Update existing escalated conversations (ones that have entries in escalated_messages)
UPDATE conversations 
SET is_escalated = true, 
    escalated_at = created_at,
    conversation_type = 'escalated'
WHERE id IN (
  SELECT DISTINCT conversation_id 
  FROM messages 
  WHERE conversation_id IS NOT NULL
)
AND is_escalated = false;