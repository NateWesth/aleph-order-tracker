
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
    console.log('=== Daily Morning Report Started ===');
    
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
      .eq('daily_morning_report', true);

    if (recipientsErr || !recipients || recipients.length === 0) {
      console.log('No recipients opted in for morning report');
      return new Response(JSON.stringify({ message: 'No recipients', sent: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    console.log(`Found ${recipients.length} recipients for morning report`);

    const { data: orders } = await supabase
      .from('orders')
      .select('id, order_number, status, urgency, description, total_amount, created_at, company_id, companies(name)')
      .not('status', 'eq', 'completed')
      .order('created_at', { ascending: false });

    const { data: allItems } = await supabase
      .from('order_items')
      .select('id, name, code, quantity, progress_stage, stock_status, order_id');

    const { data: allPOs } = await supabase
      .from('order_purchase_orders')
      .select('order_id, purchase_order_number, suppliers(name)');

    const activeOrders = orders || [];
    const items = allItems || [];
    const pos = allPOs || [];

    // Categorize
    const awaitingStockOrders = activeOrders.filter(o => {
      const oi = items.filter(i => i.order_id === o.id);
      return oi.some(i => i.progress_stage === 'awaiting-stock');
    });
    const inStockOrders = activeOrders.filter(o => {
      const oi = items.filter(i => i.order_id === o.id);
      return oi.length > 0 && oi.every(i => i.progress_stage === 'in-stock') && !awaitingStockOrders.includes(o);
    });
    const readyForDeliveryOrders = activeOrders.filter(o => {
      const oi = items.filter(i => i.order_id === o.id);
      return oi.some(i => i.progress_stage === 'ready-for-delivery');
    });
    const pendingOrders = activeOrders.filter(o => o.status === 'pending');
    const processingOrders = activeOrders.filter(o => o.status === 'processing');

    const today = new Date().toLocaleDateString('en-ZA', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

    // Helper: build an order card with item bullet list
    const buildOrderCard = (order: any, filterStage?: string) => {
      const companyName = (order.companies as any)?.name || 'Unknown';
      const orderItems = filterStage
        ? items.filter(i => i.order_id === order.id && i.progress_stage === filterStage)
        : items.filter(i => i.order_id === order.id);
      const orderPOs = pos.filter(p => p.order_id === order.id);
      const urgencyColor = order.urgency === 'urgent' ? '#dc2626' : order.urgency === 'high' ? '#ea580c' : '#6b7280';
      const urgencyBg = order.urgency === 'urgent' ? '#fef2f2' : order.urgency === 'high' ? '#fff7ed' : '#f3f4f6';

      return `
        <div style="background: #ffffff; border: 1px solid #e5e7eb; border-radius: 8px; padding: 16px; margin-bottom: 12px;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
            <div>
              <span style="font-weight: 700; font-size: 15px; color: #111827;">${order.order_number}</span>
              <span style="color: #6b7280; font-size: 13px; margin-left: 8px;">— ${companyName}</span>
            </div>
            <span style="background: ${urgencyBg}; color: ${urgencyColor}; padding: 3px 10px; border-radius: 99px; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">${order.urgency || 'normal'}</span>
          </div>
          ${orderPOs.length > 0 ? `<div style="font-size: 12px; color: #9ca3af; margin-bottom: 8px;">PO: ${orderPOs.map(p => `${p.purchase_order_number} (${(p.suppliers as any)?.name || '—'})`).join(', ')}</div>` : ''}
          ${orderItems.length > 0 ? `
            <ul style="margin: 0; padding: 0 0 0 18px; list-style-type: disc;">
              ${orderItems.map(i => `<li style="color: #374151; font-size: 13px; padding: 2px 0;">${i.name}${i.code ? ` <span style="color: #9ca3af;">(${i.code})</span>` : ''} <span style="color: #6b7280;">× ${i.quantity}</span></li>`).join('')}
            </ul>` : '<p style="color: #9ca3af; font-size: 13px; margin: 0;">No items</p>'}
        </div>`;
    };

    // Helper: build a compact list for secondary sections
    const buildCompactList = (orderList: any[]) => {
      if (orderList.length === 0) return '<p style="color: #9ca3af; font-size: 13px; font-style: italic; margin: 8px 0;">None at this time.</p>';
      return orderList.map(o => {
        const companyName = (o.companies as any)?.name || 'Unknown';
        const orderItems = items.filter(i => i.order_id === o.id);
        const urgencyColor = o.urgency === 'urgent' ? '#dc2626' : o.urgency === 'high' ? '#ea580c' : '#6b7280';
        return `
          <div style="display: flex; justify-content: space-between; align-items: center; padding: 10px 0; border-bottom: 1px solid #f3f4f6;">
            <div>
              <span style="font-weight: 600; color: #111827; font-size: 14px;">${o.order_number}</span>
              <span style="color: #6b7280; font-size: 13px; margin-left: 6px;">— ${companyName}</span>
              <span style="color: #9ca3af; font-size: 12px; margin-left: 6px;">(${orderItems.length} item${orderItems.length !== 1 ? 's' : ''})</span>
            </div>
            <span style="color: ${urgencyColor}; font-size: 11px; font-weight: 600; text-transform: uppercase;">${o.urgency || 'normal'}</span>
          </div>`;
      }).join('');
    };

    // Section heading helper
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
          <h1 style="color: #ffffff; margin: 0; font-size: 22px; font-weight: 700;">Morning Progress Report</h1>
          <p style="color: #6b7280; margin: 8px 0 0; font-size: 13px;">${today}</p>
        </div>

        <!-- Summary Bar -->
        <div style="background: #f9fafb; padding: 16px 24px; border-bottom: 1px solid #e5e7eb;">
          <table width="100%" cellpadding="0" cellspacing="0" style="text-align: center;">
            <tr>
              <td style="padding: 8px;">
                <div style="font-size: 24px; font-weight: 800; color: #dc2626;">${awaitingStockOrders.length}</div>
                <div style="font-size: 10px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.5px;">Awaiting Stock</div>
              </td>
              <td style="padding: 8px; border-left: 1px solid #e5e7eb;">
                <div style="font-size: 24px; font-weight: 800; color: #2563eb;">${inStockOrders.length}</div>
                <div style="font-size: 10px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.5px;">In Stock</div>
              </td>
              <td style="padding: 8px; border-left: 1px solid #e5e7eb;">
                <div style="font-size: 24px; font-weight: 800; color: #16a34a;">${readyForDeliveryOrders.length}</div>
                <div style="font-size: 10px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.5px;">Ready to Ship</div>
              </td>
              <td style="padding: 8px; border-left: 1px solid #e5e7eb;">
                <div style="font-size: 24px; font-weight: 800; color: #111827;">${activeOrders.length}</div>
                <div style="font-size: 10px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.5px;">Total Active</div>
              </td>
            </tr>
          </table>
        </div>

        <div style="padding: 0 24px 24px;">

          <!-- AWAITING STOCK — Primary focus -->
          ${sectionHeading('⏳', 'Awaiting Stock', awaitingStockOrders.length, '#dc2626')}
          ${awaitingStockOrders.length > 0
            ? awaitingStockOrders.map(o => buildOrderCard(o, 'awaiting-stock')).join('')
            : '<p style="color: #9ca3af; font-size: 13px; font-style: italic;">All items are in stock — great work! 🎉</p>'}

          <!-- IN STOCK -->
          ${sectionHeading('📦', 'In Stock', inStockOrders.length, '#2563eb')}
          ${buildCompactList(inStockOrders)}

          <!-- READY FOR DELIVERY -->
          ${sectionHeading('🚚', 'Ready for Delivery', readyForDeliveryOrders.length, '#16a34a')}
          ${buildCompactList(readyForDeliveryOrders)}

          <!-- PENDING -->
          ${sectionHeading('🕐', 'Pending', pendingOrders.length, '#ca8a04')}
          ${buildCompactList(pendingOrders)}

          <!-- PROCESSING -->
          ${sectionHeading('⚙️', 'Processing', processingOrders.length, '#7c3aed')}
          ${buildCompactList(processingOrders)}
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

    // PDF content
    const pdfContent = buildPdfBase64({
      date: today,
      awaitingStockOrders,
      inStockOrders,
      readyForDeliveryOrders,
      pendingOrders,
      processingOrders,
      items,
      pos,
      activeOrders,
    });

    let sent = 0;
    let failed = 0;

    for (const recipient of recipients) {
      if (!recipient.email) continue;
      try {
        const { error: sendError } = await resend.emails.send({
          from: 'Aleph Order System <onboarding@resend.dev>',
          to: [recipient.email],
          subject: `Morning Progress Report — ${today}`,
          html: emailHtml,
          attachments: [{
            content: pdfContent,
            filename: `morning-report-${new Date().toISOString().split('T')[0]}.pdf`,
          }]
        });

        if (!sendError) {
          sent++;
          console.log(`✅ Morning report sent to ${recipient.email}`);
        } else {
          console.error(`❌ Failed to send to ${recipient.email}:`, JSON.stringify(sendError));
          failed++;
        }
      } catch (err) {
        console.error(`❌ Error sending to ${recipient.email}:`, err);
        failed++;
      }
    }

    console.log(`=== Morning Report Complete: ${sent} sent, ${failed} failed ===`);
    return new Response(JSON.stringify({ sent, failed, recipients: recipients.length }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Morning report error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});

function buildPdfBase64(data: any): string {
  const { awaitingStockOrders, inStockOrders, readyForDeliveryOrders, pendingOrders, processingOrders, items, pos, date, activeOrders } = data;
  
  const lines: string[] = [];
  const divider = '────────────────────────────────────────────────────────────';
  
  lines.push('');
  lines.push('    ALEPH ENGINEERING & SUPPLIES');
  lines.push('    Morning Progress Report');
  lines.push(`    ${date}`);
  lines.push('');
  lines.push(divider);
  lines.push('');
  lines.push(`    SUMMARY`);
  lines.push(`    Awaiting Stock: ${awaitingStockOrders.length}    |    In Stock: ${inStockOrders.length}    |    Ready to Ship: ${readyForDeliveryOrders.length}    |    Total Active: ${(activeOrders || []).length}`);
  lines.push('');
  lines.push(divider);

  // Awaiting Stock detail
  lines.push('');
  lines.push(`    AWAITING STOCK  (${awaitingStockOrders.length})`);
  lines.push('');
  if (awaitingStockOrders.length === 0) {
    lines.push('    All items are in stock.');
  } else {
    awaitingStockOrders.forEach((o: any) => {
      const companyName = (o.companies as any)?.name || 'Unknown';
      const orderItems = items.filter((i: any) => i.order_id === o.id && i.progress_stage === 'awaiting-stock');
      const orderPOs = pos.filter((p: any) => p.order_id === o.id);
      lines.push(`    ${o.order_number}  -  ${companyName}  [${(o.urgency || 'normal').toUpperCase()}]`);
      if (orderPOs.length > 0) {
        lines.push(`    PO: ${orderPOs.map((p: any) => `${p.purchase_order_number} (${(p.suppliers as any)?.name || '-'})`).join(', ')}`);
      }
      lines.push('    Items:');
      orderItems.forEach((i: any) => {
        lines.push(`      * ${i.name}${i.code ? ` (${i.code})` : ''}  x${i.quantity}`);
      });
      lines.push('');
    });
  }

  lines.push(divider);

  // Helper for compact sections
  const addCompactSection = (title: string, orderList: any[]) => {
    lines.push('');
    lines.push(`    ${title}  (${orderList.length})`);
    lines.push('');
    if (orderList.length === 0) {
      lines.push('    None at this time.');
    } else {
      orderList.forEach((o: any) => {
        const companyName = (o.companies as any)?.name || 'Unknown';
        const orderItems = items.filter((i: any) => i.order_id === o.id);
        lines.push(`    ${o.order_number}  -  ${companyName}  (${orderItems.length} item${orderItems.length !== 1 ? 's' : ''})  [${(o.urgency || 'normal').toUpperCase()}]`);
      });
    }
    lines.push('');
    lines.push(divider);
  };

  addCompactSection('IN STOCK', inStockOrders);
  addCompactSection('READY FOR DELIVERY', readyForDeliveryOrders);
  addCompactSection('PENDING', pendingOrders);
  addCompactSection('PROCESSING', processingOrders);

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
