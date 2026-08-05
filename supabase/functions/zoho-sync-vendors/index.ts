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

  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ error: 'Unauthorized - Bearer token required' }), {
      status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const supabaseAuth = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } }
  )

  const token = authHeader.replace('Bearer ', '')
  const { data: claimsData, error: claimsError } = await supabaseAuth.auth.getClaims(token)
  if (claimsError || !claimsData?.claims) {
    return new Response(JSON.stringify({ error: 'Invalid or expired token' }), {
      status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  const clientId = Deno.env.get('ZOHO_CLIENT_ID')
  const clientSecret = Deno.env.get('ZOHO_CLIENT_SECRET')
  if (!clientId || !clientSecret) {
    return new Response(JSON.stringify({ error: 'Zoho credentials not configured' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  try {
    const accessToken = await getValidAccessToken(supabase, clientId, clientSecret)

    const { data: tokenRow } = await supabase
      .from('zoho_tokens')
      .select('organization_id')
      .eq('id', '00000000-0000-0000-0000-000000000001')
      .single()

    const orgId = tokenRow?.organization_id
    if (!orgId) throw new Error('No Zoho organization ID found. Please reconnect Zoho Books.')

    // Fetch all vendors from Zoho Books
    const vendors: any[] = []
    let page = 1
    while (true) {
      const res = await fetch(
        `${ZOHO_API_URL}/books/v3/contacts?organization_id=${orgId}&contact_type=vendor&page=${page}&per_page=200`,
        { headers: { Authorization: `Zoho-oauthtoken ${accessToken}` } }
      )
      const data = await res.json()
      if (data.code !== 0) {
        throw new Error(`Zoho API error: ${data.message || res.status}`)
      }
      vendors.push(...(data.contacts || []))
      if (!data.page_context?.has_more_page) break
      page++
    }

    // Existing suppliers for matching
    const { data: existing } = await supabase
      .from('suppliers')
      .select('id, name, code, zoho_contact_id')

    const byZohoId = new Map<string, any>()
    const byName = new Map<string, any>()
    for (const s of existing || []) {
      if (s.zoho_contact_id) byZohoId.set(String(s.zoho_contact_id), s)
      byName.set(String(s.name || '').trim().toLowerCase(), s)
    }

    let created = 0
    let updated = 0

    for (const v of vendors) {
      const zohoId = String(v.contact_id)
      const name = v.company_name || v.contact_name || 'Unnamed Vendor'
      // Vendor number as shown in Zoho
      const vendorNumber = (v.contact_number || v.vendor_number || '').toString().trim()
      const code = vendorNumber || `ZV-${zohoId}`

      const payload: Record<string, unknown> = {
        name,
        code,
        zoho_contact_id: zohoId,
        contact_person: v.contact_name || null,
        email: v.email || v.contact_persons?.[0]?.email || null,
        phone: v.phone || v.mobile || null,
        address: formatAddress(v.billing_address),
      }

      const match = byZohoId.get(zohoId) || byName.get(String(name).trim().toLowerCase())

      if (match) {
        const { error } = await supabase.from('suppliers').update(payload).eq('id', match.id)
        if (error) console.error(`Update failed for ${name}:`, error.message)
        else updated++
      } else {
        const { error } = await supabase.from('suppliers').insert(payload)
        if (error) console.error(`Insert failed for ${name}:`, error.message)
        else created++
      }
    }

    return new Response(JSON.stringify({
      success: true,
      total_vendors: vendors.length,
      created,
      updated,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

  } catch (error) {
    console.error('Vendor sync error:', error)
    return new Response(JSON.stringify({
      error: error instanceof Error ? error.message : 'Vendor sync failed',
    }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
})

async function getValidAccessToken(supabase: any, clientId: string, clientSecret: string): Promise<string> {
  const { data: tokenRow } = await supabase
    .from('zoho_tokens')
    .select('*')
    .eq('id', '00000000-0000-0000-0000-000000000001')
    .single()

  if (!tokenRow) throw new Error('No Zoho tokens found. Please connect Zoho Books first.')

  const expiresAt = new Date(tokenRow.expires_at)
  if (expiresAt.getTime() - Date.now() > 5 * 60 * 1000) return tokenRow.access_token

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
  if (tokenData.error) throw new Error(`Token refresh failed: ${tokenData.error}`)

  await supabase
    .from('zoho_tokens')
    .update({
      access_token: tokenData.access_token,
      expires_at: new Date(Date.now() + (tokenData.expires_in || 3600) * 1000).toISOString(),
    })
    .eq('id', '00000000-0000-0000-0000-000000000001')

  return tokenData.access_token
}

function formatAddress(addr: any): string | null {
  if (!addr) return null
  const parts = [addr.address, addr.street2, addr.city, addr.state, addr.zip, addr.country]
  return parts.filter(Boolean).join(', ') || null
}
