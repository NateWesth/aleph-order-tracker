
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.8';
import { encode as base64Encode } from "https://deno.land/std@0.190.0/encoding/base64.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

async function sendMailgun(domain: string, apiKey: string, to: string, subject: string, html: string, pdfBase64: string, pdfFilename: string) {
  const form = new FormData();
  form.append('from', `Aleph Order System <mailgun@${domain}>`);
  form.append('to', to);
  form.append('subject', subject);
  form.append('html', html);
  
  const pdfBytes = Uint8Array.from(atob(pdfBase64), c => c.charCodeAt(0));
  form.append('attachment', new Blob([pdfBytes], { type: 'application/pdf' }), pdfFilename);

  const baseUrl = Deno.env.get('MAILGUN_BASE_URL') || 'https://api.mailgun.net';
  const resp = await fetch(`${baseUrl}/v3/${domain}/messages`, {
    method: 'POST',
    headers: { 'Authorization': `Basic ${btoa(`api:${apiKey}`)}` },
    body: form,
  });
  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`Mailgun error ${resp.status}: ${errText}`);
  }
  return await resp.json();
}

serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('=== Daily Afternoon Report Started ===');
    
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const mailgunApiKey = Deno.env.get('MAILGUN_API_KEY');
    const mailgunDomain = Deno.env.get('MAILGUN_DOMAIN');
    if (!mailgunApiKey || !mailgunDomain) {
      return new Response(JSON.stringify({ error: 'MAILGUN_API_KEY or MAILGUN_DOMAIN not configured' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const { data: recipients, error: recipientsErr } = await supabase
      .from('profiles')
      .select('id, email, full_name')
      .eq('daily_afternoon_report', true);

    if (recipientsErr || !recipients || recipients.length === 0) {
      return new Response(JSON.stringify({ message: 'No recipients', sent: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // SAST date range
    const now = new Date();
    const startOfDay = new Date(now);
    startOfDay.setUTCHours(0, 0, 0, 0);
    const startSAST = new Date(startOfDay.getTime() - 2 * 60 * 60 * 1000);
    const endSAST = new Date(startSAST.getTime() + 24 * 60 * 60 * 1000);

    // Only orders completed TODAY
    const { data: completedToday } = await supabase
      .from('orders')
      .select('id, order_number, status, total_amount, completed_date, company_id, companies(name), description, urgency')
      .eq('status', 'delivered')
      .gte('completed_date', startSAST.toISOString())
      .lt('completed_date', endSAST.toISOString())
      .order('completed_date', { ascending: false });

    // Items for completed orders
    const { data: allItems } = await supabase
      .from('order_items')
      .select('id, name, code, quantity, progress_stage, stock_status, order_id');

    // Board state
    const { data: boardOrders } = await supabase
      .from('orders')
      .select('id, order_number, status, urgency, total_amount, company_id, companies(name)')
      .neq('status', 'delivered')
      .order('created_at', { ascending: false });

    // Today's activity
    const { data: todayActivity } = await supabase
      .from('order_activity_log')
      .select('id, title, description, activity_type, order_id, created_at')
      .gte('created_at', startSAST.toISOString())
      .lt('created_at', endSAST.toISOString())
      .order('created_at', { ascending: false })
      .limit(30);

    const completed = completedToday || [];
    const active = boardOrders || [];
    const itemsList = allItems || [];
    const activities = todayActivity || [];

    const todayRevenue = completed.reduce((sum, o) => sum + (Number(o.total_amount) || 0), 0);
    const todayStr = now.toLocaleDateString('en-ZA', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

    const boardCounts = {
      ordered: active.filter(o => o.status === 'ordered').length,
      inStock: active.filter(o => o.status === 'in-stock').length,
      inProgress: active.filter(o => o.status === 'in-progress').length,
      ready: active.filter(o => o.status === 'ready').length,
    };

    // ── HTML helpers ──

    const statBox = (label: string, value: string, color: string) =>
      `<td style="padding:12px 8px;text-align:center;">
        <div style="font-size:22px;font-weight:800;color:${color};line-height:1;">${value}</div>
        <div style="font-size:10px;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;margin-top:4px;">${label}</div>
      </td>`;

    const completedCard = (order: any) => {
      const company = (order.companies as any)?.name || 'Unknown';
      const orderItems = itemsList.filter(i => i.order_id === order.id);
      const amount = order.total_amount ? `R${Number(order.total_amount).toLocaleString()}` : '—';
      return `
        <div style="border:1px solid #d1fae5;border-radius:8px;padding:14px 16px;margin-bottom:10px;background:#f0fdf4;">
          <table width="100%" cellpadding="0" cellspacing="0"><tr>
            <td><span style="font-weight:700;font-size:14px;color:#111827;">${order.order_number}</span></td>
            <td style="text-align:right;font-weight:700;font-size:14px;color:#16a34a;">${amount}</td>
          </tr></table>
          <div style="font-size:13px;color:#6b7280;margin-top:2px;">${company}</div>
          ${orderItems.length > 0 ? `
            <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:8px;border-collapse:collapse;">
              <tr style="background:#ecfdf5;">
                <td style="padding:4px 8px;font-size:11px;font-weight:600;color:#6b7280;border-bottom:1px solid #d1fae5;">Item</td>
                <td style="padding:4px 8px;font-size:11px;font-weight:600;color:#6b7280;border-bottom:1px solid #d1fae5;text-align:center;">Qty</td>
              </tr>
              ${orderItems.map(i => `<tr>
                <td style="padding:4px 8px;font-size:12px;color:#374151;border-bottom:1px solid #ecfdf5;">${i.name}${i.code ? ` <span style="color:#9ca3af;">${i.code}</span>` : ''}</td>
                <td style="padding:4px 8px;font-size:12px;color:#374151;border-bottom:1px solid #ecfdf5;text-align:center;">${i.quantity}</td>
              </tr>`).join('')}
            </table>` : ''}
        </div>`;
    };

    const activityFeed = () => {
      if (activities.length === 0) return '<p style="color:#9ca3af;font-size:12px;font-style:italic;">No movements recorded today.</p>';
      return `<table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
        ${activities.slice(0, 20).map(a => {
          const time = new Date(a.created_at).toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' });
          return `<tr style="border-bottom:1px solid #f3f4f6;">
            <td style="padding:6px 8px 6px 0;color:#9ca3af;font-size:11px;width:45px;vertical-align:top;">${time}</td>
            <td style="padding:6px 0;font-size:12px;"><span style="font-weight:600;color:#111827;">${a.title}</span>${a.description ? `<br/><span style="color:#6b7280;font-size:11px;">${a.description}</span>` : ''}</td>
          </tr>`;
        }).join('')}
      </table>`;
    };

    const sectionHeader = (title: string, count: number, color: string) => `
      <div style="margin-top:28px;margin-bottom:12px;padding-bottom:8px;border-bottom:2px solid ${color};">
        <table width="100%" cellpadding="0" cellspacing="0"><tr>
          <td><span style="font-size:15px;font-weight:700;color:${color};">${title}</span></td>
          <td style="text-align:right;"><span style="background:${color};color:#fff;font-size:11px;font-weight:700;padding:2px 10px;border-radius:99px;">${count}</span></td>
        </tr></table>
      </div>`;

    const emailHtml = `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
    <body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
      <div style="max-width:600px;margin:0 auto;background:#ffffff;">

        <!-- Header -->
        <div style="background:#111827;padding:24px;">
          <p style="color:#4b5563;font-size:11px;text-transform:uppercase;letter-spacing:2px;margin:0 0 4px;">Aleph Engineering & Supplies</p>
          <h1 style="color:#ffffff;margin:0;font-size:18px;font-weight:700;">End of Day Summary</h1>
          <p style="color:#6b7280;margin:4px 0 0;font-size:12px;">${todayStr}</p>
        </div>

        <!-- Stats -->
        <div style="background:#f9fafb;border-bottom:1px solid #e5e7eb;padding:4px 0;">
          <table width="100%" cellpadding="0" cellspacing="0"><tr>
            ${statBox('Completed', String(completed.length), '#16a34a')}
            <td style="width:1px;background:#e5e7eb;"></td>
            ${statBox('Revenue', `R${todayRevenue.toLocaleString()}`, '#16a34a')}
            <td style="width:1px;background:#e5e7eb;"></td>
            ${statBox('Still Active', String(active.length), '#111827')}
            <td style="width:1px;background:#e5e7eb;"></td>
            ${statBox('Movements', String(activities.length), '#2563eb')}
          </tr></table>
        </div>

        <div style="padding:0 24px 24px;">

          <!-- Completed Today -->
          ${sectionHeader('Completed Today', completed.length, '#16a34a')}
          ${completed.length > 0
            ? completed.map(o => completedCard(o)).join('')
            : '<p style="color:#9ca3af;font-size:13px;font-style:italic;">No orders completed today.</p>'}

          <!-- End of Day Board -->
          <div style="margin-top:28px;margin-bottom:12px;padding-bottom:8px;border-bottom:2px solid #111827;">
            <span style="font-size:15px;font-weight:700;color:#111827;">End of Day Board</span>
          </div>
          <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
            <tr style="background:#f9fafb;">
              <td style="padding:8px 12px;font-size:12px;font-weight:600;color:#6b7280;border-bottom:1px solid #e5e7eb;">Column</td>
              <td style="padding:8px 12px;font-size:12px;font-weight:600;color:#6b7280;border-bottom:1px solid #e5e7eb;text-align:right;">Orders</td>
            </tr>
            <tr><td style="padding:8px 12px;font-size:13px;color:#374151;border-bottom:1px solid #f3f4f6;">Awaiting Stock</td><td style="padding:8px 12px;font-size:13px;font-weight:700;color:#dc2626;text-align:right;border-bottom:1px solid #f3f4f6;">${boardCounts.ordered}</td></tr>
            <tr><td style="padding:8px 12px;font-size:13px;color:#374151;border-bottom:1px solid #f3f4f6;">In Stock</td><td style="padding:8px 12px;font-size:13px;font-weight:700;color:#2563eb;text-align:right;border-bottom:1px solid #f3f4f6;">${boardCounts.inStock}</td></tr>
            <tr><td style="padding:8px 12px;font-size:13px;color:#374151;border-bottom:1px solid #f3f4f6;">In Progress</td><td style="padding:8px 12px;font-size:13px;font-weight:700;color:#7c3aed;text-align:right;border-bottom:1px solid #f3f4f6;">${boardCounts.inProgress}</td></tr>
            <tr><td style="padding:8px 12px;font-size:13px;color:#374151;">Ready</td><td style="padding:8px 12px;font-size:13px;font-weight:700;color:#16a34a;text-align:right;">${boardCounts.ready}</td></tr>
          </table>

          <!-- Activity Feed -->
          ${activities.length > 0 ? `
            ${sectionHeader("Today's Activity", activities.length, '#6b7280')}
            ${activityFeed()}
          ` : ''}

        </div>

        <!-- Footer -->
        <div style="background:#f9fafb;padding:14px 24px;text-align:center;border-top:1px solid #e5e7eb;">
          <p style="font-size:11px;color:#9ca3af;margin:0;">Automated report · Aleph Engineering & Supplies</p>
          <p style="font-size:11px;margin:4px 0 0;"><a href="https://aleph-order-tracker.lovable.app/settings" style="color:#6b7280;">Manage preferences</a></p>
        </div>
      </div>
    </body></html>`;

    const pdfContent = buildPdfBase64({
      date: todayStr, completed, boardCounts, activities, todayRevenue, totalActive: active.length, itemsList,
    });

    const pdfFilename = `afternoon-report-${new Date().toISOString().split('T')[0]}.pdf`;
    let sent = 0, failed = 0;
    for (const recipient of recipients) {
      if (!recipient.email) continue;
      try {
        await sendMailgun(mailgunDomain, mailgunApiKey, recipient.email, `End of Day Summary — ${todayStr}`, emailHtml, pdfContent, pdfFilename);
        sent++; console.log(`Sent to ${recipient.email}`);
      } catch (err) { console.error(`Error ${recipient.email}:`, err); failed++; }
    }

    return new Response(JSON.stringify({ sent, failed, recipients: recipients.length }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Afternoon report error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});

function buildPdfBase64(data: any): string {
  const { date, completed, boardCounts, activities, todayRevenue, totalActive, itemsList } = data;
  const L: string[] = [];
  const line = '='.repeat(62);
  const thin = '-'.repeat(62);

  L.push('');
  L.push('  ALEPH ENGINEERING & SUPPLIES');
  L.push('  End of Day Summary');
  L.push(`  ${date}`);
  L.push('');
  L.push(line);
  L.push('');
  L.push(`  Completed: ${completed.length}   Revenue: R${todayRevenue.toLocaleString()}   Active: ${totalActive}`);
  L.push('');
  L.push(line);

  L.push('');
  L.push(`  COMPLETED TODAY (${completed.length})`);
  L.push(thin);
  if (completed.length === 0) {
    L.push('  No orders completed today.');
  } else {
    completed.forEach((o: any) => {
      const company = (o.companies as any)?.name || 'Unknown';
      const oi = itemsList.filter((i: any) => i.order_id === o.id);
      L.push('');
      L.push(`  ${o.order_number}  |  ${company}  |  R${Number(o.total_amount || 0).toLocaleString()}`);
      if (oi.length > 0) {
        L.push('  +------------------------------------------+------+');
        L.push('  | Item                                     | Qty  |');
        L.push('  +------------------------------------------+------+');
        oi.forEach((i: any) => {
          const name = `${i.name}${i.code ? ` (${i.code})` : ''}`.substring(0, 40).padEnd(40);
          const qty = String(i.quantity).padEnd(4);
          L.push(`  | ${name} | ${qty} |`);
        });
        L.push('  +------------------------------------------+------+');
      }
    });
  }

  L.push('');
  L.push(line);
  L.push('');
  L.push('  END OF DAY BOARD');
  L.push(thin);
  L.push(`  Awaiting Stock:  ${boardCounts.ordered}`);
  L.push(`  In Stock:        ${boardCounts.inStock}`);
  L.push(`  In Progress:     ${boardCounts.inProgress}`);
  L.push(`  Ready:           ${boardCounts.ready}`);

  if (activities.length > 0) {
    L.push('');
    L.push(line);
    L.push('');
    L.push(`  TODAY'S ACTIVITY (${activities.length})`);
    L.push(thin);
    activities.slice(0, 20).forEach((a: any) => {
      const time = new Date(a.created_at).toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' });
      L.push(`  ${time}  ${a.title}${a.description ? ` - ${a.description}` : ''}`);
    });
  }

  L.push('');
  L.push(line);
  L.push('  Generated by Aleph Order Management System');

  const text = L.join('\n');
  const safe = text.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)').replace(/[^\x20-\x7E\n]/g, '');
  const tl = safe.split('\n');
  let s = 'BT\n/F1 8 Tf\n'; let y = 760;
  for (const l of tl) { if (y < 40) { s += `1 0 0 1 28 ${y} Tm\n(... continued on next page) Tj\n`; break; } s += `1 0 0 1 28 ${y} Tm\n(${l}) Tj\n`; y -= 12; }
  s += 'ET';
  const p = ['%PDF-1.4','1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj','2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj',
    `3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>endobj`,
    `4 0 obj<</Length ${s.length}>>\nstream\n${s}\nendstream\nendobj`,'5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Courier>>endobj'];
  const xr = p.join('\n').length + 1;
  p.push('xref','0 6','0000000000 65535 f ','0000000009 00000 n ','0000000058 00000 n ','0000000115 00000 n ','0000000300 00000 n ','0000000500 00000 n ',
    'trailer<</Size 6/Root 1 0 R>>',`startxref\n${xr}`,'%%EOF');
  return base64Encode(new TextEncoder().encode(p.join('\n')));
}
