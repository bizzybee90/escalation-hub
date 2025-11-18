-- Add interface mode preference to users table
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS interface_mode TEXT DEFAULT 'focus';
COMMENT ON COLUMN public.users.interface_mode IS 'User interface preference: focus (popup) or power (3-column)';

-- Add snooze support to conversations
ALTER TABLE public.conversations ADD COLUMN IF NOT EXISTS snoozed_until TIMESTAMP WITH TIME ZONE;
COMMENT ON COLUMN public.conversations.snoozed_until IS 'Conversation hidden from queues until this time';