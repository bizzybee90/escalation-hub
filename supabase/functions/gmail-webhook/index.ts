import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // This endpoint receives Google Pub/Sub push notifications
    // Format: { message: { data: base64({"emailAddress": "...", "historyId": "..."}), ... } }
    
    const body = await req.json();
    console.log('[gmail-webhook] Received notification:', JSON.stringify(body));

    if (!body.message?.data) {
      console.log('[gmail-webhook] No message data, acknowledging');
      return new Response('OK', { status: 200, headers: corsHeaders });
    }

    // Decode the Pub/Sub message
    const messageData = JSON.parse(atob(body.message.data));
    const { emailAddress, historyId } = messageData;

    console.log('[gmail-webhook] Email:', emailAddress, 'HistoryId:', historyId);

    const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);

    // Find the Gmail config for this email
    const { data: config, error: configError } = await supabase
      .from('gmail_channel_configs')
      .select('*')
      .eq('email_address', emailAddress)
      .maybeSingle();

    if (configError || !config) {
      console.error('[gmail-webhook] Config not found for:', emailAddress);
      return new Response('OK', { status: 200, headers: corsHeaders });
    }

    // Refresh token if needed
    let accessToken = config.access_token;
    if (new Date(config.token_expires_at) < new Date()) {
      accessToken = await refreshAccessToken(config.refresh_token, supabase, config.id);
    }

    // Fetch new messages since last historyId
    await fetchNewMessages(accessToken, config, historyId, supabase);

    return new Response('OK', { status: 200, headers: corsHeaders });
  } catch (error) {
    console.error('[gmail-webhook] Error:', error);
    // Always return 200 to acknowledge the notification
    return new Response('OK', { status: 200, headers: corsHeaders });
  }
});

async function refreshAccessToken(refreshToken: string, supabase: any, configId: string): Promise<string> {
  const GOOGLE_CLIENT_ID = Deno.env.get('GOOGLE_CLIENT_ID');
  const GOOGLE_CLIENT_SECRET = Deno.env.get('GOOGLE_CLIENT_SECRET');

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID!,
      client_secret: GOOGLE_CLIENT_SECRET!,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });

  const data = await response.json();
  
  if (data.error) {
    throw new Error(`Token refresh failed: ${data.error}`);
  }

  const tokenExpiresAt = new Date(Date.now() + data.expires_in * 1000).toISOString();

  await supabase
    .from('gmail_channel_configs')
    .update({
      access_token: data.access_token,
      token_expires_at: tokenExpiresAt,
    })
    .eq('id', configId);

  return data.access_token;
}

async function fetchNewMessages(
  accessToken: string,
  config: any,
  newHistoryId: string,
  supabase: any
): Promise<void> {
  const oldHistoryId = config.history_id;
  
  if (!oldHistoryId) {
    console.log('[gmail-webhook] No previous historyId, skipping incremental fetch');
    return;
  }

  // Get history since last sync
  const historyUrl = new URL('https://www.googleapis.com/gmail/v1/users/me/history');
  historyUrl.searchParams.set('startHistoryId', oldHistoryId);
  historyUrl.searchParams.set('historyTypes', 'messageAdded');
  historyUrl.searchParams.set('labelIds', 'INBOX');

  const historyResponse = await fetch(historyUrl.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  const historyData = await historyResponse.json();

  if (historyData.error) {
    console.error('[gmail-webhook] History fetch error:', historyData.error);
    return;
  }

  // Update historyId
  await supabase
    .from('gmail_channel_configs')
    .update({ history_id: newHistoryId, last_sync_at: new Date().toISOString() })
    .eq('id', config.id);

  if (!historyData.history) {
    console.log('[gmail-webhook] No new messages');
    return;
  }

  // Extract new message IDs
  const messageIds = new Set<string>();
  for (const record of historyData.history) {
    if (record.messagesAdded) {
      for (const msg of record.messagesAdded) {
        messageIds.add(msg.message.id);
      }
    }
  }

  console.log('[gmail-webhook] Found', messageIds.size, 'new messages');

  // Process each new message
  for (const messageId of messageIds) {
    await processMessage(accessToken, messageId, config, supabase);
  }
}

async function processMessage(
  accessToken: string,
  messageId: string,
  config: any,
  supabase: any
): Promise<void> {
  try {
    // Fetch full message
    const msgResponse = await fetch(
      `https://www.googleapis.com/gmail/v1/users/me/messages/${messageId}?format=full`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    const message = await msgResponse.json();

    if (message.error) {
      console.error('[gmail-webhook] Message fetch error:', message.error);
      return;
    }

    // Parse headers
    const headers: Record<string, string> = {};
    for (const header of message.payload?.headers || []) {
      headers[header.name.toLowerCase()] = header.value;
    }

    const fromEmail = extractEmail(headers['from'] || '');
    const fromName = extractName(headers['from'] || '');
    const subject = headers['subject'] || '(No Subject)';
    const toEmail = headers['to'] || '';
    const threadId = message.threadId;

    // Skip if this is an outbound message (from our connected account)
    if (fromEmail.toLowerCase() === config.email_address.toLowerCase()) {
      console.log('[gmail-webhook] Skipping outbound message');
      return;
    }

    // Extract body
    const body = extractBody(message.payload);

    console.log('[gmail-webhook] Processing email from:', fromEmail, 'Subject:', subject);

    // Find or create customer
    let customer = await findOrCreateCustomer(fromEmail, fromName, config.workspace_id, supabase);

    // Check for existing conversation with this thread
    let conversation = await findConversationByThread(threadId, config.workspace_id, supabase);

    if (conversation) {
      // Add message to existing conversation
      await addMessageToConversation(conversation, body, customer, fromName, supabase);
      
      // Update conversation status to open if it was waiting
      if (conversation.status === 'waiting_customer') {
        await supabase
          .from('conversations')
          .update({ status: 'open', updated_at: new Date().toISOString() })
          .eq('id', conversation.id);
      }
    } else {
      // Create new conversation
      conversation = await createConversation(
        subject,
        body,
        customer,
        fromName,
        threadId,
        messageId,
        config.workspace_id,
        supabase
      );

      // Run AI agent on new conversation
      await runAIAgent(conversation.id, body, supabase);
    }

    console.log('[gmail-webhook] Processed message for conversation:', conversation.id);
  } catch (error) {
    console.error('[gmail-webhook] Error processing message:', messageId, error);
  }
}

function extractEmail(fromHeader: string): string {
  const match = fromHeader.match(/<([^>]+)>/);
  return match ? match[1] : fromHeader.split(' ')[0];
}

function extractName(fromHeader: string): string {
  const match = fromHeader.match(/^"?([^"<]+)"?\s*</);
  return match ? match[1].trim() : fromHeader.split('@')[0];
}

function extractBody(payload: any): string {
  if (!payload) return '';

  // Check for plain text part
  if (payload.mimeType === 'text/plain' && payload.body?.data) {
    return atob(payload.body.data.replace(/-/g, '+').replace(/_/g, '/'));
  }

  // Check multipart
  if (payload.parts) {
    for (const part of payload.parts) {
      if (part.mimeType === 'text/plain' && part.body?.data) {
        return atob(part.body.data.replace(/-/g, '+').replace(/_/g, '/'));
      }
    }
    // Fallback to first HTML part
    for (const part of payload.parts) {
      if (part.mimeType === 'text/html' && part.body?.data) {
        const html = atob(part.body.data.replace(/-/g, '+').replace(/_/g, '/'));
        // Strip HTML tags for plain text
        return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      }
    }
  }

  return '';
}

async function findOrCreateCustomer(email: string, name: string, workspaceId: string, supabase: any) {
  const { data: existing } = await supabase
    .from('customers')
    .select('*')
    .eq('email', email.toLowerCase())
    .eq('workspace_id', workspaceId)
    .maybeSingle();

  if (existing) return existing;

  const { data: newCustomer, error } = await supabase
    .from('customers')
    .insert({
      email: email.toLowerCase(),
      name: name || email.split('@')[0],
      workspace_id: workspaceId,
      preferred_channel: 'email',
    })
    .select()
    .single();

  if (error) throw error;
  return newCustomer;
}

async function findConversationByThread(threadId: string, workspaceId: string, supabase: any) {
  const { data } = await supabase
    .from('conversations')
    .select('*')
    .eq('workspace_id', workspaceId)
    .eq('external_conversation_id', `gmail:${threadId}`)
    .maybeSingle();

  return data;
}

async function addMessageToConversation(conversation: any, body: string, customer: any, fromName: string, supabase: any) {
  await supabase.from('messages').insert({
    conversation_id: conversation.id,
    body,
    channel: 'email',
    direction: 'inbound',
    actor_type: 'customer',
    actor_name: fromName || customer.name,
  });

  await supabase
    .from('conversations')
    .update({
      message_count: (conversation.message_count || 0) + 1,
      updated_at: new Date().toISOString(),
    })
    .eq('id', conversation.id);
}

async function createConversation(
  subject: string,
  body: string,
  customer: any,
  fromName: string,
  threadId: string,
  messageId: string,
  workspaceId: string,
  supabase: any
) {
  const { data: conversation, error } = await supabase
    .from('conversations')
    .insert({
      workspace_id: workspaceId,
      customer_id: customer.id,
      channel: 'email',
      title: subject,
      status: 'new',
      priority: 'medium',
      external_conversation_id: `gmail:${threadId}`,
      metadata: { gmail_message_id: messageId, gmail_thread_id: threadId },
      message_count: 1,
    })
    .select()
    .single();

  if (error) throw error;

  // Add initial message
  await supabase.from('messages').insert({
    conversation_id: conversation.id,
    body,
    channel: 'email',
    direction: 'inbound',
    actor_type: 'customer',
    actor_name: fromName || customer.name,
  });

  return conversation;
}

async function runAIAgent(conversationId: string, messageBody: string, supabase: any) {
  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
    
    // Call the Claude AI agent
    const response = await fetch(`${SUPABASE_URL}/functions/v1/claude-ai-agent-tools`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        conversationId,
        message: messageBody,
        channel: 'email',
      }),
    });

    const result = await response.json();
    console.log('[gmail-webhook] AI agent result:', result);

    // For email, always set to pending_review (draft mode)
    await supabase
      .from('conversations')
      .update({
        status: 'pending_review',
        ai_draft_response: result.response || result.ai_draft_response,
        ai_confidence: result.confidence,
        ai_sentiment: result.sentiment,
        category: result.category,
        summary_for_human: result.summary || result.ai_summary,
      })
      .eq('id', conversationId);

  } catch (error) {
    console.error('[gmail-webhook] AI agent error:', error);
    // Mark for human review on AI failure
    await supabase
      .from('conversations')
      .update({ status: 'escalated', is_escalated: true })
      .eq('id', conversationId);
  }
}
