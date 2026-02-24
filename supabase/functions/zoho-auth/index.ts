import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const ZOHO_AUTH_URL = 'https://accounts.zoho.eu/oauth/v2'
const ZOHO_API_URL = 'https://www.zohoapis.eu'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
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
      const redirectUri = `${Deno.env.get('SUPABASE_URL')}/functions/v1/zoho-auth?action=callback`
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

    // Step 2: Handle OAuth callback - exchange code for tokens
    if (action === 'callback') {
      const code = url.searchParams.get('code')
      if (!code) {
        return new Response(htmlPage('Error', 'No authorization code received from Zoho.'), {
          headers: { 'Content-Type': 'text/html' }
        })
      }

      const redirectUri = `${Deno.env.get('SUPABASE_URL')}/functions/v1/zoho-auth?action=callback`

      const tokenResponse = await fetch(`${ZOHO_AUTH_URL}/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code,
          client_id: clientId,
          client_secret: clientSecret,
          redirect_uri: redirectUri,
          grant_type: 'authorization_code',
        }),
      })

      const tokenData = await tokenResponse.json()
      console.log('Token response:', JSON.stringify(tokenData))

      if (tokenData.error) {
        return new Response(htmlPage('Error', `Zoho OAuth error: ${tokenData.error}`), {
          headers: { 'Content-Type': 'text/html' }
        })
      }

      // Get the organization ID from Zoho Books
      let orgId = null
      try {
        const orgsResponse = await fetch(`${ZOHO_API_URL}/books/v3/organizations`, {
          headers: { 'Authorization': `Zoho-oauthtoken ${tokenData.access_token}` }
        })
        const orgsData = await orgsResponse.json()
        if (orgsData.organizations?.length > 0) {
          orgId = orgsData.organizations[0].organization_id
        }
      } catch (e) {
        console.error('Failed to fetch org ID:', e)
      }

      // Store tokens - upsert so we only keep one set
      const { error: dbError } = await supabase
        .from('zoho_tokens')
        .upsert({
          id: '00000000-0000-0000-0000-000000000001', // singleton row
          organization_id: orgId,
          access_token: tokenData.access_token,
          refresh_token: tokenData.refresh_token,
          token_type: tokenData.token_type || 'Bearer',
          expires_at: new Date(Date.now() + (tokenData.expires_in || 3600) * 1000).toISOString(),
          scope: tokenData.scope,
        }, { onConflict: 'id' })

      if (dbError) {
        console.error('Failed to store tokens:', dbError)
        return new Response(htmlPage('Error', 'Failed to store tokens.'), {
          headers: { 'Content-Type': 'text/html' }
        })
      }

      return new Response(htmlPage('Success!', 'Zoho Books connected successfully. You can close this window.'), {
        headers: { 'Content-Type': 'text/html' }
      })
    }

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

function htmlPage(title: string, message: string) {
  return `<!DOCTYPE html>
<html><head><title>${title}</title>
<style>body{font-family:system-ui;display:flex;justify-content:center;align-items:center;height:100vh;margin:0;background:#f8f9fa}
.card{background:white;padding:2rem;border-radius:12px;box-shadow:0 4px 12px rgba(0,0,0,.1);text-align:center;max-width:400px}
h1{color:${title === 'Success!' ? '#10b981' : '#ef4444'}}</style></head>
<body><div class="card"><h1>${title}</h1><p>${message}</p></div></body></html>`
}
