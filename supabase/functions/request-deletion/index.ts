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
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { customer_identifier, reason, deletion_type } = await req.json();

    if (!customer_identifier) {
      return new Response(
        JSON.stringify({ error: 'customer_identifier is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Creating deletion request for:', customer_identifier);

    // Find customer
    const { data: customer, error: customerError } = await supabase
      .from('customers')
      .select('id, name, email')
      .or(`email.eq.${customer_identifier},phone.eq.${customer_identifier}`)
      .single();

    if (customerError || !customer) {
      return new Response(
        JSON.stringify({ error: 'Customer not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create deletion request
    const { data: deletionRequest, error: requestError } = await supabase
      .from('data_deletion_requests')
      .insert({
        customer_id: customer.id,
        status: 'pending',
        reason: reason || 'Customer requested data deletion',
        deletion_type: deletion_type || 'full',
        notes: 'Request created via API'
      })
      .select('id')
      .single();

    if (requestError) {
      console.error('Error creating deletion request:', requestError);
      throw requestError;
    }

    // Calculate estimated completion (30 days from now)
    const estimatedCompletion = new Date();
    estimatedCompletion.setDate(estimatedCompletion.getDate() + 30);

    console.log('Deletion request created:', deletionRequest.id);

    return new Response(
      JSON.stringify({
        request_id: deletionRequest.id,
        status: 'pending',
        estimated_completion: estimatedCompletion.toISOString(),
        message: 'Your deletion request has been received and will be processed within 30 days. An administrator will review your request.'
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('Error creating deletion request:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
