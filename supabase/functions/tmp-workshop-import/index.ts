import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'

Deno.serve(async (req) => {
  try {
    const { url } = await req.json()
    const res = await fetch(url)
    if (!res.ok) throw new Error(`fetch failed: ${res.status}`)
    const sql = await res.text()
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )
    const { error } = await supabase.rpc('__tmp_exec_sql', { sql })
    if (error) throw new Error(error.message)
    return new Response(JSON.stringify({ ok: true, length: sql.length }), {
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
})
