import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async (req) => {
  try {
    const url = new URL(req.url);
    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state');
    const error = url.searchParams.get('error');

    console.log('[gmail-oauth-callback] Received callback');

    if (error) {
      console.error('[gmail-oauth-callback] OAuth error:', error);
      return redirectWithError('OAuth was denied or failed');
    }

    if (!code || !state) {
      return redirectWithError('Missing code or state parameter');
    }

    // Decode state
    let stateData;
    try {
      stateData = JSON.parse(atob(state));
    } catch {
      return redirectWithError('Invalid state parameter');
    }

    const { workspaceId } = stateData;
    if (!workspaceId) {
      return redirectWithError('Missing workspaceId in state');
    }

    const GOOGLE_CLIENT_ID = Deno.env.get('GOOGLE_CLIENT_ID');
    const GOOGLE_CLIENT_SECRET = Deno.env.get('GOOGLE_CLIENT_SECRET');
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
      return redirectWithError('Google OAuth not configured');
    }

    const redirectUri = `${SUPABASE_URL}/functions/v1/gmail-oauth-callback`;

    // Exchange code for tokens
    console.log('[gmail-oauth-callback] Exchanging code for tokens');
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    });

    const tokenData = await tokenResponse.json();
    
    if (tokenData.error) {
      console.error('[gmail-oauth-callback] Token error:', tokenData);
      return redirectWithError(tokenData.error_description || 'Failed to get tokens');
    }

    const { access_token, refresh_token, expires_in } = tokenData;
    
    if (!access_token || !refresh_token) {
      return redirectWithError('Missing tokens in response');
    }

    // Get user's email address
    console.log('[gmail-oauth-callback] Fetching user profile');
    const profileResponse = await fetch('https://www.googleapis.com/gmail/v1/users/me/profile', {
      headers: { Authorization: `Bearer ${access_token}` },
    });

    const profileData = await profileResponse.json();
    const emailAddress = profileData.emailAddress;

    if (!emailAddress) {
      return redirectWithError('Could not get email address');
    }

    console.log('[gmail-oauth-callback] Connected email:', emailAddress);

    // Calculate token expiration
    const tokenExpiresAt = new Date(Date.now() + expires_in * 1000).toISOString();

    // Store in database
    const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);

    const { error: upsertError } = await supabase
      .from('gmail_channel_configs')
      .upsert({
        workspace_id: workspaceId,
        email_address: emailAddress,
        access_token,
        refresh_token,
        token_expires_at: tokenExpiresAt,
        connected_at: new Date().toISOString(),
        import_mode: 'new_only',
      }, {
        onConflict: 'workspace_id,email_address',
      });

    if (upsertError) {
      console.error('[gmail-oauth-callback] Database error:', upsertError);
      return redirectWithError('Failed to save connection');
    }

    // Set up Gmail watch for push notifications
    try {
      await setupGmailWatch(access_token, SUPABASE_URL!, workspaceId, supabase);
    } catch (watchError) {
      console.error('[gmail-oauth-callback] Watch setup failed (non-fatal):', watchError);
      // Continue - watch can be set up later via gmail-sync
    }

    console.log('[gmail-oauth-callback] Successfully connected Gmail for workspace:', workspaceId);

    // Redirect back to app with success
    return new Response(null, {
      status: 302,
      headers: {
        Location: `${getAppUrl()}/settings?gmail=connected&email=${encodeURIComponent(emailAddress)}`,
      },
    });
  } catch (error) {
    console.error('[gmail-oauth-callback] Unexpected error:', error);
    return redirectWithError('Unexpected error occurred');
  }
});

function redirectWithError(message: string): Response {
  return new Response(null, {
    status: 302,
    headers: {
      Location: `${getAppUrl()}/settings?gmail=error&message=${encodeURIComponent(message)}`,
    },
  });
}

function getAppUrl(): string {
  // Return the app URL - adjust based on environment
  return Deno.env.get('APP_URL') || 'https://preview--bizzybee-support.lovable.app';
}

async function setupGmailWatch(
  accessToken: string,
  supabaseUrl: string,
  workspaceId: string,
  supabase: any
): Promise<void> {
  // Note: Gmail push notifications require a Cloud Pub/Sub topic
  // For now, we'll rely on polling via gmail-sync
  // To enable push, you'd need to:
  // 1. Create a Pub/Sub topic in Google Cloud
  // 2. Grant Gmail API publish rights to the topic
  // 3. Call watch() with the topic name
  
  console.log('[gmail-oauth-callback] Watch setup skipped - using polling mode');
  
  // Update config to indicate polling mode
  await supabase
    .from('gmail_channel_configs')
    .update({
      watch_expiration: null, // No watch active
    })
    .eq('workspace_id', workspaceId);
}
