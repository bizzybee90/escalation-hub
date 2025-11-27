import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.81.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface SendRequest {
  conversationId: string;
  channel: 'sms' | 'whatsapp' | 'email' | 'webchat';
  to: string;
  message: string;
  metadata?: Record<string, any>;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const twilioAccountSid = Deno.env.get('TWILIO_ACCOUNT_SID');
    const twilioAuthToken = Deno.env.get('TWILIO_AUTH_TOKEN');
    const twilioPhoneNumber = Deno.env.get('TWILIO_PHONE_NUMBER');
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!twilioAccountSid || !twilioAuthToken || !twilioPhoneNumber) {
      throw new Error('Twilio credentials not configured');
    }

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error('Supabase credentials not configured');
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const sendRequest: SendRequest = await req.json();

    console.log('Sending message:', {
      channel: sendRequest.channel,
      to: sendRequest.to,
      messagePreview: sendRequest.message.substring(0, 50)
    });

    let twilioResponse;
    let from: string;
    let to: string;

    // Format numbers and send based on channel
    if (sendRequest.channel === 'whatsapp') {
      from = `whatsapp:${twilioPhoneNumber}`;
      to = `whatsapp:${sendRequest.to}`;
    } else {
      // SMS
      from = twilioPhoneNumber;
      to = sendRequest.to;
    }

    // Send via Twilio
    const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${twilioAccountSid}/Messages.json`;
    const auth = btoa(`${twilioAccountSid}:${twilioAuthToken}`);

    const formData = new URLSearchParams();
    formData.append('From', from);
    formData.append('To', to);
    formData.append('Body', sendRequest.message);

    console.log('Calling Twilio API...');
    const twilioRes = await fetch(twilioUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: formData,
    });

    if (!twilioRes.ok) {
      const errorText = await twilioRes.text();
      console.error('Twilio API error:', twilioRes.status, errorText);
      throw new Error(`Twilio error: ${twilioRes.status} - ${errorText}`);
    }

    twilioResponse = await twilioRes.json();
    console.log('Message sent via Twilio:', twilioResponse.sid);

    // Get conversation to find customer
    const { data: conversation } = await supabase
      .from('conversations')
      .select('customer_id')
      .eq('id', sendRequest.conversationId)
      .single();

    if (!conversation) {
      throw new Error('Conversation not found');
    }

    // Log the outbound message to database
    const { error: messageError } = await supabase
      .from('messages')
      .insert({
        conversation_id: sendRequest.conversationId,
        direction: 'outbound',
        channel: sendRequest.channel,
        actor_type: 'ai_agent',
        actor_name: 'MAC Cleaning AI',
        body: sendRequest.message,
        raw_payload: {
          ...sendRequest.metadata,
          twilioSid: twilioResponse.sid,
          twilioStatus: twilioResponse.status
        }
      });

    if (messageError) {
      console.error('Error logging message:', messageError);
      // Don't fail the request if logging fails
    }

    // Update conversation
    await supabase
      .from('conversations')
      .update({
        updated_at: new Date().toISOString(),
        message_count: supabase.rpc('increment_message_count', { conversation_id: sendRequest.conversationId })
      })
      .eq('id', sendRequest.conversationId);

    return new Response(
      JSON.stringify({
        success: true,
        twilioSid: twilioResponse.sid,
        status: twilioResponse.status,
        channel: sendRequest.channel
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );

  } catch (error: any) {
    console.error('Error in send-response:', error);
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
