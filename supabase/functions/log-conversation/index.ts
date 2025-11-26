import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.47.10';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const payload = await req.json();
    console.log('📝 log-conversation payload:', JSON.stringify(payload, null, 2));

    const {
      action,
      channel,
      customer_identifier,
      customer_name,
      customer_email,
      customer_phone,
      message_type, // 'incoming' | 'ai_response' | 'human_response'
      message_content,
      ai_confidence,
      ai_sentiment,
      ai_reason_for_escalation,
      category,
      priority,
      conversation_id,
      resolution_summary,
      metadata = {}
    } = payload;

    // Validate required fields based on action
    if (action === 'message') {
      if (!channel || !customer_identifier || !message_content || !message_type) {
        return new Response(
          JSON.stringify({ error: 'Missing required fields: channel, customer_identifier, message_content, message_type' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        );
      }
    } else if (action === 'resolution') {
      if (!conversation_id && !customer_identifier) {
        return new Response(
          JSON.stringify({ error: 'Missing required field: conversation_id or customer_identifier' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        );
      }
    } else {
      return new Response(
        JSON.stringify({ error: 'Invalid action. Must be "message" or "resolution"' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    // Get workspace_id from workspaces table
    const { data: workspace, error: workspaceError } = await supabase
      .from('workspaces')
      .select('id')
      .limit(1)
      .single();

    if (workspaceError) throw workspaceError;
    const workspace_id = workspace.id;

    // Handle message action
    if (action === 'message') {
      // Step 1: Find or create customer
      let customerId: string;

      const { data: existingCustomer } = await supabase
        .from('customers')
        .select('id')
        .eq('workspace_id', workspace_id)
        .or(`email.eq.${customer_email || ''},phone.eq.${customer_phone || ''}`)
        .limit(1)
        .single();

      if (existingCustomer) {
        customerId = existingCustomer.id;
        console.log('✅ Found existing customer:', customerId);
      } else {
        const { data: newCustomer, error: customerError } = await supabase
          .from('customers')
          .insert({
            workspace_id,
            name: customer_name,
            email: customer_email,
            phone: customer_phone,
            custom_fields: metadata.customer_custom_fields || {}
          })
          .select()
          .single();

        if (customerError) throw customerError;
        customerId = newCustomer.id;
        console.log('➕ Created new customer:', customerId);
      }

      // Step 2: Find or create conversation (non-escalated by default)
      let conversationId: string;

      // Look for existing non-escalated conversation
      const { data: existingConversations } = await supabase
        .from('conversations')
        .select('*')
        .eq('customer_id', customerId)
        .eq('channel', channel)
        .eq('is_escalated', false)
        .in('status', ['new', 'open', 'pending'])
        .order('created_at', { ascending: false })
        .limit(1);

      const existingConversation = existingConversations?.[0];

      if (existingConversation) {
        conversationId = existingConversation.id;
        console.log('✅ REUSING existing non-escalated conversation:', conversationId);

        // Update message count
        await supabase
          .from('conversations')
          .update({
            message_count: (existingConversation.message_count || 0) + 1,
            ai_message_count: message_type === 'ai_response' 
              ? (existingConversation.ai_message_count || 0) + 1 
              : existingConversation.ai_message_count || 0,
            updated_at: new Date().toISOString()
          })
          .eq('id', conversationId);
      } else {
        console.log('➕ Creating new NON-ESCALATED conversation');
        const { data: newConversation, error: conversationError } = await supabase
          .from('conversations')
          .insert({
            workspace_id,
            customer_id: customerId,
            channel,
            status: 'new',
            priority: priority || 'medium',
            category: category || 'other',
            is_escalated: false,
            conversation_type: 'ai_handled',
            ai_confidence,
            ai_sentiment,
            message_count: 1,
            ai_message_count: message_type === 'ai_response' ? 1 : 0,
            metadata
          })
          .select()
          .single();

        if (conversationError) throw conversationError;
        conversationId = newConversation.id;
        console.log('✅ Created conversation:', conversationId);
      }

      // Step 3: Insert message
      const direction = message_type === 'incoming' ? 'inbound' : 'outbound';
      const actor_type = message_type === 'ai_response' ? 'ai_agent' : 
                        message_type === 'human_response' ? 'human_agent' : 'customer';

      const { error: messageError } = await supabase
        .from('messages')
        .insert({
          conversation_id: conversationId,
          channel,
          direction,
          body: message_content,
          actor_type,
          actor_name: actor_type === 'customer' ? customer_name : (actor_type === 'ai_agent' ? 'AI Assistant' : null),
          is_internal: false,
          raw_payload: metadata
        });

      if (messageError) throw messageError;
      console.log('✅ Message inserted');

      return new Response(
        JSON.stringify({ 
          success: true, 
          conversation_id: conversationId,
          customer_id: customerId,
          message: 'Conversation logged successfully' 
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200 
        }
      );
    }

    // Handle resolution action
    if (action === 'resolution') {
      let resolveConversationId = conversation_id;

      // If conversation_id not provided, find most recent open conversation
      if (!resolveConversationId && customer_identifier) {
        console.log('🔍 Auto-finding conversation for customer:', customer_identifier);

        // Find customer first
        const { data: customer } = await supabase
          .from('customers')
          .select('id')
          .eq('workspace_id', workspace_id)
          .or(`email.eq.${customer_email || ''},phone.eq.${customer_phone || ''}`)
          .limit(1)
          .single();

        if (!customer) {
          return new Response(
            JSON.stringify({ error: 'Customer not found' }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 404 }
          );
        }

        // Find most recent non-resolved conversation
        const { data: openConversations } = await supabase
          .from('conversations')
          .select('id')
          .eq('customer_id', customer.id)
          .eq('channel', channel || 'whatsapp')
          .in('status', ['new', 'open', 'pending'])
          .order('created_at', { ascending: false })
          .limit(1);

        if (!openConversations || openConversations.length === 0) {
          return new Response(
            JSON.stringify({ error: 'No open conversation found for this customer' }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 404 }
          );
        }

        resolveConversationId = openConversations[0].id;
        console.log('✅ Found conversation to resolve:', resolveConversationId);
      }

      const { error: updateError } = await supabase
        .from('conversations')
        .update({
          status: 'resolved',
          resolved_at: new Date().toISOString(),
          ai_resolution_summary: resolution_summary
        })
        .eq('id', resolveConversationId);

      if (updateError) throw updateError;

      console.log('✅ Conversation resolved:', resolveConversationId);

      return new Response(
        JSON.stringify({ 
          success: true, 
          conversation_id: resolveConversationId,
          message: 'Conversation resolved successfully' 
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200 
        }
      );
    }

    // Fallback return (should never reach here)
    return new Response(
      JSON.stringify({ error: 'Invalid action' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
    );

  } catch (error) {
    console.error('❌ Error in log-conversation:', error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : 'Unknown error',
        details: error
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500 
      }
    );
  }
});