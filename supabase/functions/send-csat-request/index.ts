import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    console.log('🎯 [send-csat-request] Starting CSAT request processing...');

    // Find conversations that:
    // 1. Are resolved
    // 2. Were resolved more than 1 hour ago
    // 3. Haven't had a CSAT request sent yet
    // 4. Don't already have a CSAT rating
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();

    const { data: eligibleConversations, error: fetchError } = await supabase
      .from('conversations')
      .select(`
        id,
        channel,
        customer_id,
        resolved_at,
        customers!inner (
          id,
          phone,
          email,
          name
        )
      `)
      .eq('status', 'resolved')
      .lt('resolved_at', oneHourAgo)
      .is('csat_requested_at', null)
      .is('customer_satisfaction', null)
      .limit(50);

    if (fetchError) {
      console.error('❌ [send-csat-request] Fetch error:', fetchError);
      throw fetchError;
    }

    console.log(`📋 [send-csat-request] Found ${eligibleConversations?.length || 0} eligible conversations`);

    if (!eligibleConversations || eligibleConversations.length === 0) {
      return new Response(JSON.stringify({
        success: true,
        message: 'No eligible conversations for CSAT',
        processed: 0,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let processed = 0;
    let failed = 0;

    for (const conv of eligibleConversations) {
      try {
        const customer = conv.customers as any;
        const recipient = conv.channel === 'email' 
          ? customer?.email 
          : customer?.phone;

        if (!recipient) {
          console.log(`⚠️ [send-csat-request] No recipient for conversation ${conv.id}`);
          continue;
        }

        const csatMessage = "How did we do? Reply with a number 1-5 (1=Poor, 5=Excellent). Your feedback helps us improve!";

        console.log(`📤 [send-csat-request] Sending CSAT request to ${recipient} for conversation ${conv.id}`);

        // Send the CSAT request via send-response
        const sendResult = await supabase.functions.invoke('send-response', {
          body: {
            conversationId: conv.id,
            channel: conv.channel,
            to: recipient,
            message: csatMessage,
            skipMessageLog: false,
          }
        });

        if (sendResult.error) {
          console.error(`❌ [send-csat-request] Failed to send CSAT for ${conv.id}:`, sendResult.error);
          failed++;
          continue;
        }

        // Mark conversation as CSAT requested
        const { error: updateError } = await supabase
          .from('conversations')
          .update({ 
            csat_requested_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq('id', conv.id);

        if (updateError) {
          console.error(`❌ [send-csat-request] Failed to update conversation ${conv.id}:`, updateError);
          failed++;
          continue;
        }

        // Log the CSAT request message
        await supabase
          .from('messages')
          .insert({
            conversation_id: conv.id,
            actor_type: 'system',
            actor_name: 'CSAT System',
            body: csatMessage,
            channel: conv.channel,
            direction: 'outbound',
            is_internal: false,
          });

        processed++;
        console.log(`✅ [send-csat-request] CSAT request sent for conversation ${conv.id}`);

      } catch (err) {
        console.error(`❌ [send-csat-request] Error processing conversation ${conv.id}:`, err);
        failed++;
      }
    }

    console.log(`📊 [send-csat-request] Complete. Processed: ${processed}, Failed: ${failed}`);

    return new Response(JSON.stringify({
      success: true,
      processed,
      failed,
      total: eligibleConversations.length,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: any) {
    console.error('❌ [send-csat-request] Fatal error:', error);
    return new Response(JSON.stringify({
      error: error.message,
      success: false
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
