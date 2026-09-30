import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const { notification_id } = await req.json().catch(() => ({}));
    if (typeof notification_id !== "string" || !/^[0-9a-f-]{36}$/i.test(notification_id)) {
      return json({ error: "notification_id required" }, 400);
    }
    const pub = Deno.env.get("VAPID_PUBLIC_KEY");
    const priv = Deno.env.get("VAPID_PRIVATE_KEY");
    if (!pub || !priv) return json({ error: "VAPID keys not configured" }, 500);
    webpush.setVapidDetails("mailto:admin@alepheng.co.za", pub, priv);

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // Claim the notification once; only fresh, un-pushed rows are sent (prevents replay).
    const since = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const { data: n, error } = await admin
      .from("notifications")
      .update({ pushed_at: new Date().toISOString() })
      .eq("id", notification_id)
      .is("pushed_at", null)
      .gte("created_at", since)
      .select("id,user_id,title,message,order_id,order_number,type")
      .maybeSingle();
    if (error) return json({ error: error.message }, 500);
    if (!n) return json({ skipped: true });

    const { data: subs } = await admin.from("push_subscriptions").select("id,endpoint,p256dh,auth").eq("user_id", n.user_id);
    const payload = JSON.stringify({
      title: n.title,
      body: n.message,
      tag: n.id,
      url: n.order_id ? `/admin-dashboard?order=${n.order_id}` : "/admin-dashboard",
    });

    let sent = 0;
    await Promise.all((subs ?? []).map(async (s) => {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 86400 });
        sent++;
      } catch (e: any) {
        if (e?.statusCode === 404 || e?.statusCode === 410) {
          await admin.from("push_subscriptions").delete().eq("id", s.id);
        } else console.error("push failed", e?.statusCode, e?.body);
      }
    }));
    return json({ sent });
  } catch (e) {
    console.error(e);
    return json({ error: String(e) }, 500);
  }
});
