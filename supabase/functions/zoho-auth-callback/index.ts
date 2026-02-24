import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const ZOHO_AUTH_URL = 'https://accounts.zoho.com/oauth/v2'
const ZOHO_API_URL = 'https://www.zohoapis.com'

Deno.serve(async (req) => {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  const clientId = Deno.env.get('ZOHO_CLIENT_ID')
  const clientSecret = Deno.env.get('ZOHO_CLIENT_SECRET')

  if (!clientId || !clientSecret) {
    return new Response(htmlPage('Error', 'Zoho credentials not configured.'), {
      headers: { 'Content-Type': 'text/html' }
    })
  }

  const url = new URL(req.url)
  const code = url.searchParams.get('code')

  if (!code) {
    return new Response(htmlPage('Error', 'No authorization code received from Zoho.'), {
      headers: { 'Content-Type': 'text/html' }
    })
  }

  try {
    const redirectUri = `${Deno.env.get('SUPABASE_URL')}/functions/v1/zoho-auth-callback`

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

    // Store tokens
    const { error: dbError } = await supabase
      .from('zoho_tokens')
      .upsert({
        id: '00000000-0000-0000-0000-000000000001',
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
  } catch (error) {
    console.error('Zoho callback error:', error)
    return new Response(htmlPage('Error', error instanceof Error ? error.message : 'Unknown error'), {
      headers: { 'Content-Type': 'text/html' }
    })
  }
})

function htmlPage(title: string, message: string) {
  return `<!DOCTYPE html>
<html><head><title>${title}</title>
<style>body{font-family:system-ui;display:flex;justify-content:center;align-items:center;height:100vh;margin:0;background:#f8f9fa}
.card{background:white;padding:2rem;border-radius:12px;box-shadow:0 4px 12px rgba(0,0,0,.1);text-align:center;max-width:400px}
h1{color:${title === 'Success!' ? '#10b981' : '#ef4444'}}</style></head>
<body><div class="card"><h1>${title}</h1><p>${message}</p></div></body></html>`
}
