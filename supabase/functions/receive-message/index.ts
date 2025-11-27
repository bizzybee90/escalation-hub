import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.81.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error('Missing required environment variables');
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const contentType = req.headers.get('content-type') || '';
    let body: any;

    // Parse request based on content type
    if (contentType.includes('application/x-www-form-urlencoded')) {
      // Twilio webhook format
      const formData = await req.formData();
      body = Object.fromEntries(formData);
    } else {
      // JSON format (for testing or other channels)
      body = await req.json();
    }

    console.log('Received webhook:', {
      contentType,
      bodyKeys: Object.keys(body),
      from: body.From || body.from
    });

    // Normalize the incoming message to a standard format
    let normalizedMessage;
    
    // Detect channel and normalize
    if (body.MessagingServiceSid || body.From?.startsWith('whatsapp:')) {
      // Twilio WhatsApp
      normalizedMessage = {
        channel: 'whatsapp',
        customerIdentifier: body.From.replace('whatsapp:', ''),
        customerName: body.ProfileName || null,
        messageContent: body.Body,
        messageId: body.MessageSid,
        timestamp: new Date().toISOString(),
        metadata: {
          twilioSid: body.MessageSid,
          accountSid: body.AccountSid,
          numMedia: body.NumMedia || '0'
        }
      };
    } else if (body.From && !body.From.startsWith('whatsapp:')) {
      // Twilio SMS
      normalizedMessage = {
        channel: 'sms',
        customerIdentifier: body.From,
        customerName: null,
        messageContent: body.Body,
        messageId: body.MessageSid,
        timestamp: new Date().toISOString(),
        metadata: {
          twilioSid: body.MessageSid,
          accountSid: body.AccountSid,
          numMedia: body.NumMedia || '0'
        }
      };
    } else if (body.channel) {
      // Already normalized format (for testing)
      normalizedMessage = body;
    } else {
      throw new Error('Unable to determine message channel');
    }

    console.log('Normalized message:', {
      channel: normalizedMessage.channel,
      customer: normalizedMessage.customerIdentifier,
      messagePreview: normalizedMessage.messageContent.substring(0, 50)
    });

    // Get or create customer
    const { data: existingCustomer } = await supabase
      .from('customers')
      .select('id, workspace_id')
      .eq('phone', normalizedMessage.customerIdentifier)
      .maybeSingle();

    let customerId: string;
    let workspaceId: string;

    if (existingCustomer) {
      customerId = existingCustomer.id;
      workspaceId = existingCustomer.workspace_id;
      console.log('Found existing customer:', customerId);
    } else {
      // Get first workspace (in multi-tenant, you'd determine this from routing)
      const { data: workspace } = await supabase
        .from('workspaces')
        .select('id')
        .limit(1)
        .single();

      if (!workspace) {
        throw new Error('No workspace found');
      }

      workspaceId = workspace.id;

      // Create new customer
      const { data: newCustomer, error: customerError } = await supabase
        .from('customers')
        .insert({
          workspace_id: workspaceId,
          phone: normalizedMessage.customerIdentifier,
          name: normalizedMessage.customerName || `Customer ${normalizedMessage.customerIdentifier}`,
          preferred_channel: normalizedMessage.channel
        })
        .select()
        .single();

      if (customerError) {
        console.error('Error creating customer:', customerError);
        throw customerError;
      }

      customerId = newCustomer.id;
      console.log('Created new customer:', customerId);
    }

    // Find or create conversation
    const { data: existingConversation } = await supabase
      .from('conversations')
      .select('id, status')
      .eq('customer_id', customerId)
      .eq('channel', normalizedMessage.channel)
      .in('status', ['new', 'in_progress', 'waiting'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    let conversationId: string;
    let isNewConversation = false;

    if (existingConversation) {
      conversationId = existingConversation.id;
      console.log('Using existing conversation:', conversationId);
      
      // Update conversation
      await supabase
        .from('conversations')
        .update({
          updated_at: new Date().toISOString(),
          message_count: supabase.rpc('increment_message_count', { conversation_id: conversationId })
        })
        .eq('id', conversationId);
    } else {
      // Create new conversation
      const { data: newConversation, error: convError } = await supabase
        .from('conversations')
        .insert({
          workspace_id: workspaceId,
          customer_id: customerId,
          channel: normalizedMessage.channel,
          status: 'new',
          conversation_type: 'ai_handled',
          message_count: 1,
          title: `${normalizedMessage.channel} conversation with ${normalizedMessage.customerName || normalizedMessage.customerIdentifier}`
        })
        .select()
        .single();

      if (convError) {
        console.error('Error creating conversation:', convError);
        throw convError;
      }

      conversationId = newConversation.id;
      isNewConversation = true;
      console.log('Created new conversation:', conversationId);
    }

    // Insert the customer message
    const { error: messageError } = await supabase
      .from('messages')
      .insert({
        conversation_id: conversationId,
        direction: 'inbound',
        channel: normalizedMessage.channel,
        actor_type: 'customer',
        actor_id: customerId,
        actor_name: normalizedMessage.customerName || normalizedMessage.customerIdentifier,
        body: normalizedMessage.messageContent,
        raw_payload: normalizedMessage.metadata
      });

    if (messageError) {
      console.error('Error inserting message:', messageError);
      throw messageError;
    }

    // Get conversation history for context
    const { data: messages } = await supabase
      .from('messages')
      .select('actor_type, body, created_at')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true })
      .limit(10);

    const conversationHistory = messages?.map(msg => ({
      role: msg.actor_type === 'customer' ? 'user' : 'assistant',
      content: msg.body,
      timestamp: msg.created_at
    })) || [];

    // Call Claude AI Agent
    console.log('Calling claude-ai-agent...');
    const { data: aiResponse, error: aiError } = await supabase.functions.invoke('claude-ai-agent', {
      body: {
        channel: normalizedMessage.channel,
        customerIdentifier: normalizedMessage.customerIdentifier,
        customerName: normalizedMessage.customerName,
        messageContent: normalizedMessage.messageContent,
        conversationHistory,
        metadata: normalizedMessage.metadata
      }
    });

    if (aiError) {
      console.error('AI agent error:', aiError);
      throw aiError;
    }

    console.log('AI Decision:', {
      shouldEscalate: aiResponse.shouldEscalate,
      confidence: aiResponse.confidence,
      intent: aiResponse.intent
    });

    // Handle based on AI decision
    if (aiResponse.shouldEscalate) {
      // ESCALATE TO HUMAN
      console.log('Escalating to human:', aiResponse.escalationReason);
      
      await supabase
        .from('conversations')
        .update({
          is_escalated: true,
          escalated_at: new Date().toISOString(),
          status: 'new',
          conversation_type: 'escalated',
          ai_reason_for_escalation: aiResponse.escalationReason,
          ai_confidence: aiResponse.confidence,
          ai_sentiment: aiResponse.sentiment,
          category: aiResponse.category,
          summary_for_human: `Customer inquiry: ${normalizedMessage.messageContent.substring(0, 100)}...`
        })
        .eq('id', conversationId);

      // Insert escalation message to messages table
      await supabase
        .from('messages')
        .insert({
          conversation_id: conversationId,
          direction: 'internal',
          channel: normalizedMessage.channel,
          actor_type: 'system',
          actor_name: 'AI Agent',
          body: `⚠️ Escalated: ${aiResponse.escalationReason}\nConfidence: ${aiResponse.confidence}%\nSentiment: ${aiResponse.sentiment}`,
          is_internal: true
        });

      return new Response(
        JSON.stringify({
          success: true,
          action: 'escalated',
          conversationId,
          reason: aiResponse.escalationReason
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200,
        }
      );
    } else {
      // AUTO-RESPOND
      console.log('Auto-responding with confidence:', aiResponse.confidence);

      // Update conversation metadata
      await supabase
        .from('conversations')
        .update({
          ai_message_count: supabase.rpc('increment_ai_message_count', { conversation_id: conversationId }),
          ai_confidence: aiResponse.confidence,
          ai_sentiment: aiResponse.sentiment,
          category: aiResponse.category,
          updated_at: new Date().toISOString()
        })
        .eq('id', conversationId);

      // Send the response
      const { error: sendError } = await supabase.functions.invoke('send-response', {
        body: {
          conversationId,
          channel: normalizedMessage.channel,
          to: normalizedMessage.customerIdentifier,
          message: aiResponse.responseText,
          metadata: {
            aiIntent: aiResponse.intent,
            aiConfidence: aiResponse.confidence
          }
        }
      });

      if (sendError) {
        console.error('Error sending response:', sendError);
        throw sendError;
      }

      return new Response(
        JSON.stringify({
          success: true,
          action: 'auto_responded',
          conversationId,
          confidence: aiResponse.confidence,
          response: aiResponse.responseText
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200,
        }
      );
    }

  } catch (error: any) {
    console.error('Error in receive-message:', error);
    return new Response(
      JSON.stringify({ 
        error: error.message,
        details: error.toString()
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
