
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

    const today = new Date();
    const startOfDay = new Date(today);
    startOfDay.setHours(0, 0, 0, 0);

    const { data: completedToday } = await supabase
      .from('orders')
      .select('id, order_number, status, total_amount, completed_date, company_id, companies(name), description')
      .eq('status', 'completed')
      .gte('completed_date', startOfDay.toISOString())
      .order('completed_date', { ascending: false });

    const { data: allActiveOrders } = await supabase
      .from('orders')
      .select('id, order_number, status, urgency, total_amount, company_id, companies(name)')
      .not('status', 'eq', 'completed')
      .order('created_at', { ascending: false });

    const { data: allItems } = await supabase
      .from('order_items')
      .select('id, name, code, quantity, progress_stage, order_id');

    const activeOrders = allActiveOrders || [];
    const itemsList = allItems || [];
    const completedTodayList = completedToday || [];

    const awaitingDeliveryOrders = activeOrders.filter(o => {
      const oi = itemsList.filter(i => i.order_id === o.id);
      return oi.some(i => i.progress_stage === 'ready-for-delivery');
    });

    const todayRevenue = completedTodayList.reduce((sum, o) => sum + (Number(o.total_amount) || 0), 0);
    const totalActiveValue = activeOrders.reduce((sum, o) => sum + (Number(o.total_amount) || 0), 0);
    const urgentOrders = activeOrders.filter(o => o.urgency === 'urgent' || o.urgency === 'high');

    const todayStr = today.toLocaleDateString('en-ZA', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

    // Helper: order card with items
    const buildOrderCard = (order: any) => {
      const companyName = (order.companies as any)?.name || 'Unknown';
      const orderItems = itemsList.filter(i => i.order_id === order.id);
      return `
        <div style="display: flex; justify-content: space-between; align-items: center; padding: 10px 0; border-bottom: 1px solid #f3f4f6;">
          <div>
            <span style="font-weight: 600; color: #111827; font-size: 14px;">${order.order_number}</span>
            <span style="color: #6b7280; font-size: 13px; margin-left: 6px;">— ${companyName}</span>
            <span style="color: #9ca3af; font-size: 12px; margin-left: 6px;">(${orderItems.length} item${orderItems.length !== 1 ? 's' : ''})</span>
          </div>
          <span style="font-weight: 600; color: #111827; font-size: 13px;">${order.total_amount ? `R${Number(order.total_amount).toLocaleString()}` : '—'}</span>
        </div>`;
    };

    const buildCompactList = (orderList: any[]) => {
      if (orderList.length === 0) return '<p style="color: #9ca3af; font-size: 13px; font-style: italic; margin: 8px 0;">None at this time.</p>';
      return orderList.map(o => buildOrderCard(o)).join('');
    };

    const sectionHeading = (icon: string, title: string, count: number, color: string) => `
      <div style="margin-top: 28px; margin-bottom: 12px; display: flex; align-items: center; gap: 8px; border-bottom: 2px solid ${color}20; padding-bottom: 10px;">
        <span style="font-size: 18px;">${icon}</span>
        <h2 style="margin: 0; font-size: 16px; font-weight: 700; color: ${color};">${title}</h2>
        <span style="background: ${color}15; color: ${color}; font-size: 12px; font-weight: 700; padding: 2px 8px; border-radius: 99px; margin-left: auto;">${count}</span>
      </div>`;

    const emailHtml = `
    <!DOCTYPE html>
    <html>
    <head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
    <body style="margin: 0; padding: 0; background: #f3f4f6; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
      <div style="max-width: 640px; margin: 0 auto; background: #ffffff;">
        
        <!-- Header -->
        <div style="background: #111827; padding: 32px 24px; text-align: center;">
          <p style="color: #9ca3af; font-size: 11px; text-transform: uppercase; letter-spacing: 2px; margin: 0 0 4px;">Aleph Engineering & Supplies</p>
          <h1 style="color: #ffffff; margin: 0; font-size: 22px; font-weight: 700;">Afternoon Summary</h1>
          <p style="color: #6b7280; margin: 8px 0 0; font-size: 13px;">${todayStr}</p>
        </div>

        <!-- Summary Bar -->
        <div style="background: #f9fafb; padding: 16px 24px; border-bottom: 1px solid #e5e7eb;">
          <table width="100%" cellpadding="0" cellspacing="0" style="text-align: center;">
            <tr>
              <td style="padding: 8px;">
                <div style="font-size: 24px; font-weight: 800; color: #16a34a;">${completedTodayList.length}</div>
                <div style="font-size: 10px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.5px;">Completed</div>
              </td>
              <td style="padding: 8px; border-left: 1px solid #e5e7eb;">
                <div style="font-size: 24px; font-weight: 800; color: #2563eb;">${awaitingDeliveryOrders.length}</div>
                <div style="font-size: 10px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.5px;">Awaiting Delivery</div>
              </td>
              <td style="padding: 8px; border-left: 1px solid #e5e7eb;">
                <div style="font-size: 24px; font-weight: 800; color: #16a34a;">R${todayRevenue.toLocaleString()}</div>
                <div style="font-size: 10px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.5px;">Today's Revenue</div>
              </td>
              <td style="padding: 8px; border-left: 1px solid #e5e7eb;">
                <div style="font-size: 24px; font-weight: 800; color: #dc2626;">${urgentOrders.length}</div>
                <div style="font-size: 10px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.5px;">Urgent Active</div>
              </td>
            </tr>
          </table>
        </div>

        <div style="padding: 0 24px 24px;">

          <!-- COMPLETED TODAY -->
          ${sectionHeading('✅', 'Completed Today', completedTodayList.length, '#16a34a')}
          ${buildCompactList(completedTodayList)}

          <!-- AWAITING DELIVERY -->
          ${sectionHeading('🚚', 'Awaiting Delivery', awaitingDeliveryOrders.length, '#2563eb')}
          ${buildCompactList(awaitingDeliveryOrders)}

          <!-- URGENT STILL ACTIVE -->
          ${urgentOrders.length > 0 ? `
            ${sectionHeading('🚨', 'Urgent — Still Active', urgentOrders.length, '#dc2626')}
            ${buildCompactList(urgentOrders)}
          ` : ''}

          <!-- End-of-Day Stats -->
          <div style="margin-top: 28px; background: #f9fafb; border-radius: 8px; padding: 20px; border: 1px solid #e5e7eb;">
            <h3 style="margin: 0 0 12px; font-size: 14px; font-weight: 700; color: #111827;">📊 End-of-Day Overview</h3>
            <table style="width: 100%; font-size: 13px;">
              <tr><td style="padding: 6px 0; color: #6b7280;">Total Active Orders</td><td style="text-align: right; font-weight: 600; color: #111827;">${activeOrders.length}</td></tr>
              <tr><td style="padding: 6px 0; color: #6b7280;">Total Active Value</td><td style="text-align: right; font-weight: 600; color: #111827;">R${totalActiveValue.toLocaleString()}</td></tr>
              <tr style="border-top: 1px solid #e5e7eb;"><td style="padding: 6px 0; color: #6b7280;">Completed Today</td><td style="text-align: right; font-weight: 600; color: #16a34a;">${completedTodayList.length}</td></tr>
              <tr><td style="padding: 6px 0; color: #6b7280;">Today's Revenue</td><td style="text-align: right; font-weight: 600; color: #16a34a;">R${todayRevenue.toLocaleString()}</td></tr>
            </table>
          </div>
        </div>

        <!-- Footer -->
        <div style="background: #f9fafb; padding: 20px 24px; text-align: center; border-top: 1px solid #e5e7eb;">
          <p style="font-size: 11px; color: #9ca3af; margin: 0;">Automated report · Aleph Engineering & Supplies</p>
          <p style="font-size: 11px; color: #9ca3af; margin: 4px 0 0;">
            <a href="https://aleph-order-tracker.lovable.app/settings" style="color: #6b7280; text-decoration: underline;">Manage report preferences</a>
          </p>
        </div>
      </div>
    </body>
    </html>`;

    const pdfContent = buildPdfBase64({
      date: todayStr,
      completedToday: completedTodayList,
      awaitingDelivery: awaitingDeliveryOrders,
      urgentOrders,
      todayRevenue,
      totalActive: activeOrders.length,
      totalActiveValue,
      itemsList,
    });

    let sent = 0;
    let failed = 0;

    for (const recipient of recipients) {
      if (!recipient.email) continue;
      try {
        const { error: sendError } = await resend.emails.send({
          from: 'Aleph Order System <onboarding@resend.dev>',
          to: [recipient.email],
          subject: `Afternoon Summary — ${todayStr}`,
          html: emailHtml,
          attachments: [{
            content: pdfContent,
            filename: `afternoon-report-${new Date().toISOString().split('T')[0]}.pdf`,
          }]
        });

        if (!sendError) {
          sent++;
          console.log(`✅ Afternoon report sent to ${recipient.email}`);
        } else {
          console.error(`❌ Failed to send to ${recipient.email}:`, JSON.stringify(sendError));
          failed++;
        }
      } catch (err) {
        console.error(`❌ Error sending to ${recipient.email}:`, err);
        failed++;
      }
    }

    console.log(`=== Afternoon Report Complete: ${sent} sent, ${failed} failed ===`);
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
  const { date, completedToday, awaitingDelivery, urgentOrders, todayRevenue, totalActive, totalActiveValue, itemsList } = data;
  
  const lines: string[] = [];
  const divider = '────────────────────────────────────────────────────────────';
  
  lines.push('');
  lines.push('    ALEPH ENGINEERING & SUPPLIES');
  lines.push('    Afternoon Summary Report');
  lines.push(`    ${date}`);
  lines.push('');
  lines.push(divider);
  lines.push('');
  lines.push('    SUMMARY');
  lines.push(`    Completed Today: ${completedToday.length}    |    Awaiting Delivery: ${awaitingDelivery.length}`);
  lines.push(`    Today Revenue: R${todayRevenue.toLocaleString()}    |    Total Active: ${totalActive}    |    Active Value: R${totalActiveValue.toLocaleString()}`);
  lines.push('');
  lines.push(divider);

  lines.push('');
  lines.push(`    COMPLETED TODAY  (${completedToday.length})`);
  lines.push('');
  if (completedToday.length === 0) {
    lines.push('    No orders completed today.');
  } else {
    completedToday.forEach((o: any) => {
      const companyName = (o.companies as any)?.name || 'Unknown';
      const orderItems = itemsList.filter((i: any) => i.order_id === o.id);
      lines.push(`    ${o.order_number}  -  ${companyName}  (${orderItems.length} items)  R${Number(o.total_amount || 0).toLocaleString()}`);
    });
  }

  lines.push('');
  lines.push(divider);
  lines.push('');
  lines.push(`    AWAITING DELIVERY  (${awaitingDelivery.length})`);
  lines.push('');
  if (awaitingDelivery.length === 0) {
    lines.push('    None at this time.');
  } else {
    awaitingDelivery.forEach((o: any) => {
      const companyName = (o.companies as any)?.name || 'Unknown';
      lines.push(`    ${o.order_number}  -  ${companyName}  R${Number(o.total_amount || 0).toLocaleString()}`);
    });
  }

  if (urgentOrders.length > 0) {
    lines.push('');
    lines.push(divider);
    lines.push('');
    lines.push(`    URGENT - STILL ACTIVE  (${urgentOrders.length})`);
    lines.push('');
    urgentOrders.forEach((o: any) => {
      const companyName = (o.companies as any)?.name || 'Unknown';
      lines.push(`    ${o.order_number}  -  ${companyName}  [${(o.urgency || '').toUpperCase()}]`);
    });
  }

  lines.push('');
  lines.push(divider);
  lines.push('');
  lines.push('    Generated automatically by Aleph Order Management System');

  const textContent = lines.join('\n');
  const safeText = textContent.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)').replace(/[^\x20-\x7E\n]/g, '');
  const textLines = safeText.split('\n');
  
  let stream = 'BT\n/F1 9 Tf\n';
  let y = 760;
  for (const line of textLines) {
    if (y < 40) {
      stream += `1 0 0 1 30 ${y} Tm\n(... report continues) Tj\n`;
      break;
    }
    stream += `1 0 0 1 30 ${y} Tm\n(${line}) Tj\n`;
    y -= 13;
  }
  stream += 'ET';
  
  const pdfLines = [
    '%PDF-1.4',
    '1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj',
    '2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj',
    `3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>endobj`,
    `4 0 obj<</Length ${stream.length}>>\nstream\n${stream}\nendstream\nendobj`,
    '5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Courier>>endobj',
  ];
  
  const xrefOffset = pdfLines.join('\n').length + 1;
  pdfLines.push('xref', '0 6',
    '0000000000 65535 f ',
    '0000000009 00000 n ',
    '0000000058 00000 n ',
    '0000000115 00000 n ',
    '0000000300 00000 n ',
    '0000000500 00000 n ',
    'trailer<</Size 6/Root 1 0 R>>',
    `startxref\n${xrefOffset}`,
    '%%EOF'
  );
  
  const pdfString = pdfLines.join('\n');
  return base64Encode(new TextEncoder().encode(pdfString));
}
