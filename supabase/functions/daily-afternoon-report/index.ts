
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

    // Get users who opted in for afternoon reports
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

    // Fetch completed orders (completed today)
    const { data: completedToday } = await supabase
      .from('orders')
      .select('id, order_number, status, total_amount, completed_date, company_id, companies(name), description')
      .eq('status', 'completed')
      .gte('completed_date', startOfDay.toISOString())
      .order('completed_date', { ascending: false });

    // Fetch all completed orders total
    const { data: allCompleted } = await supabase
      .from('orders')
      .select('id, order_number, total_amount, completed_date, company_id, companies(name)')
      .eq('status', 'completed')
      .order('completed_date', { ascending: false })
      .limit(50);

    // Fetch orders with items ready for delivery
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

    // Orders awaiting delivery (items at ready-for-delivery stage)
    const awaitingDeliveryOrders = activeOrders.filter(o => {
      const orderItems = itemsList.filter(i => i.order_id === o.id);
      return orderItems.some(i => i.progress_stage === 'ready-for-delivery');
    });

    // Orders completed today stats
    const todayRevenue = completedTodayList.reduce((sum, o) => sum + (Number(o.total_amount) || 0), 0);
    const totalActiveValue = activeOrders.reduce((sum, o) => sum + (Number(o.total_amount) || 0), 0);

    // Urgent orders still active
    const urgentOrders = activeOrders.filter(o => o.urgency === 'urgent' || o.urgency === 'high');

    const todayStr = today.toLocaleDateString('en-ZA', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

    const buildRows = (orderList: any[]) => {
      return orderList.map(o => {
        const companyName = (o.companies as any)?.name || 'Unknown';
        const orderItems = itemsList.filter(i => i.order_id === o.id);
        return `
          <tr style="border-bottom: 1px solid #e5e7eb;">
            <td style="padding: 8px; color: #1f2937; font-weight: 500;">${o.order_number}</td>
            <td style="padding: 8px; color: #374151;">${companyName}</td>
            <td style="padding: 8px; color: #374151;">${orderItems.length} items</td>
            <td style="padding: 8px; color: #374151;">${o.total_amount ? `R${Number(o.total_amount).toLocaleString()}` : '—'}</td>
          </tr>`;
      }).join('');
    };

    // Build PDF
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

    const emailHtml = `
    <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 800px; margin: 0 auto; background: #ffffff;">
      <div style="background: linear-gradient(135deg, #7c3aed, #a855f7); padding: 32px; text-align: center;">
        <h1 style="color: #ffffff; margin: 0; font-size: 24px;">🌅 Afternoon Summary Report</h1>
        <p style="color: #e9d5ff; margin: 8px 0 0; font-size: 14px;">${todayStr}</p>
      </div>
      
      <div style="padding: 24px;">
        <!-- Quick Stats -->
        <div style="display: flex; gap: 12px; margin-bottom: 24px;">
          <div style="flex: 1; background: #f0fdf4; border-radius: 8px; padding: 16px; text-align: center;">
            <div style="font-size: 28px; font-weight: 700; color: #16a34a;">${completedTodayList.length}</div>
            <div style="font-size: 12px; color: #166534;">Completed Today</div>
          </div>
          <div style="flex: 1; background: #eff6ff; border-radius: 8px; padding: 16px; text-align: center;">
            <div style="font-size: 28px; font-weight: 700; color: #2563eb;">${awaitingDeliveryOrders.length}</div>
            <div style="font-size: 12px; color: #1e40af;">Awaiting Delivery</div>
          </div>
          <div style="flex: 1; background: #fefce8; border-radius: 8px; padding: 16px; text-align: center;">
            <div style="font-size: 28px; font-weight: 700; color: #ca8a04;">R${todayRevenue.toLocaleString()}</div>
            <div style="font-size: 12px; color: #854d0e;">Today's Revenue</div>
          </div>
          <div style="flex: 1; background: #fef2f2; border-radius: 8px; padding: 16px; text-align: center;">
            <div style="font-size: 28px; font-weight: 700; color: #dc2626;">${urgentOrders.length}</div>
            <div style="font-size: 12px; color: #991b1b;">Urgent Active</div>
          </div>
        </div>

        <!-- Completed Today -->
        <div style="margin-bottom: 32px;">
          <h2 style="color: #16a34a; font-size: 18px; border-bottom: 2px solid #bbf7d0; padding-bottom: 8px;">
            ✅ Orders Completed Today (${completedTodayList.length})
          </h2>
          ${completedTodayList.length > 0 ? `
          <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
            <thead>
              <tr style="background: #f0fdf4;">
                <th style="padding: 10px 8px; text-align: left; color: #166534;">Order #</th>
                <th style="padding: 10px 8px; text-align: left; color: #166534;">Company</th>
                <th style="padding: 10px 8px; text-align: left; color: #166534;">Items</th>
                <th style="padding: 10px 8px; text-align: left; color: #166534;">Amount</th>
              </tr>
            </thead>
            <tbody>${buildRows(completedTodayList)}</tbody>
          </table>` : '<p style="color: #6b7280; font-style: italic;">No orders completed today yet.</p>'}
        </div>

        <!-- Awaiting Delivery -->
        <div style="margin-bottom: 32px;">
          <h2 style="color: #2563eb; font-size: 18px; border-bottom: 2px solid #bfdbfe; padding-bottom: 8px;">
            📦 Awaiting Delivery (${awaitingDeliveryOrders.length})
          </h2>
          ${awaitingDeliveryOrders.length > 0 ? `
          <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
            <thead>
              <tr style="background: #eff6ff;">
                <th style="padding: 10px 8px; text-align: left; color: #1e40af;">Order #</th>
                <th style="padding: 10px 8px; text-align: left; color: #1e40af;">Company</th>
                <th style="padding: 10px 8px; text-align: left; color: #1e40af;">Items</th>
                <th style="padding: 10px 8px; text-align: left; color: #1e40af;">Amount</th>
              </tr>
            </thead>
            <tbody>${buildRows(awaitingDeliveryOrders)}</tbody>
          </table>` : '<p style="color: #6b7280; font-style: italic;">No orders awaiting delivery.</p>'}
        </div>

        <!-- Urgent Orders Still Active -->
        ${urgentOrders.length > 0 ? `
        <div style="margin-bottom: 24px;">
          <h2 style="color: #dc2626; font-size: 16px; border-bottom: 2px solid #fecaca; padding-bottom: 8px;">
            🚨 Urgent Orders Still Active (${urgentOrders.length})
          </h2>
          <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
            <thead>
              <tr style="background: #fef2f2;">
                <th style="padding: 8px; text-align: left;">Order #</th>
                <th style="padding: 8px; text-align: left;">Company</th>
                <th style="padding: 8px; text-align: left;">Items</th>
                <th style="padding: 8px; text-align: left;">Amount</th>
              </tr>
            </thead>
            <tbody>${buildRows(urgentOrders)}</tbody>
          </table>
        </div>` : ''}

        <!-- Daily Summary Stats -->
        <div style="background: #f9fafb; border-radius: 8px; padding: 20px; margin-bottom: 24px;">
          <h3 style="color: #1f2937; margin: 0 0 12px;">📊 Daily Summary</h3>
          <table style="width: 100%; font-size: 14px;">
            <tr><td style="padding: 4px 0; color: #6b7280;">Total Active Orders:</td><td style="font-weight: 600;">${activeOrders.length}</td></tr>
            <tr><td style="padding: 4px 0; color: #6b7280;">Total Active Value:</td><td style="font-weight: 600;">R${totalActiveValue.toLocaleString()}</td></tr>
            <tr><td style="padding: 4px 0; color: #6b7280;">Completed Today:</td><td style="font-weight: 600;">${completedTodayList.length}</td></tr>
            <tr><td style="padding: 4px 0; color: #6b7280;">Today's Revenue:</td><td style="font-weight: 600;">R${todayRevenue.toLocaleString()}</td></tr>
            <tr><td style="padding: 4px 0; color: #6b7280;">Awaiting Delivery:</td><td style="font-weight: 600;">${awaitingDeliveryOrders.length}</td></tr>
            <tr><td style="padding: 4px 0; color: #6b7280;">Urgent Active:</td><td style="font-weight: 600;">${urgentOrders.length}</td></tr>
          </table>
        </div>
      </div>

      <div style="background: #f9fafb; padding: 16px 24px; text-align: center; font-size: 12px; color: #6b7280;">
        <p>This is an automated daily report from Aleph Engineering & Supplies Order Management System.</p>
        <p>You can disable this report in your <a href="https://aleph-order-tracker.lovable.app/settings" style="color: #7c3aed;">notification settings</a>.</p>
      </div>
    </div>`;

    // Send to each recipient
    let sent = 0;
    let failed = 0;

    for (const recipient of recipients) {
      if (!recipient.email) continue;
      try {
        const { error: sendError } = await resend.emails.send({
          from: 'Aleph Order System <noreply@alepheng.co.za>',
          to: [recipient.email],
          subject: `🌅 Afternoon Summary Report — ${todayStr}`,
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
  
  let lines: string[] = [];
  lines.push('ALEPH ENGINEERING & SUPPLIES');
  lines.push('Afternoon Summary Report');
  lines.push(date);
  lines.push('');
  lines.push(`Completed Today: ${completedToday.length}`);
  lines.push(`Awaiting Delivery: ${awaitingDelivery.length}`);
  lines.push(`Today Revenue: R${todayRevenue.toLocaleString()}`);
  lines.push(`Total Active: ${totalActive}`);
  lines.push(`Total Active Value: R${totalActiveValue.toLocaleString()}`);
  lines.push('');
  
  lines.push('=== COMPLETED TODAY ===');
  completedToday.forEach((o: any) => {
    lines.push(`${o.order_number} | ${(o.companies as any)?.name || 'Unknown'} | R${Number(o.total_amount || 0).toLocaleString()}`);
  });
  
  lines.push('');
  lines.push('=== AWAITING DELIVERY ===');
  awaitingDelivery.forEach((o: any) => {
    lines.push(`${o.order_number} | ${(o.companies as any)?.name || 'Unknown'} | R${Number(o.total_amount || 0).toLocaleString()}`);
  });
  
  if (urgentOrders.length > 0) {
    lines.push('');
    lines.push('=== URGENT ORDERS STILL ACTIVE ===');
    urgentOrders.forEach((o: any) => {
      lines.push(`${o.order_number} | ${(o.companies as any)?.name || 'Unknown'} | ${o.urgency}`);
    });
  }

  const textContent = lines.join('\n');
  const safeText = textContent.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
  const textLines = safeText.split('\n');
  
  let stream = 'BT\n/F1 10 Tf\n';
  let y = 780;
  for (const line of textLines) {
    if (y < 40) {
      stream += `1 0 0 1 40 ${y} Tm\n(... continued in full report) Tj\n`;
      break;
    }
    stream += `1 0 0 1 40 ${y} Tm\n(${line}) Tj\n`;
    y -= 14;
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
  const encoder = new TextEncoder();
  return base64Encode(encoder.encode(pdfString));
}
