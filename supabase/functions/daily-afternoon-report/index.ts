
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.8';
import { encode as base64Encode } from "https://deno.land/std@0.190.0/encoding/base64.ts";
import { Resend } from "npm:resend@4.0.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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

    const resendApiKey = Deno.env.get('RESEND_API_KEY');
    if (!resendApiKey) {
      return new Response(JSON.stringify({ error: 'RESEND_API_KEY not configured' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    const resend = new Resend(resendApiKey);

    const { data: recipients, error: recipientsErr } = await supabase
      .from('profiles')
      .select('id, email, full_name')
      .eq('daily_afternoon_report', true);

    if (recipientsErr || !recipients || recipients.length === 0) {
      console.log('No recipients opted in for afternoon report');
      return new Response(JSON.stringify({ message: 'No recipients', sent: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    console.log(`Found ${recipients.length} recipients for afternoon report`);

    // Get today's date range (SAST = UTC+2)
    const now = new Date();
    const startOfDay = new Date(now);
    startOfDay.setUTCHours(0, 0, 0, 0);
    // Adjust for SAST: start of day in SAST is 22:00 UTC previous day
    const startSAST = new Date(startOfDay.getTime() - 2 * 60 * 60 * 1000);
    const endSAST = new Date(startSAST.getTime() + 24 * 60 * 60 * 1000);

    // Orders completed TODAY (moved to delivered/history today)
    const { data: completedToday } = await supabase
      .from('orders')
      .select('id, order_number, status, total_amount, completed_date, company_id, companies(name), description, urgency')
      .eq('status', 'delivered')
      .gte('completed_date', startSAST.toISOString())
      .lt('completed_date', endSAST.toISOString())
      .order('completed_date', { ascending: false });

    // Items completed today (individual item completions)
    const { data: itemsCompletedToday } = await supabase
      .from('order_items')
      .select('id, name, code, quantity, completed_at, order_id')
      .gte('completed_at', startSAST.toISOString())
      .lt('completed_at', endSAST.toISOString());

    // Current board state for movement summary
    const { data: boardOrders } = await supabase
      .from('orders')
      .select('id, order_number, status, urgency, total_amount, company_id, companies(name)')
      .neq('status', 'delivered')
      .order('created_at', { ascending: false });

    const { data: allItems } = await supabase
      .from('order_items')
      .select('id, name, code, quantity, progress_stage, stock_status, order_id');

    // Activity log for today's movements
    const { data: todayActivity } = await supabase
      .from('order_activity_log')
      .select('id, title, description, activity_type, order_id, created_at')
      .gte('created_at', startSAST.toISOString())
      .lt('created_at', endSAST.toISOString())
      .order('created_at', { ascending: false })
      .limit(50);

    const completedList = completedToday || [];
    const active = boardOrders || [];
    const itemsList = allItems || [];
    const activities = todayActivity || [];
    const completedItems = itemsCompletedToday || [];

    const todayRevenue = completedList.reduce((sum, o) => sum + (Number(o.total_amount) || 0), 0);

    // Board counts
    const boardCounts = {
      ordered: active.filter(o => o.status === 'ordered').length,
      inStock: active.filter(o => o.status === 'in-stock').length,
      inProgress: active.filter(o => o.status === 'in-progress').length,
      ready: active.filter(o => o.status === 'ready').length,
    };

    const todayStr = now.toLocaleDateString('en-ZA', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

    // Build completed order cards
    const buildCompletedCard = (order: any) => {
      const companyName = (order.companies as any)?.name || 'Unknown';
      const orderItems = itemsList.filter(i => i.order_id === order.id);
      return `
        <div style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 6px; padding: 14px; margin-bottom: 10px;">
          <table width="100%" cellpadding="0" cellspacing="0"><tr>
            <td><span style="font-weight: 700; font-size: 14px; color: #111827;">${order.order_number}</span> <span style="color: #6b7280; font-size: 13px;">— ${companyName}</span></td>
            <td style="text-align: right; font-weight: 700; color: #16a34a; font-size: 14px;">${order.total_amount ? `R${Number(order.total_amount).toLocaleString()}` : '—'}</td>
          </tr></table>
          ${orderItems.length > 0 ? `<ul style="margin: 8px 0 0; padding: 0 0 0 16px; list-style: disc;">${orderItems.map(i => `<li style="color: #374151; font-size: 12px; padding: 2px 0;">${i.name}${i.code ? ` (${i.code})` : ''} &times; ${i.quantity}</li>`).join('')}</ul>` : ''}
        </div>`;
    };

    // Build activity feed
    const buildActivityFeed = () => {
      if (activities.length === 0) return '<p style="color: #9ca3af; font-size: 13px; font-style: italic; margin: 8px 0;">No activity recorded today.</p>';
      return `<table width="100%" cellpadding="0" cellspacing="0" style="font-size: 12px;">${activities.slice(0, 20).map(a => {
        const time = new Date(a.created_at).toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' });
        return `<tr style="border-bottom: 1px solid #f3f4f6;">
          <td style="padding: 8px 0; color: #9ca3af; width: 50px; vertical-align: top;">${time}</td>
          <td style="padding: 8px 0 8px 8px;"><span style="font-weight: 600; color: #111827;">${a.title}</span>${a.description ? `<br/><span style="color: #6b7280;">${a.description}</span>` : ''}</td>
        </tr>`;
      }).join('')}</table>`;
    };

    const sectionBlock = (icon: string, title: string, count: number, color: string, content: string) => `
      <div style="margin-top: 28px;">
        <table width="100%" cellpadding="0" cellspacing="0" style="border-bottom: 2px solid ${color}; padding-bottom: 8px; margin-bottom: 14px;">
          <tr>
            <td><span style="font-size: 16px; margin-right: 6px;">${icon}</span><span style="font-size: 16px; font-weight: 700; color: ${color};">${title}</span></td>
            <td style="text-align: right;"><span style="background: ${color}; color: #ffffff; font-size: 11px; font-weight: 700; padding: 3px 10px; border-radius: 99px;">${count}</span></td>
          </tr>
        </table>
        ${content}
      </div>`;

    const emailHtml = `
    <!DOCTYPE html>
    <html>
    <head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
    <body style="margin: 0; padding: 0; background: #f3f4f6; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
      <div style="max-width: 600px; margin: 0 auto; background: #ffffff;">
        
        <div style="background: #111827; padding: 28px 24px;">
          <p style="color: #6b7280; font-size: 11px; text-transform: uppercase; letter-spacing: 2px; margin: 0 0 6px;">Aleph Engineering & Supplies</p>
          <h1 style="color: #ffffff; margin: 0; font-size: 20px; font-weight: 700;">Afternoon Summary</h1>
          <p style="color: #6b7280; margin: 6px 0 0; font-size: 13px;">${todayStr}</p>
        </div>

        <!-- Summary -->
        <div style="padding: 16px 24px; background: #f9fafb; border-bottom: 1px solid #e5e7eb;">
          <table width="100%" cellpadding="0" cellspacing="0" style="text-align: center;">
            <tr>
              <td style="padding: 6px;"><div style="font-size: 22px; font-weight: 800; color: #16a34a;">${completedList.length}</div><div style="font-size: 10px; color: #6b7280; text-transform: uppercase;">Completed Today</div></td>
              <td style="padding: 6px; border-left: 1px solid #e5e7eb;"><div style="font-size: 22px; font-weight: 800; color: #16a34a;">R${todayRevenue.toLocaleString()}</div><div style="font-size: 10px; color: #6b7280; text-transform: uppercase;">Revenue</div></td>
              <td style="padding: 6px; border-left: 1px solid #e5e7eb;"><div style="font-size: 22px; font-weight: 800; color: #111827;">${active.length}</div><div style="font-size: 10px; color: #6b7280; text-transform: uppercase;">Still Active</div></td>
              <td style="padding: 6px; border-left: 1px solid #e5e7eb;"><div style="font-size: 22px; font-weight: 800; color: #2563eb;">${activities.length}</div><div style="font-size: 10px; color: #6b7280; text-transform: uppercase;">Movements</div></td>
            </tr>
          </table>
        </div>

        <div style="padding: 0 24px 24px;">

          ${sectionBlock('✅', 'Completed Today', completedList.length, '#16a34a',
            completedList.length > 0
              ? completedList.map(o => buildCompletedCard(o)).join('')
              : '<p style="color: #9ca3af; font-size: 13px; font-style: italic; margin: 8px 0;">No orders completed today.</p>'
          )}

          <!-- Board Snapshot -->
          <div style="margin-top: 28px;">
            <table width="100%" cellpadding="0" cellspacing="0" style="border-bottom: 2px solid #111827; padding-bottom: 8px; margin-bottom: 14px;">
              <tr><td><span style="font-size: 16px; margin-right: 6px;">📋</span><span style="font-size: 16px; font-weight: 700; color: #111827;">Current Board</span></td></tr>
            </table>
            <table width="100%" cellpadding="0" cellspacing="0" style="font-size: 13px;">
              <tr style="border-bottom: 1px solid #f3f4f6;">
                <td style="padding: 10px 0; color: #6b7280;">Awaiting Stock</td>
                <td style="padding: 10px 0; text-align: right; font-weight: 700; color: #dc2626;">${boardCounts.ordered}</td>
              </tr>
              <tr style="border-bottom: 1px solid #f3f4f6;">
                <td style="padding: 10px 0; color: #6b7280;">In Stock</td>
                <td style="padding: 10px 0; text-align: right; font-weight: 700; color: #2563eb;">${boardCounts.inStock}</td>
              </tr>
              <tr style="border-bottom: 1px solid #f3f4f6;">
                <td style="padding: 10px 0; color: #6b7280;">In Progress</td>
                <td style="padding: 10px 0; text-align: right; font-weight: 700; color: #7c3aed;">${boardCounts.inProgress}</td>
              </tr>
              <tr>
                <td style="padding: 10px 0; color: #6b7280;">Ready</td>
                <td style="padding: 10px 0; text-align: right; font-weight: 700; color: #16a34a;">${boardCounts.ready}</td>
              </tr>
            </table>
          </div>

          ${activities.length > 0 ? sectionBlock('🔄', "Today's Activity", activities.length, '#6b7280', buildActivityFeed()) : ''}

        </div>

        <div style="background: #f9fafb; padding: 16px 24px; text-align: center; border-top: 1px solid #e5e7eb;">
          <p style="font-size: 11px; color: #9ca3af; margin: 0;">Automated report · Aleph Engineering & Supplies</p>
          <p style="font-size: 11px; margin: 4px 0 0;"><a href="https://aleph-order-tracker.lovable.app/settings" style="color: #6b7280;">Manage preferences</a></p>
        </div>
      </div>
    </body>
    </html>`;

    const pdfContent = buildPdfBase64({
      date: todayStr,
      completedToday: completedList,
      boardCounts,
      activities,
      todayRevenue,
      totalActive: active.length,
      itemsList,
    });

    let sent = 0, failed = 0;
    for (const recipient of recipients) {
      if (!recipient.email) continue;
      try {
        const { error: sendError } = await resend.emails.send({
          from: 'Aleph Order System <onboarding@resend.dev>',
          to: [recipient.email],
          subject: `Afternoon Summary — ${todayStr}`,
          html: emailHtml,
          attachments: [{ content: pdfContent, filename: `afternoon-report-${new Date().toISOString().split('T')[0]}.pdf` }]
        });
        if (!sendError) { sent++; console.log(`✅ Sent to ${recipient.email}`); }
        else { console.error(`❌ Failed ${recipient.email}:`, JSON.stringify(sendError)); failed++; }
      } catch (err) { console.error(`❌ Error ${recipient.email}:`, err); failed++; }
    }

    console.log(`=== Afternoon Report: ${sent} sent, ${failed} failed ===`);
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
  const { date, completedToday, boardCounts, activities, todayRevenue, totalActive, itemsList } = data;
  const L: string[] = [];
  const div = '─'.repeat(60);
  
  L.push('', '    ALEPH ENGINEERING & SUPPLIES', '    Afternoon Summary Report', `    ${date}`, '', div);
  L.push('', '    SUMMARY');
  L.push(`    Completed Today: ${completedToday.length}  |  Revenue: R${todayRevenue.toLocaleString()}  |  Active Orders: ${totalActive}`);
  L.push('', div);

  L.push('', `    COMPLETED TODAY  (${completedToday.length})`, '');
  if (completedToday.length === 0) {
    L.push('    No orders completed today.');
  } else {
    completedToday.forEach((o: any) => {
      const company = (o.companies as any)?.name || 'Unknown';
      const oi = itemsList.filter((i: any) => i.order_id === o.id);
      L.push(`    ${o.order_number}  |  ${company}  |  R${Number(o.total_amount || 0).toLocaleString()}`);
      if (oi.length > 0) {
        oi.forEach((i: any) => L.push(`      - ${i.name}${i.code ? ` (${i.code})` : ''} x${i.quantity}`));
      }
      L.push('');
    });
  }

  L.push(div, '', '    CURRENT BOARD STATUS', '');
  L.push(`    Awaiting Stock:  ${boardCounts.ordered}`);
  L.push(`    In Stock:        ${boardCounts.inStock}`);
  L.push(`    In Progress:     ${boardCounts.inProgress}`);
  L.push(`    Ready:           ${boardCounts.ready}`);

  if (activities.length > 0) {
    L.push('', div, '', `    TODAY'S ACTIVITY  (${activities.length})`, '');
    activities.slice(0, 20).forEach((a: any) => {
      const time = new Date(a.created_at).toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' });
      L.push(`    ${time}  ${a.title}${a.description ? ` - ${a.description}` : ''}`);
    });
  }

  L.push('', div, '', '    Generated by Aleph Order Management System');

  const text = L.join('\n');
  const safe = text.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)').replace(/[^\x20-\x7E\n]/g, '');
  const tl = safe.split('\n');
  let s = 'BT\n/F1 9 Tf\n'; let y = 760;
  for (const l of tl) { if (y < 40) { s += `1 0 0 1 30 ${y} Tm\n(... continues) Tj\n`; break; } s += `1 0 0 1 30 ${y} Tm\n(${l}) Tj\n`; y -= 13; }
  s += 'ET';
  const p = ['%PDF-1.4','1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj','2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj',
    `3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>endobj`,
    `4 0 obj<</Length ${s.length}>>\nstream\n${s}\nendstream\nendobj`,'5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Courier>>endobj'];
  const xr = p.join('\n').length + 1;
  p.push('xref','0 6','0000000000 65535 f ','0000000009 00000 n ','0000000058 00000 n ','0000000115 00000 n ','0000000300 00000 n ','0000000500 00000 n ',
    'trailer<</Size 6/Root 1 0 R>>',`startxref\n${xr}`,'%%EOF');
  return base64Encode(new TextEncoder().encode(p.join('\n')));
}
