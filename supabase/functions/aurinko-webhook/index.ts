import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const url = new URL(req.url);
  
  // Handle Aurinko URL verification (GET request with challenge)
  if (req.method === 'GET') {
    const challenge = url.searchParams.get('validationToken') || url.searchParams.get('challenge');
    console.log('Aurinko verification GET request, challenge:', challenge);
    
    // Return the challenge token as plain text
    return new Response(challenge || 'OK', {
      status: 200,
      headers: { 
        ...corsHeaders, 
        'Content-Type': 'text/plain' 
      }
    });
  }

  // Check for validation token in query params (POST verification)
  const validationToken = url.searchParams.get('validationToken');
  if (validationToken) {
    console.log('Aurinko verification POST with token:', validationToken);
    return new Response(validationToken, {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'text/plain' }
    });
  }

  try {
    // Safely parse body - handle empty or invalid JSON
    const bodyText = await req.text();
    if (!bodyText || bodyText.trim() === '') {
      console.log('Empty body received - treating as ping');
      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    
    const payload = JSON.parse(bodyText);
    console.log('Aurinko webhook received:', JSON.stringify(payload, null, 2));

    const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);

    // Aurinko sends notifications for email events
    // Notification types: 'message.created', 'message.updated', etc.
    const { notification, resource, accountId, subscription } = payload;

    if (!accountId) {
      console.log('No accountId in webhook, might be a test ping');
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Find the email config for this account
    const { data: emailConfig, error: configError } = await supabase
      .from('email_provider_configs')
      .select('*')
      .eq('account_id', accountId.toString())
      .single();

    if (configError || !emailConfig) {
      console.error('Email config not found for account:', accountId);
      return new Response(JSON.stringify({ error: 'Config not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    console.log('Found email config for workspace:', emailConfig.workspace_id);

    // Handle new email notification
    if (notification === 'message.created' && resource) {
      await processNewEmail(supabase, emailConfig, resource);
    }

    // Update last sync time
    await supabase
      .from('email_provider_configs')
      .update({ last_sync_at: new Date().toISOString() })
      .eq('id', emailConfig.id);

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error in aurinko-webhook:', error);
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});

async function processNewEmail(supabase: any, emailConfig: any, emailData: any) {
  const messageId = emailData.id || emailData.messageId;
  console.log('Processing new email notification, messageId:', messageId);

  // Fetch full message details from Aurinko API
  const messageResponse = await fetch(`https://api.aurinko.io/v1/email/messages/${messageId}`, {
    headers: {
      'Authorization': `Bearer ${emailConfig.access_token}`,
    },
  });

  if (!messageResponse.ok) {
    console.error('Failed to fetch full message:', messageResponse.status);
    // Fall back to using the data from the notification
    return processEmailFromData(supabase, emailConfig, emailData);
  }

  const message = await messageResponse.json();
  console.log('Fetched full message, has textBody:', !!message.textBody, 'has htmlBody:', !!message.htmlBody);
  
  return processEmailFromData(supabase, emailConfig, message);
}

async function processEmailFromData(supabase: any, emailConfig: any, message: any) {
  const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
  
  const senderEmail = (message.from?.email || message.sender?.email || '').toLowerCase();
  const senderName = message.from?.name || message.sender?.name || senderEmail.split('@')[0];
  const subject = message.subject || 'No Subject';
  
  // Try multiple fields for body content
  let body = message.textBody || message.text || message.body?.text || '';
  if (!body && message.htmlBody) {
    body = message.htmlBody.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  }
  if (!body && message.body?.html) {
    body = message.body.html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  }
  if (!body && message.snippet) {
    body = message.snippet;
  }
  
  console.log('Email body length:', body.length, 'preview:', body.substring(0, 100));

  // Extract the recipient (To) address
  let recipientEmail = emailConfig.email_address;
  if (message.to && Array.isArray(message.to) && message.to.length > 0) {
    const allOurAddresses = [
      emailConfig.email_address.toLowerCase(),
      ...(emailConfig.aliases || []).map((a: string) => a.toLowerCase())
    ];
    
    for (const toAddr of message.to) {
      const toEmail = (toAddr.email || toAddr).toLowerCase();
      if (allOurAddresses.includes(toEmail)) {
        recipientEmail = toEmail;
        break;
      }
    }
  }
  console.log('Recipient address (will reply from):', recipientEmail);

  if (!senderEmail) {
    console.log('No sender email, skipping');
    return;
  }

  // Skip emails from the connected account itself or any alias (outbound)
  const allOurAddresses = [
    emailConfig.email_address.toLowerCase(),
    ...(emailConfig.aliases || []).map((a: string) => a.toLowerCase())
  ];
  if (allOurAddresses.includes(senderEmail)) {
    console.log('Skipping outbound email from our account/alias');
    return;
  }

  // Find or create customer
  let { data: customer, error: customerError } = await supabase
    .from('customers')
    .select('*')
    .eq('workspace_id', emailConfig.workspace_id)
    .eq('email', senderEmail)
    .single();

  if (!customer) {
    const { data: newCustomer, error: createError } = await supabase
      .from('customers')
      .insert({
        workspace_id: emailConfig.workspace_id,
        email: senderEmail,
        name: senderName,
        preferred_channel: 'email',
      })
      .select()
      .single();

    if (createError) {
      console.error('Error creating customer:', createError);
      return;
    }
    customer = newCustomer;
    console.log('Created new customer:', customer.id);
  }

  // Check for existing conversation with this email thread
  const threadId = message.threadId || message.id;
  let { data: existingConversation } = await supabase
    .from('conversations')
    .select('*')
    .eq('workspace_id', emailConfig.workspace_id)
    .eq('external_conversation_id', `aurinko_${threadId}`)
    .single();

  let conversationId;

  if (existingConversation) {
    conversationId = existingConversation.id;
    // Update conversation with new activity
    await supabase
      .from('conversations')
      .update({
        status: 'open',
        updated_at: new Date().toISOString(),
      })
      .eq('id', conversationId);
    console.log('Updated existing conversation:', conversationId);
  } else {
    // Create new conversation with recipient address in metadata
    const { data: newConversation, error: convError } = await supabase
      .from('conversations')
      .insert({
        workspace_id: emailConfig.workspace_id,
        customer_id: customer.id,
        channel: 'email',
        title: subject,
        status: 'new',
        external_conversation_id: `aurinko_${threadId}`,
        metadata: { 
          aurinko_account_id: emailConfig.account_id,
          aurinko_message_id: message.id,
          original_recipient_email: recipientEmail,
        },
      })
      .select()
      .single();

    if (convError) {
      console.error('Error creating conversation:', convError);
      return;
    }
    conversationId = newConversation.id;
    console.log('Created new conversation:', conversationId, 'with recipient:', recipientEmail);
  }

  // Add message with full body
  const { error: msgError } = await supabase
    .from('messages')
    .insert({
      conversation_id: conversationId,
      actor_type: 'customer',
      actor_name: senderName,
      direction: 'inbound',
      channel: 'email',
      body: body.substring(0, 10000),
      raw_payload: message,
    });

  if (msgError) {
    console.error('Error creating message:', msgError);
    return;
  }

  console.log('Message added to conversation:', conversationId, 'body length:', body.length);

  // Trigger AI agent for processing
  if (body.length > 0) {
    try {
      console.log('Triggering AI agent for conversation:', conversationId);
      const aiResponse = await fetch(`${SUPABASE_URL}/functions/v1/claude-ai-agent-tools`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${Deno.env.get('SUPABASE_ANON_KEY')}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          conversationId,
          customerMessage: body.substring(0, 5000),
          channel: 'email',
          customerName: senderName,
          customerEmail: senderEmail,
        }),
      });
      console.log('AI agent response status:', aiResponse.status);
      if (!aiResponse.ok) {
        const aiError = await aiResponse.text();
        console.error('AI agent error:', aiError);
      }
    } catch (aiError) {
      console.error('Error triggering AI agent:', aiError);
    }
  } else {
    console.log('Skipping AI agent - no body content');
  }
}
