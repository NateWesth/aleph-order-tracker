import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.8";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type Event = "locked" | "approved" | "paid";

const formatCurrency = (n: number) =>
  new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR" }).format(n || 0);

async function sendMailgun(domain: string, apiKey: string, to: string, subject: string, html: string) {
  const form = new FormData();
  form.append("from", `Aleph Commissions <mailgun@${domain}>`);
  form.append("to", to);
  form.append("subject", subject);
  form.append("html", html);
  const baseUrl = Deno.env.get("MAILGUN_BASE_URL") || "https://api.mailgun.net";
  const resp = await fetch(`${baseUrl}/v3/${domain}/messages`, {
    method: "POST",
    headers: { Authorization: `Basic ${btoa(`api:${apiKey}`)}` },
    body: form,
  });
  if (!resp.ok) throw new Error(`Mailgun ${resp.status}: ${await resp.text()}`);
  return await resp.json();
}

function buildHtml(repName: string, event: Event, batch: any, portalUrl: string) {
  const periodLabel = new Date(batch.period_month + "T00:00:00Z").toLocaleDateString("en-ZA", {
    month: "long", year: "numeric", timeZone: "UTC",
  });
  const headline: Record<Event, string> = {
    locked: `Your ${periodLabel} commission period is now locked`,
    approved: `Your ${periodLabel} payout has been approved`,
    paid: `Your ${periodLabel} payout has been paid`,
  };
  const intro: Record<Event, string> = {
    locked: "Your invoices for the period have been finalised. The amounts below are now committed and visible in your rep portal.",
    approved: "Your payout batch has been approved by admin and is queued for payment.",
    paid: `Your payout has been processed${batch.paid_reference ? ` (ref: <strong>${batch.paid_reference}</strong>)` : ""}. Please check your account.`,
  };
  return `<!doctype html><html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f5f5f7;padding:24px;color:#141619;">
  <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:14px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.06);">
    <div style="background:linear-gradient(135deg,#141619,#2a2d33);color:#fafafa;padding:24px 28px;">
      <div style="font-size:12px;letter-spacing:.08em;text-transform:uppercase;opacity:.7;">Aleph Commissions</div>
      <div style="font-size:22px;font-weight:600;margin-top:6px;">${headline[event]}</div>
    </div>
    <div style="padding:24px 28px;">
      <p style="margin:0 0 16px;">Hi ${repName},</p>
      <p style="margin:0 0 20px;color:#4a4d55;line-height:1.5;">${intro[event]}</p>
      <table style="width:100%;border-collapse:collapse;margin-bottom:20px;font-size:14px;">
        <tr><td style="padding:10px 0;border-bottom:1px solid #eee;color:#6b6f78;">Period</td><td style="padding:10px 0;border-bottom:1px solid #eee;text-align:right;font-weight:500;">${periodLabel}</td></tr>
        <tr><td style="padding:10px 0;border-bottom:1px solid #eee;color:#6b6f78;">Invoices</td><td style="padding:10px 0;border-bottom:1px solid #eee;text-align:right;font-weight:500;">${batch.invoice_count}</td></tr>
        <tr><td style="padding:10px 0;border-bottom:1px solid #eee;color:#6b6f78;">Gross commission</td><td style="padding:10px 0;border-bottom:1px solid #eee;text-align:right;font-weight:500;">${formatCurrency(Number(batch.gross_commission))}</td></tr>
        <tr><td style="padding:10px 0;border-bottom:1px solid #eee;color:#6b6f78;">Adjustments</td><td style="padding:10px 0;border-bottom:1px solid #eee;text-align:right;font-weight:500;">${formatCurrency(Number(batch.adjustments_total))}</td></tr>
        <tr><td style="padding:12px 0;color:#141619;font-weight:600;">Net payout</td><td style="padding:12px 0;text-align:right;font-weight:700;color:#141619;font-size:16px;">${formatCurrency(Number(batch.net_payout))}</td></tr>
      </table>
      <a href="${portalUrl}" style="display:inline-block;background:#141619;color:#fafafa;text-decoration:none;padding:12px 20px;border-radius:10px;font-weight:500;font-size:14px;">Open my statement</a>
      <p style="margin:24px 0 0;color:#8a8e97;font-size:12px;line-height:1.5;">If anything looks off, reply to this email or raise a dispute from your statement page.</p>
    </div>
  </div>
</body></html>`;
}

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { batch_id, event } = await req.json() as { batch_id: string; event: Event };
    if (!batch_id || !event) {
      return new Response(JSON.stringify({ error: "batch_id and event required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const mailgunApiKey = Deno.env.get("MAILGUN_API_KEY");
    const mailgunDomain = Deno.env.get("MAILGUN_DOMAIN");
    if (!mailgunApiKey || !mailgunDomain) {
      return new Response(JSON.stringify({ error: "Mailgun not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const { data: batch, error: batchErr } = await admin
      .from("commission_payout_batches").select("*").eq("id", batch_id).maybeSingle();
    if (batchErr || !batch) throw new Error(batchErr?.message || "Batch not found");

    const { data: rep, error: repErr } = await admin
      .from("reps").select("name,email").eq("id", batch.rep_id).maybeSingle();
    if (repErr || !rep?.email) {
      return new Response(JSON.stringify({ skipped: true, reason: "no rep email" }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const portalUrl = "https://app.alepheng.co.za/my-commissions";
    const html = buildHtml(rep.name || "there", event, batch, portalUrl);
    const periodLabel = new Date(batch.period_month + "T00:00:00Z").toLocaleDateString("en-ZA", {
      month: "long", year: "numeric", timeZone: "UTC",
    });
    const subjects: Record<Event, string> = {
      locked: `Commission locked — ${periodLabel}`,
      approved: `Payout approved — ${periodLabel}`,
      paid: `Payout paid — ${periodLabel}`,
    };

    await sendMailgun(mailgunDomain, mailgunApiKey, rep.email, subjects[event], html);

    return new Response(JSON.stringify({ ok: true, sent_to: rep.email, event }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("notify-rep-payout error:", err);
    return new Response(JSON.stringify({ error: err?.message || "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
