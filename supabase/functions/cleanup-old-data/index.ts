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

    console.log('Starting automated data cleanup...');

    // Get all workspaces with auto-delete enabled
    const { data: policies, error: policiesError } = await supabase
      .from('data_retention_policies')
      .select('*')
      .eq('auto_delete_enabled', true);

    if (policiesError) {
      console.error('Error fetching policies:', policiesError);
      throw policiesError;
    }

    if (!policies || policies.length === 0) {
      console.log('No workspaces with auto-delete enabled');
      return new Response(
        JSON.stringify({ message: 'No workspaces with auto-delete enabled', cleaned: 0 }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let totalCleaned = 0;

    for (const policy of policies) {
      console.log(`Processing workspace: ${policy.workspace_id}`);
      
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - policy.retention_days);

      // Find old conversations for this workspace
      const { data: oldConversations, error: conversationsError } = await supabase
        .from('conversations')
        .select('id, customer_id, customers!inner(tier)')
        .eq('workspace_id', policy.workspace_id)
        .lt('created_at', cutoffDate.toISOString());

      if (conversationsError) {
        console.error('Error fetching conversations:', conversationsError);
        continue;
      }

      if (!oldConversations || oldConversations.length === 0) {
        console.log(`No old conversations found for workspace ${policy.workspace_id}`);
        continue;
      }

      for (const conversation of oldConversations) {
        // Check if we should exclude VIP customers
        const customerData: any = conversation.customers;
        if (policy.exclude_vip_customers && customerData?.tier === 'vip') {
          console.log(`Skipping VIP customer conversation: ${conversation.id}`);
          continue;
        }

        if (policy.anonymize_instead_of_delete) {
          // Anonymize customer data
          await supabase
            .from('customers')
            .update({
              name: `Deleted User ${conversation.customer_id.substring(0, 8)}`,
              email: `deleted_${conversation.customer_id.substring(0, 8)}@removed.local`,
              phone: null,
              notes: '[Anonymized per retention policy]'
            })
            .eq('id', conversation.customer_id);

          // Anonymize message content
          await supabase
            .from('messages')
            .update({
              body: '[Content removed per retention policy]',
              actor_name: 'Anonymized User'
            })
            .eq('conversation_id', conversation.id);

          console.log(`Anonymized conversation: ${conversation.id}`);
        } else {
          // Full deletion - delete messages first, then conversation
          await supabase
            .from('messages')
            .delete()
            .eq('conversation_id', conversation.id);

          await supabase
            .from('conversations')
            .delete()
            .eq('id', conversation.id);

          console.log(`Deleted conversation: ${conversation.id}`);
        }

        // Log the cleanup action
        await supabase
          .from('data_access_logs')
          .insert({
            action: 'auto_cleanup',
            customer_id: conversation.customer_id,
            conversation_id: conversation.id,
            metadata: {
              workspace_id: policy.workspace_id,
              retention_days: policy.retention_days,
              anonymized: policy.anonymize_instead_of_delete
            }
          });

        totalCleaned++;
      }
    }

    console.log(`Cleanup complete. Processed ${totalCleaned} conversations`);

    return new Response(
      JSON.stringify({
        message: 'Cleanup completed successfully',
        cleaned: totalCleaned,
        workspaces_processed: policies.length
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('Error during cleanup:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
