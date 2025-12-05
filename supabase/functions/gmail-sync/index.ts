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
    const { workspaceId, mode } = await req.json();
    
    console.log('[gmail-sync] Starting sync for workspace:', workspaceId, 'mode:', mode);

    const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const GOOGLE_CLIENT_ID = Deno.env.get('GOOGLE_CLIENT_ID');
    const GOOGLE_CLIENT_SECRET = Deno.env.get('GOOGLE_CLIENT_SECRET');

    const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);

    // Get Gmail config for this workspace
    const { data: config, error: configError } = await supabase
      .from('gmail_channel_configs')
      .select('*')
      .eq('workspace_id', workspaceId)
      .maybeSingle();

    if (configError || !config) {
      throw new Error('Gmail not connected for this workspace');
    }

    // Refresh token if needed
    let accessToken = config.access_token;
    if (new Date(config.token_expires_at) < new Date()) {
      accessToken = await refreshAccessToken(
        config.refresh_token,
        GOOGLE_CLIENT_ID!,
        GOOGLE_CLIENT_SECRET!,
        supabase,
        config.id
      );
    }

    // Update import mode if specified
    if (mode && mode !== config.import_mode) {
      await supabase
        .from('gmail_channel_configs')
        .update({ import_mode: mode })
        .eq('id', config.id);
    }

    const importMode = mode || config.import_mode || 'new_only';
    let messagesProcessed = 0;

    if (importMode === 'all_historical_90_days') {
      // Fetch messages from last 90 days
      messagesProcessed = await fetchHistoricalMessages(accessToken, config, 90, supabase);
    } else if (importMode === 'unread_only') {
      // Fetch only unread messages
      messagesProcessed = await fetchUnreadMessages(accessToken, config, supabase);
    } else {
      // new_only - just get current historyId and wait for new messages
      const profileResponse = await fetch('https://www.googleapis.com/gmail/v1/users/me/profile', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const profile = await profileResponse.json();
      
      await supabase
        .from('gmail_channel_configs')
        .update({ 
          history_id: profile.historyId,
          last_sync_at: new Date().toISOString(),
        })
        .eq('id', config.id);
    }

    console.log('[gmail-sync] Sync complete. Messages processed:', messagesProcessed);

    return new Response(
      JSON.stringify({ 
        success: true, 
        messagesProcessed,
        mode: importMode,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: unknown) {
    console.error('[gmail-sync] Error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

async function refreshAccessToken(
  refreshToken: string,
  clientId: string,
  clientSecret: string,
  supabase: any,
  configId: string
): Promise<string> {
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
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

async function fetchHistoricalMessages(
  accessToken: string,
  config: any,
  days: number,
  supabase: any
): Promise<number> {
  const afterDate = new Date();
  afterDate.setDate(afterDate.getDate() - days);
  const afterTimestamp = Math.floor(afterDate.getTime() / 1000);

  // List messages from inbox
  const listUrl = new URL('https://www.googleapis.com/gmail/v1/users/me/messages');
  listUrl.searchParams.set('q', `in:inbox after:${afterTimestamp}`);
  listUrl.searchParams.set('maxResults', '100');

  let messagesProcessed = 0;
  let pageToken: string | null = null;

  do {
    if (pageToken) {
      listUrl.searchParams.set('pageToken', pageToken);
    }

    const listResponse = await fetch(listUrl.toString(), {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    const listData = await listResponse.json();

    if (listData.error) {
      console.error('[gmail-sync] List error:', listData.error);
      break;
    }

    if (listData.messages) {
      for (const msg of listData.messages) {
        await processMessage(accessToken, msg.id, config, supabase);
        messagesProcessed++;
      }
    }

    pageToken = listData.nextPageToken;
  } while (pageToken && messagesProcessed < 500); // Limit to 500 messages

  // Update historyId and last sync
  const profileResponse = await fetch('https://www.googleapis.com/gmail/v1/users/me/profile', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const profile = await profileResponse.json();

  await supabase
    .from('gmail_channel_configs')
    .update({
      history_id: profile.historyId,
      last_sync_at: new Date().toISOString(),
    })
    .eq('id', config.id);

  return messagesProcessed;
}

async function fetchUnreadMessages(
  accessToken: string,
  config: any,
  supabase: any
): Promise<number> {
  const listUrl = new URL('https://www.googleapis.com/gmail/v1/users/me/messages');
  listUrl.searchParams.set('q', 'in:inbox is:unread');
  listUrl.searchParams.set('maxResults', '50');

  const listResponse = await fetch(listUrl.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  const listData = await listResponse.json();
  let messagesProcessed = 0;

  if (listData.messages) {
    for (const msg of listData.messages) {
      await processMessage(accessToken, msg.id, config, supabase);
      messagesProcessed++;
    }
  }

  // Update historyId and last sync
  const profileResponse = await fetch('https://www.googleapis.com/gmail/v1/users/me/profile', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const profile = await profileResponse.json();

  await supabase
    .from('gmail_channel_configs')
    .update({
      history_id: profile.historyId,
      last_sync_at: new Date().toISOString(),
    })
    .eq('id', config.id);

  return messagesProcessed;
}

async function processMessage(
  accessToken: string,
  messageId: string,
  config: any,
  supabase: any
): Promise<void> {
  try {
    // Check if message already processed
    const { data: existing } = await supabase
      .from('conversations')
      .select('id')
      .eq('workspace_id', config.workspace_id)
      .contains('metadata', { gmail_message_id: messageId })
      .maybeSingle();

    if (existing) {
      console.log('[gmail-sync] Message already processed:', messageId);
      return;
    }

    // Fetch full message
    const msgResponse = await fetch(
      `https://www.googleapis.com/gmail/v1/users/me/messages/${messageId}?format=full`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    const message = await msgResponse.json();

    if (message.error) {
      console.error('[gmail-sync] Message fetch error:', message.error);
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
    const threadId = message.threadId;

    // Skip if this is an outbound message
    if (fromEmail.toLowerCase() === config.email_address.toLowerCase()) {
      return;
    }

    // Extract body
    const body = extractBody(message.payload);

    // Find or create customer
    const customer = await findOrCreateCustomer(fromEmail, fromName, config.workspace_id, supabase);

    // Check for existing thread conversation
    const { data: existingConv } = await supabase
      .from('conversations')
      .select('*')
      .eq('workspace_id', config.workspace_id)
      .eq('external_conversation_id', `gmail:${threadId}`)
      .maybeSingle();

    if (existingConv) {
      // Add to existing conversation
      await supabase.from('messages').insert({
        conversation_id: existingConv.id,
        body,
        channel: 'email',
        direction: 'inbound',
        actor_type: 'customer',
        actor_name: fromName || customer.name,
      });

      await supabase
        .from('conversations')
        .update({
          message_count: (existingConv.message_count || 0) + 1,
          updated_at: new Date().toISOString(),
          metadata: { ...existingConv.metadata, gmail_message_id: messageId },
        })
        .eq('id', existingConv.id);
    } else {
      // Create new conversation
      const { data: conversation } = await supabase
        .from('conversations')
        .insert({
          workspace_id: config.workspace_id,
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

      if (conversation) {
        await supabase.from('messages').insert({
          conversation_id: conversation.id,
          body,
          channel: 'email',
          direction: 'inbound',
          actor_type: 'customer',
          actor_name: fromName || customer.name,
        });

        // Run AI agent
        await runAIAgent(conversation.id, body, supabase);
      }
    }

    console.log('[gmail-sync] Processed message:', messageId);
  } catch (error) {
    console.error('[gmail-sync] Error processing message:', messageId, error);
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

  if (payload.mimeType === 'text/plain' && payload.body?.data) {
    return atob(payload.body.data.replace(/-/g, '+').replace(/_/g, '/'));
  }

  if (payload.parts) {
    for (const part of payload.parts) {
      if (part.mimeType === 'text/plain' && part.body?.data) {
        return atob(part.body.data.replace(/-/g, '+').replace(/_/g, '/'));
      }
    }
    for (const part of payload.parts) {
      if (part.mimeType === 'text/html' && part.body?.data) {
        const html = atob(part.body.data.replace(/-/g, '+').replace(/_/g, '/'));
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

  const { data: newCustomer } = await supabase
    .from('customers')
    .insert({
      email: email.toLowerCase(),
      name: name || email.split('@')[0],
      workspace_id: workspaceId,
      preferred_channel: 'email',
    })
    .select()
    .single();

  return newCustomer;
}

async function runAIAgent(conversationId: string, messageBody: string, supabase: any) {
  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
    
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
    console.error('[gmail-sync] AI agent error:', error);
    await supabase
      .from('conversations')
      .update({ status: 'escalated', is_escalated: true })
      .eq('id', conversationId);
  }
}
