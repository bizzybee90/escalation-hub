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
    const { workspaceId, emailAddress } = await req.json();
    
    console.log('[gmail-disconnect] Disconnecting Gmail for workspace:', workspaceId, 'email:', emailAddress);

    const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);

    // Get the config to revoke the token
    const { data: config, error: fetchError } = await supabase
      .from('gmail_channel_configs')
      .select('*')
      .eq('workspace_id', workspaceId)
      .eq('email_address', emailAddress)
      .maybeSingle();

    if (fetchError) {
      throw new Error('Failed to fetch Gmail config');
    }

    if (config?.access_token) {
      // Revoke the OAuth token
      try {
        await fetch(`https://oauth2.googleapis.com/revoke?token=${config.access_token}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        });
        console.log('[gmail-disconnect] Token revoked');
      } catch (revokeError) {
        console.error('[gmail-disconnect] Token revoke failed (non-fatal):', revokeError);
        // Continue with deletion even if revoke fails
      }
    }

    // Delete the config from database
    const { error: deleteError } = await supabase
      .from('gmail_channel_configs')
      .delete()
      .eq('workspace_id', workspaceId)
      .eq('email_address', emailAddress);

    if (deleteError) {
      throw new Error('Failed to delete Gmail config');
    }

    console.log('[gmail-disconnect] Gmail disconnected successfully');

    return new Response(
      JSON.stringify({ success: true }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: unknown) {
    console.error('[gmail-disconnect] Error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
