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
    const { configId, mode } = await req.json();
    console.log('Email sync requested:', { configId, mode });

    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Get email config
    const { data: config, error: configError } = await supabase
      .from('email_provider_configs')
      .select('*')
      .eq('id', configId)
      .single();

    if (configError || !config) {
      console.error('Config not found:', configError);
      return new Response(JSON.stringify({ error: 'Email config not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    console.log('Found config for:', config.email_address, 'mode:', mode || config.import_mode);

    const syncMode = mode || config.import_mode || 'new_only';
    let messagesProcessed = 0;

    // Determine date filter based on mode
    let afterDate: Date | null = null;
    if (syncMode === 'all_historical_90_days') {
      afterDate = new Date();
      afterDate.setDate(afterDate.getDate() - 90);
    } else if (syncMode === 'unread_only') {
      // Will use unread filter instead of date
    }

    // Fetch messages from Aurinko
    const baseUrl = 'https://api.aurinko.io/v1/email/messages';
    let queryParams: string[] = [];
    
    if (syncMode === 'unread_only') {
      queryParams.push('unread=true');
    }
    if (afterDate) {
      queryParams.push(`after=${afterDate.toISOString()}`);
    }
    queryParams.push('limit=50'); // Process in batches
    
    const fetchUrl = `${baseUrl}?${queryParams.join('&')}`;
    console.log('Fetching emails from:', fetchUrl);

    const messagesResponse = await fetch(fetchUrl, {
      headers: {
        'Authorization': `Bearer ${config.access_token}`,
      },
    });

    if (!messagesResponse.ok) {
      const errorText = await messagesResponse.text();
      console.error('Failed to fetch messages:', messagesResponse.status, errorText);
      
      return new Response(JSON.stringify({ 
        error: 'Failed to fetch messages',
        details: errorText,
        status: messagesResponse.status 
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const messagesData = await messagesResponse.json();
    console.log('Fetched', messagesData.records?.length || 0, 'messages from list API');

    // Process each message
    for (const messageSummary of messagesData.records || []) {
      try {
        // Skip if already processed (check by external ID)
        const externalId = messageSummary.id?.toString();
        const { data: existing } = await supabase
          .from('conversations')
          .select('id')
          .eq('external_conversation_id', `aurinko_${externalId}`)
          .single();

        if (existing) {
          console.log('Message already processed:', externalId);
          continue;
        }

        // IMPORTANT: Fetch full message details to get the body content
        console.log('Fetching full message details for:', externalId);
        const fullMessageResponse = await fetch(`https://api.aurinko.io/v1/email/messages/${externalId}`, {
          headers: {
            'Authorization': `Bearer ${config.access_token}`,
          },
        });

        if (!fullMessageResponse.ok) {
          console.error('Failed to fetch full message:', externalId, fullMessageResponse.status);
          continue;
        }

        const message = await fullMessageResponse.json();
        console.log('Full message fetched:', JSON.stringify({
          hasTextBody: !!message.textBody,
          hasHtmlBody: !!message.htmlBody,
          hasBody: !!message.body,
          bodyType: typeof message.body,
          bodyKeys: message.body ? Object.keys(message.body) : [],
        }));

        // Extract email details - check multiple possible field names
        const fromEmail = (message.from?.email || message.sender?.email || '').toLowerCase();
        const fromName = message.from?.name || message.sender?.name || fromEmail.split('@')[0];
        const subject = message.subject || 'No Subject';
        
        // Try multiple fields for body content - Aurinko uses nested body object
        let body = '';
        if (message.textBody) {
          body = message.textBody;
        } else if (message.body && typeof message.body === 'object') {
          // Aurinko returns body as { text: "...", html: "..." }
          body = message.body.text || message.body.plain || '';
          if (!body && message.body.html) {
            body = message.body.html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
          }
        } else if (message.htmlBody) {
          body = message.htmlBody.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
        } else if (message.snippet) {
          body = message.snippet;
        } else if (typeof message.body === 'string') {
          body = message.body;
        }
        
        console.log('Extracted body length:', body.length, 'preview:', body.substring(0, 100));
        
        const receivedAt = message.receivedAt || message.createdAt || message.date;

        // Skip outbound emails (from our connected accounts)
        const allConnectedEmails = [config.email_address.toLowerCase(), ...(config.aliases || []).map((a: string) => a.toLowerCase())];
        if (allConnectedEmails.includes(fromEmail)) {
          console.log('Skipping outbound email from:', fromEmail);
          continue;
        }

        // Find or create customer
        let customer;
        const { data: existingCustomer } = await supabase
          .from('customers')
          .select('*')
          .eq('email', fromEmail)
          .eq('workspace_id', config.workspace_id)
          .single();

        if (existingCustomer) {
          customer = existingCustomer;
        } else {
          const { data: newCustomer, error: customerError } = await supabase
            .from('customers')
            .insert({
              workspace_id: config.workspace_id,
              email: fromEmail,
              name: fromName,
              preferred_channel: 'email',
            })
            .select()
            .single();

          if (customerError) {
            console.error('Error creating customer:', customerError);
            continue;
          }
          customer = newCustomer;
        }

        // Get original recipient (to address) - safely extract email
        const toAddresses: string[] = [];
        if (Array.isArray(message.to)) {
          for (const t of message.to) {
            if (typeof t === 'string') {
              toAddresses.push(t.toLowerCase());
            } else if (t && typeof t.email === 'string') {
              toAddresses.push(t.email.toLowerCase());
            } else if (t && typeof t.address === 'string') {
              toAddresses.push(t.address.toLowerCase());
            }
          }
        }
        const originalRecipient = toAddresses.find((addr: string) => allConnectedEmails.includes(addr)) || config.email_address;

        // Create conversation
        const { data: conversation, error: convError } = await supabase
          .from('conversations')
          .insert({
            workspace_id: config.workspace_id,
            customer_id: customer.id,
            channel: 'email',
            title: subject,
            status: 'new',
            external_conversation_id: `aurinko_${externalId}`,
            metadata: {
              original_recipient_email: originalRecipient,
              thread_id: message.threadId,
              email_provider: config.provider,
              aurinko_message_id: externalId,
            },
            created_at: receivedAt,
          })
          .select()
          .single();

        if (convError) {
          console.error('Error creating conversation:', convError);
          continue;
        }

        // Create message with the full body
        const { error: msgError } = await supabase
          .from('messages')
          .insert({
            conversation_id: conversation.id,
            body: body.substring(0, 10000), // Limit body size
            direction: 'inbound',
            channel: 'email',
            actor_type: 'customer',
            actor_name: fromName,
            created_at: receivedAt,
            raw_payload: message, // Store full message for debugging
          });

        if (msgError) {
          console.error('Error creating message:', msgError);
          continue;
        }

        messagesProcessed++;
        console.log('Processed message:', subject, 'body length:', body.length);

        // Trigger AI agent for the new conversation
        if (body.length > 0) {
          try {
            console.log('Triggering AI agent for conversation:', conversation.id);
            const aiResponse = await fetch(`${SUPABASE_URL}/functions/v1/claude-ai-agent-tools`, {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${Deno.env.get('SUPABASE_ANON_KEY')}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                conversationId: conversation.id,
                customerMessage: body.substring(0, 5000),
                channel: 'email',
                customerName: fromName,
                customerEmail: fromEmail,
              }),
            });
            console.log('AI agent response status:', aiResponse.status);
            if (!aiResponse.ok) {
              const aiError = await aiResponse.text();
              console.error('AI agent error:', aiError);
            }
          } catch (aiError) {
            console.error('AI agent call failed (non-blocking):', aiError);
          }
        } else {
          console.log('Skipping AI agent - no body content');
        }

      } catch (msgError) {
        console.error('Error processing message:', msgError);
      }
    }

    // Update last_sync_at
    await supabase
      .from('email_provider_configs')
      .update({ last_sync_at: new Date().toISOString() })
      .eq('id', configId);

    console.log('Sync complete. Processed', messagesProcessed, 'messages');

    return new Response(JSON.stringify({ 
      success: true, 
      messagesProcessed,
      mode: syncMode
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error in email-sync:', error);
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
