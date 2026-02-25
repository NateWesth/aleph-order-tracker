
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

    // Fetch active orders (NOT delivered) - these are the board orders
    const { data: orders } = await supabase
      .from('orders')
      .select('id, order_number, status, urgency, description, total_amount, created_at, company_id, companies(name)')
      .neq('status', 'delivered')
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

    // Board columns based on ORDER STATUS (not item progress_stage)
    const awaitingStockOrders = activeOrders.filter(o => o.status === 'ordered');
    const inStockOrders = activeOrders.filter(o => o.status === 'in-stock');
    const inProgressOrders = activeOrders.filter(o => o.status === 'in-progress');
    const readyOrders = activeOrders.filter(o => o.status === 'ready');

    const today = new Date().toLocaleDateString('en-ZA', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

    // For awaiting stock orders, show items grouped by stock status
    const buildAwaitingStockCard = (order: any) => {
      const companyName = (order.companies as any)?.name || 'Unknown';
      const orderItems = items.filter(i => i.order_id === order.id);
      const orderPOs = pos.filter(p => p.order_id === order.id);
      
      // Group items by stock_status
      const awaitingItems = orderItems.filter(i => i.stock_status === 'awaiting');
      const orderedItems = orderItems.filter(i => i.stock_status === 'ordered');
      const receivedItems = orderItems.filter(i => i.stock_status === 'in-stock');
      
      const urgencyColor = order.urgency === 'urgent' ? '#dc2626' : order.urgency === 'high' ? '#ea580c' : '#6b7280';
      const urgencyBg = order.urgency === 'urgent' ? '#fef2f2' : order.urgency === 'high' ? '#fff7ed' : '#f3f4f6';

      const itemLine = (i: any) => `<li style="color: #374151; font-size: 13px; padding: 3px 0; line-height: 1.4;">${i.name}${i.code ? ` <span style="color: #9ca3af;">(${i.code})</span>` : ''} <span style="color: #6b7280;">&times; ${i.quantity}</span></li>`;

      let itemsHtml = '';
      if (awaitingItems.length > 0) {
        itemsHtml += `<div style="margin-top: 8px;"><span style="font-size: 11px; font-weight: 600; color: #dc2626; text-transform: uppercase; letter-spacing: 0.5px;">Not Yet Ordered</span><ul style="margin: 4px 0 0; padding: 0 0 0 16px; list-style: disc;">${awaitingItems.map(itemLine).join('')}</ul></div>`;
      }
      if (orderedItems.length > 0) {
        itemsHtml += `<div style="margin-top: 8px;"><span style="font-size: 11px; font-weight: 600; color: #f59e0b; text-transform: uppercase; letter-spacing: 0.5px;">On Order</span><ul style="margin: 4px 0 0; padding: 0 0 0 16px; list-style: disc;">${orderedItems.map(itemLine).join('')}</ul></div>`;
      }
      if (receivedItems.length > 0) {
        itemsHtml += `<div style="margin-top: 8px;"><span style="font-size: 11px; font-weight: 600; color: #16a34a; text-transform: uppercase; letter-spacing: 0.5px;">Received</span><ul style="margin: 4px 0 0; padding: 0 0 0 16px; list-style: disc;">${receivedItems.map(itemLine).join('')}</ul></div>`;
      }

      return `
        <div style="background: #ffffff; border: 1px solid #e5e7eb; border-left: 4px solid ${urgencyColor}; border-radius: 6px; padding: 16px; margin-bottom: 12px;">
          <table width="100%" cellpadding="0" cellspacing="0"><tr>
            <td><span style="font-weight: 700; font-size: 15px; color: #111827;">${order.order_number}</span></td>
            <td style="text-align: right;"><span style="background: ${urgencyBg}; color: ${urgencyColor}; padding: 3px 10px; border-radius: 99px; font-size: 11px; font-weight: 600; text-transform: uppercase;">${order.urgency || 'normal'}</span></td>
          </tr></table>
          <div style="color: #6b7280; font-size: 13px; margin-top: 4px;">${companyName}</div>
          ${orderPOs.length > 0 ? `<div style="font-size: 12px; color: #9ca3af; margin-top: 4px;">PO: ${orderPOs.map(p => `${p.purchase_order_number} (${(p.suppliers as any)?.name || '-'})`).join(', ')}</div>` : ''}
          ${itemsHtml}
        </div>`;
    };

    // Compact list for other columns
    const buildColumnList = (orderList: any[], emptyMsg: string) => {
      if (orderList.length === 0) return `<p style="color: #9ca3af; font-size: 13px; font-style: italic; margin: 8px 0;">${emptyMsg}</p>`;
      return `<table width="100%" cellpadding="0" cellspacing="0" style="font-size: 13px;">${orderList.map(o => {
        const companyName = (o.companies as any)?.name || 'Unknown';
        const orderItems = items.filter(i => i.order_id === o.id);
        const urgencyColor = o.urgency === 'urgent' ? '#dc2626' : o.urgency === 'high' ? '#ea580c' : '#6b7280';
        return `<tr style="border-bottom: 1px solid #f3f4f6;">
          <td style="padding: 10px 0;"><span style="font-weight: 600; color: #111827;">${o.order_number}</span> <span style="color: #6b7280;">— ${companyName}</span></td>
          <td style="padding: 10px 0; text-align: center; color: #9ca3af; font-size: 12px;">${orderItems.length} item${orderItems.length !== 1 ? 's' : ''}</td>
          <td style="padding: 10px 0; text-align: right;"><span style="color: ${urgencyColor}; font-size: 11px; font-weight: 600; text-transform: uppercase;">${o.urgency || 'normal'}</span></td>
        </tr>`;
      }).join('')}</table>`;
    };

    const sectionBlock = (icon: string, title: string, count: number, color: string, content: string) => `
      <div style="margin-top: 32px;">
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
          <h1 style="color: #ffffff; margin: 0; font-size: 20px; font-weight: 700;">Morning Progress Report</h1>
          <p style="color: #6b7280; margin: 6px 0 0; font-size: 13px;">${today}</p>
        </div>

        <!-- Summary -->
        <div style="padding: 16px 24px; background: #f9fafb; border-bottom: 1px solid #e5e7eb;">
          <table width="100%" cellpadding="0" cellspacing="0" style="text-align: center;">
            <tr>
              <td style="padding: 6px;"><div style="font-size: 22px; font-weight: 800; color: #dc2626;">${awaitingStockOrders.length}</div><div style="font-size: 10px; color: #6b7280; text-transform: uppercase;">Awaiting Stock</div></td>
              <td style="padding: 6px; border-left: 1px solid #e5e7eb;"><div style="font-size: 22px; font-weight: 800; color: #2563eb;">${inStockOrders.length}</div><div style="font-size: 10px; color: #6b7280; text-transform: uppercase;">In Stock</div></td>
              <td style="padding: 6px; border-left: 1px solid #e5e7eb;"><div style="font-size: 22px; font-weight: 800; color: #7c3aed;">${inProgressOrders.length}</div><div style="font-size: 10px; color: #6b7280; text-transform: uppercase;">In Progress</div></td>
              <td style="padding: 6px; border-left: 1px solid #e5e7eb;"><div style="font-size: 22px; font-weight: 800; color: #16a34a;">${readyOrders.length}</div><div style="font-size: 10px; color: #6b7280; text-transform: uppercase;">Ready</div></td>
            </tr>
          </table>
        </div>

        <div style="padding: 0 24px 24px;">
          
          ${sectionBlock('⏳', 'Awaiting Stock', awaitingStockOrders.length, '#dc2626',
            awaitingStockOrders.length > 0
              ? awaitingStockOrders.map(o => buildAwaitingStockCard(o)).join('')
              : '<p style="color: #16a34a; font-size: 13px; margin: 8px 0;">All stock received — nothing pending! ✓</p>'
          )}

          ${sectionBlock('📦', 'In Stock', inStockOrders.length, '#2563eb',
            buildColumnList(inStockOrders, 'No orders in this column.')
          )}

          ${sectionBlock('⚙️', 'In Progress', inProgressOrders.length, '#7c3aed',
            buildColumnList(inProgressOrders, 'No orders in progress.')
          )}

          ${sectionBlock('✅', 'Ready', readyOrders.length, '#16a34a',
            buildColumnList(readyOrders, 'No orders ready.')
          )}

        </div>

        <div style="background: #f9fafb; padding: 16px 24px; text-align: center; border-top: 1px solid #e5e7eb;">
          <p style="font-size: 11px; color: #9ca3af; margin: 0;">Automated report · Aleph Engineering & Supplies</p>
          <p style="font-size: 11px; margin: 4px 0 0;"><a href="https://aleph-order-tracker.lovable.app/settings" style="color: #6b7280;">Manage preferences</a></p>
        </div>
      </div>
    </body>
    </html>`;

    const pdfContent = buildPdfBase64({
      date: today,
      awaitingStockOrders, inStockOrders, inProgressOrders, readyOrders,
      items, pos, activeOrders,
    });

    let sent = 0, failed = 0;

    for (const recipient of recipients) {
      if (!recipient.email) continue;
      try {
        const { error: sendError } = await resend.emails.send({
          from: 'Aleph Order System <onboarding@resend.dev>',
          to: [recipient.email],
          subject: `Morning Progress Report — ${today}`,
          html: emailHtml,
          attachments: [{ content: pdfContent, filename: `morning-report-${new Date().toISOString().split('T')[0]}.pdf` }]
        });
        if (!sendError) { sent++; console.log(`✅ Sent to ${recipient.email}`); }
        else { console.error(`❌ Failed ${recipient.email}:`, JSON.stringify(sendError)); failed++; }
      } catch (err) { console.error(`❌ Error ${recipient.email}:`, err); failed++; }
    }

    console.log(`=== Morning Report: ${sent} sent, ${failed} failed ===`);
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
  const { awaitingStockOrders, inStockOrders, inProgressOrders, readyOrders, items, pos, date, activeOrders } = data;
  const L: string[] = [];
  const div = '─'.repeat(60);
  
  L.push('', '    ALEPH ENGINEERING & SUPPLIES', '    Morning Progress Report', `    ${date}`, '', div);
  L.push('', `    BOARD SUMMARY`);
  L.push(`    Awaiting Stock: ${awaitingStockOrders.length}  |  In Stock: ${inStockOrders.length}  |  In Progress: ${inProgressOrders.length}  |  Ready: ${readyOrders.length}  |  Total: ${(activeOrders || []).length}`);
  L.push('', div);

  // Awaiting Stock detail
  L.push('', `    AWAITING STOCK  (${awaitingStockOrders.length})`, '');
  if (awaitingStockOrders.length === 0) {
    L.push('    All stock received.');
  } else {
    awaitingStockOrders.forEach((o: any) => {
      const company = (o.companies as any)?.name || 'Unknown';
      const oi = items.filter((i: any) => i.order_id === o.id);
      const op = pos.filter((p: any) => p.order_id === o.id);
      L.push(`    ${o.order_number}  |  ${company}  |  ${(o.urgency || 'normal').toUpperCase()}`);
      if (op.length > 0) L.push(`    PO: ${op.map((p: any) => `${p.purchase_order_number} (${(p.suppliers as any)?.name || '-'})`).join(', ')}`);
      
      const awaiting = oi.filter((i: any) => i.stock_status === 'awaiting');
      const ordered = oi.filter((i: any) => i.stock_status === 'ordered');
      const received = oi.filter((i: any) => i.stock_status === 'in-stock');
      
      if (awaiting.length > 0) { L.push('      Not Yet Ordered:'); awaiting.forEach((i: any) => L.push(`        - ${i.name}${i.code ? ` (${i.code})` : ''} x${i.quantity}`)); }
      if (ordered.length > 0) { L.push('      On Order:'); ordered.forEach((i: any) => L.push(`        - ${i.name}${i.code ? ` (${i.code})` : ''} x${i.quantity}`)); }
      if (received.length > 0) { L.push('      Received:'); received.forEach((i: any) => L.push(`        - ${i.name}${i.code ? ` (${i.code})` : ''} x${i.quantity}`)); }
      L.push('');
    });
  }

  const addSection = (title: string, list: any[]) => {
    L.push(div, '', `    ${title}  (${list.length})`, '');
    if (list.length === 0) { L.push('    None.'); }
    else { list.forEach((o: any) => {
      const c = (o.companies as any)?.name || 'Unknown';
      const n = items.filter((i: any) => i.order_id === o.id).length;
      L.push(`    ${o.order_number}  |  ${c}  |  ${n} item${n !== 1 ? 's' : ''}  |  ${(o.urgency || 'normal').toUpperCase()}`);
    }); }
  };

  addSection('IN STOCK', inStockOrders);
  addSection('IN PROGRESS', inProgressOrders);
  addSection('READY', readyOrders);

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
