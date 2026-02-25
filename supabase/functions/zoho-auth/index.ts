import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
}

const ZOHO_AUTH_URL = 'https://accounts.zoho.com/oauth/v2'
const ZOHO_API_URL = 'https://www.zohoapis.com'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  // Validate authentication
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return new Response(
      JSON.stringify({ error: 'Unauthorized - Bearer token required' }),
      { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  const supabaseAuth = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } }
  );

  const token = authHeader.replace('Bearer ', '');
  const { data: claimsData, error: claimsError } = await supabaseAuth.auth.getClaims(token);
  if (claimsError || !claimsData?.claims) {
    return new Response(
      JSON.stringify({ error: 'Invalid or expired token' }),
      { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  const userId = claimsData.claims.sub;

  // Require admin role for Zoho operations
  const { data: userRole } = await supabaseAuth.from('user_roles').select('role').eq('user_id', userId).single();
  if (userRole?.role !== 'admin') {
    return new Response(
      JSON.stringify({ error: 'Forbidden - Admin access required' }),
      { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  const clientId = Deno.env.get('ZOHO_CLIENT_ID')
  const clientSecret = Deno.env.get('ZOHO_CLIENT_SECRET')

  if (!clientId || !clientSecret) {
    return new Response(JSON.stringify({ error: 'Zoho credentials not configured' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }

  const url = new URL(req.url)
  const action = url.searchParams.get('action')

  try {
    // Step 1: Initiate OAuth - redirect user to Zoho consent screen
    if (action === 'authorize') {
      const redirectUri = `${Deno.env.get('SUPABASE_URL')}/functions/v1/zoho-auth-callback`
      const scope = 'ZohoBooks.fullaccess.all'
      
      const authUrl = `${ZOHO_AUTH_URL}/auth?` + new URLSearchParams({
        response_type: 'code',
        client_id: clientId,
        scope,
        redirect_uri: redirectUri,
        access_type: 'offline',
        prompt: 'consent',
      }).toString()

      return new Response(JSON.stringify({ auth_url: authUrl }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Step 2: Callback is now handled by zoho-auth-callback function

    // Step 3: Check connection status
    if (action === 'status') {
      const { data: token } = await supabase
        .from('zoho_tokens')
        .select('organization_id, expires_at, updated_at')
        .eq('id', '00000000-0000-0000-0000-000000000001')
        .single()

      return new Response(JSON.stringify({
        connected: !!token,
        organization_id: token?.organization_id,
        token_expires_at: token?.expires_at,
        last_updated: token?.updated_at,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Step 4: Refresh token utility
    if (action === 'refresh') {
      const freshToken = await refreshAccessToken(supabase, clientId, clientSecret)
      return new Response(JSON.stringify({ success: true, expires_at: freshToken.expires_at }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    return new Response(JSON.stringify({ error: 'Invalid action. Use: authorize, callback, status, refresh' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (error) {
    console.error('Zoho auth error:', error)
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})

// Refresh the access token using the stored refresh token
export async function refreshAccessToken(
  supabase: any,
  clientId: string,
  clientSecret: string
) {
  const { data: tokenRow, error } = await supabase
    .from('zoho_tokens')
    .select('*')
    .eq('id', '00000000-0000-0000-0000-000000000001')
    .single()

  if (error || !tokenRow) {
    throw new Error('No Zoho tokens found. Please connect Zoho Books first.')
  }

  const tokenResponse = await fetch(`${ZOHO_AUTH_URL}/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: tokenRow.refresh_token,
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'refresh_token',
    }),
  })

  const tokenData = await tokenResponse.json()

  if (tokenData.error) {
    throw new Error(`Token refresh failed: ${tokenData.error}`)
  }

  const expiresAt = new Date(Date.now() + (tokenData.expires_in || 3600) * 1000).toISOString()

  await supabase
    .from('zoho_tokens')
    .update({
      access_token: tokenData.access_token,
      expires_at: expiresAt,
    })
    .eq('id', '00000000-0000-0000-0000-000000000001')

  return { access_token: tokenData.access_token, expires_at: expiresAt }
}

