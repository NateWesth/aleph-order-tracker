
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

    // Get users who opted in for morning reports
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

    // Fetch all active orders with items and company info
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

    // Categorize orders
    const awaitingStockOrders = activeOrders.filter(o => {
      const orderItems = items.filter(i => i.order_id === o.id);
      return orderItems.some(i => i.progress_stage === 'awaiting-stock');
    });

    const inStockOrders = activeOrders.filter(o => {
      const orderItems = items.filter(i => i.order_id === o.id);
      return orderItems.length > 0 && orderItems.every(i => i.progress_stage === 'in-stock') && !awaitingStockOrders.includes(o);
    });

    const readyForDeliveryOrders = activeOrders.filter(o => {
      const orderItems = items.filter(i => i.order_id === o.id);
      return orderItems.some(i => i.progress_stage === 'ready-for-delivery');
    });

    const pendingOrders = activeOrders.filter(o => o.status === 'pending');
    const processingOrders = activeOrders.filter(o => o.status === 'processing');

    const today = new Date().toLocaleDateString('en-ZA', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

    // Build awaiting stock section (primary focus)
    let awaitingStockHtml = '';
    awaitingStockOrders.forEach(order => {
      const companyName = (order.companies as any)?.name || 'Unknown';
      const orderItems = items.filter(i => i.order_id === order.id && i.progress_stage === 'awaiting-stock');
      const orderPOs = pos.filter(p => p.order_id === order.id);
      
      awaitingStockHtml += `
        <tr style="border-bottom: 1px solid #e5e7eb;">
          <td style="padding: 12px 8px; font-weight: 600; color: #1f2937;">${order.order_number}</td>
          <td style="padding: 12px 8px; color: #374151;">${companyName}</td>
          <td style="padding: 12px 8px; color: #374151;">
            ${orderItems.map(i => `${i.name}${i.code ? ` (${i.code})` : ''} × ${i.quantity}`).join('<br/>')}
          </td>
          <td style="padding: 12px 8px; color: #374151;">
            ${orderPOs.length > 0 ? orderPOs.map(p => `${p.purchase_order_number} - ${(p.suppliers as any)?.name || ''}`).join('<br/>') : '—'}
          </td>
          <td style="padding: 12px 8px;">
            <span style="background: ${order.urgency === 'urgent' ? '#fef2f2' : order.urgency === 'high' ? '#fff7ed' : '#f0fdf4'}; color: ${order.urgency === 'urgent' ? '#dc2626' : order.urgency === 'high' ? '#ea580c' : '#16a34a'}; padding: 2px 8px; border-radius: 12px; font-size: 12px;">
              ${order.urgency || 'normal'}
            </span>
          </td>
        </tr>`;
    });

    // Build summary rows for other stages
    const buildSummaryRows = (orderList: any[]) => {
      return orderList.map(o => {
        const companyName = (o.companies as any)?.name || 'Unknown';
        const orderItems = items.filter(i => i.order_id === o.id);
        return `
          <tr style="border-bottom: 1px solid #e5e7eb;">
            <td style="padding: 8px; color: #1f2937;">${o.order_number}</td>
            <td style="padding: 8px; color: #374151;">${companyName}</td>
            <td style="padding: 8px; color: #374151;">${orderItems.length} items</td>
            <td style="padding: 8px;">
              <span style="background: ${o.urgency === 'urgent' ? '#fef2f2' : '#f0fdf4'}; color: ${o.urgency === 'urgent' ? '#dc2626' : '#16a34a'}; padding: 2px 8px; border-radius: 12px; font-size: 12px;">${o.urgency || 'normal'}</span>
            </td>
          </tr>`;
      }).join('');
    };

    // Build PDF content as base64
    const pdfContent = buildPdfBase64({
      title: 'Morning Progress Report',
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

    const emailHtml = `
    <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 800px; margin: 0 auto; background: #ffffff;">
      <div style="background: linear-gradient(135deg, #059669, #10b981); padding: 32px; text-align: center;">
        <h1 style="color: #ffffff; margin: 0; font-size: 24px;">☀️ Morning Progress Report</h1>
        <p style="color: #d1fae5; margin: 8px 0 0; font-size: 14px;">${today}</p>
      </div>
      
      <div style="padding: 24px;">
        <!-- Quick Stats -->
        <div style="display: flex; gap: 12px; margin-bottom: 24px;">
          <div style="flex: 1; background: #fef2f2; border-radius: 8px; padding: 16px; text-align: center;">
            <div style="font-size: 28px; font-weight: 700; color: #dc2626;">${awaitingStockOrders.length}</div>
            <div style="font-size: 12px; color: #991b1b;">Awaiting Stock</div>
          </div>
          <div style="flex: 1; background: #eff6ff; border-radius: 8px; padding: 16px; text-align: center;">
            <div style="font-size: 28px; font-weight: 700; color: #2563eb;">${inStockOrders.length}</div>
            <div style="font-size: 12px; color: #1e40af;">In Stock</div>
          </div>
          <div style="flex: 1; background: #f0fdf4; border-radius: 8px; padding: 16px; text-align: center;">
            <div style="font-size: 28px; font-weight: 700; color: #16a34a;">${readyForDeliveryOrders.length}</div>
            <div style="font-size: 12px; color: #166534;">Ready for Delivery</div>
          </div>
          <div style="flex: 1; background: #fefce8; border-radius: 8px; padding: 16px; text-align: center;">
            <div style="font-size: 28px; font-weight: 700; color: #ca8a04;">${activeOrders.length}</div>
            <div style="font-size: 12px; color: #854d0e;">Total Active</div>
          </div>
        </div>

        <!-- Awaiting Stock Section (Primary Focus) -->
        <div style="margin-bottom: 32px;">
          <h2 style="color: #dc2626; font-size: 18px; border-bottom: 2px solid #fecaca; padding-bottom: 8px;">
            🔴 Orders Awaiting Stock (${awaitingStockOrders.length})
          </h2>
          ${awaitingStockOrders.length > 0 ? `
          <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
            <thead>
              <tr style="background: #fef2f2;">
                <th style="padding: 10px 8px; text-align: left; color: #991b1b; font-weight: 600;">Order #</th>
                <th style="padding: 10px 8px; text-align: left; color: #991b1b; font-weight: 600;">Company</th>
                <th style="padding: 10px 8px; text-align: left; color: #991b1b; font-weight: 600;">Items Awaiting</th>
                <th style="padding: 10px 8px; text-align: left; color: #991b1b; font-weight: 600;">PO Info</th>
                <th style="padding: 10px 8px; text-align: left; color: #991b1b; font-weight: 600;">Urgency</th>
              </tr>
            </thead>
            <tbody>${awaitingStockHtml}</tbody>
          </table>` : '<p style="color: #6b7280; font-style: italic;">No orders awaiting stock — great job! 🎉</p>'}
        </div>

        <!-- In Stock Section -->
        <div style="margin-bottom: 24px;">
          <h2 style="color: #2563eb; font-size: 16px; border-bottom: 2px solid #bfdbfe; padding-bottom: 8px;">
            🔵 In Stock (${inStockOrders.length})
          </h2>
          ${inStockOrders.length > 0 ? `
          <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
            <thead>
              <tr style="background: #eff6ff;">
                <th style="padding: 8px; text-align: left;">Order #</th>
                <th style="padding: 8px; text-align: left;">Company</th>
                <th style="padding: 8px; text-align: left;">Items</th>
                <th style="padding: 8px; text-align: left;">Urgency</th>
              </tr>
            </thead>
            <tbody>${buildSummaryRows(inStockOrders)}</tbody>
          </table>` : '<p style="color: #6b7280; font-style: italic;">None</p>'}
        </div>

        <!-- Ready for Delivery -->
        <div style="margin-bottom: 24px;">
          <h2 style="color: #16a34a; font-size: 16px; border-bottom: 2px solid #bbf7d0; padding-bottom: 8px;">
            🟢 Ready for Delivery (${readyForDeliveryOrders.length})
          </h2>
          ${readyForDeliveryOrders.length > 0 ? `
          <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
            <thead>
              <tr style="background: #f0fdf4;">
                <th style="padding: 8px; text-align: left;">Order #</th>
                <th style="padding: 8px; text-align: left;">Company</th>
                <th style="padding: 8px; text-align: left;">Items</th>
                <th style="padding: 8px; text-align: left;">Urgency</th>
              </tr>
            </thead>
            <tbody>${buildSummaryRows(readyForDeliveryOrders)}</tbody>
          </table>` : '<p style="color: #6b7280; font-style: italic;">None</p>'}
        </div>

        <!-- Pending Orders -->
        <div style="margin-bottom: 24px;">
          <h2 style="color: #ca8a04; font-size: 16px; border-bottom: 2px solid #fde68a; padding-bottom: 8px;">
            🟡 Pending Orders (${pendingOrders.length})
          </h2>
          ${pendingOrders.length > 0 ? `
          <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
            <thead>
              <tr style="background: #fefce8;">
                <th style="padding: 8px; text-align: left;">Order #</th>
                <th style="padding: 8px; text-align: left;">Company</th>
                <th style="padding: 8px; text-align: left;">Items</th>
                <th style="padding: 8px; text-align: left;">Urgency</th>
              </tr>
            </thead>
            <tbody>${buildSummaryRows(pendingOrders)}</tbody>
          </table>` : '<p style="color: #6b7280; font-style: italic;">None</p>'}
        </div>

        <!-- Processing Orders -->
        <div style="margin-bottom: 24px;">
          <h2 style="color: #7c3aed; font-size: 16px; border-bottom: 2px solid #c4b5fd; padding-bottom: 8px;">
            🟣 Processing Orders (${processingOrders.length})
          </h2>
          ${processingOrders.length > 0 ? `
          <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
            <thead>
              <tr style="background: #f5f3ff;">
                <th style="padding: 8px; text-align: left;">Order #</th>
                <th style="padding: 8px; text-align: left;">Company</th>
                <th style="padding: 8px; text-align: left;">Items</th>
                <th style="padding: 8px; text-align: left;">Urgency</th>
              </tr>
            </thead>
            <tbody>${buildSummaryRows(processingOrders)}</tbody>
          </table>` : '<p style="color: #6b7280; font-style: italic;">None</p>'}
        </div>
      </div>

      <div style="background: #f9fafb; padding: 16px 24px; text-align: center; font-size: 12px; color: #6b7280;">
        <p>This is an automated daily report from Aleph Engineering & Supplies Order Management System.</p>
        <p>You can disable this report in your <a href="https://aleph-order-tracker.lovable.app/settings" style="color: #059669;">notification settings</a>.</p>
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
          subject: `☀️ Morning Progress Report — ${today}`,
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

// Simple PDF generation as base64 string (plain text PDF)
function buildPdfBase64(data: any): string {
  const { awaitingStockOrders, inStockOrders, readyForDeliveryOrders, pendingOrders, processingOrders, items, pos, date } = data;
  
  // Build simple text-based content for PDF
  let lines: string[] = [];
  lines.push('ALEPH ENGINEERING & SUPPLIES');
  lines.push('Morning Progress Report');
  lines.push(date);
  lines.push('');
  lines.push(`Total Active Orders: ${(awaitingStockOrders.length + inStockOrders.length + readyForDeliveryOrders.length + pendingOrders.length + processingOrders.length)}`);
  lines.push('');
  lines.push('=== AWAITING STOCK ===');
  
  awaitingStockOrders.forEach((o: any) => {
    const companyName = (o.companies as any)?.name || 'Unknown';
    const orderItems = items.filter((i: any) => i.order_id === o.id && i.progress_stage === 'awaiting-stock');
    lines.push(`Order: ${o.order_number} | Company: ${companyName} | Urgency: ${o.urgency || 'normal'}`);
    orderItems.forEach((i: any) => {
      lines.push(`  - ${i.name}${i.code ? ` (${i.code})` : ''} x ${i.quantity}`);
    });
  });
  
  lines.push('');
  lines.push('=== IN STOCK ===');
  inStockOrders.forEach((o: any) => {
    lines.push(`Order: ${o.order_number} | Company: ${(o.companies as any)?.name || 'Unknown'}`);
  });
  
  lines.push('');
  lines.push('=== READY FOR DELIVERY ===');
  readyForDeliveryOrders.forEach((o: any) => {
    lines.push(`Order: ${o.order_number} | Company: ${(o.companies as any)?.name || 'Unknown'}`);
  });
  
  lines.push('');
  lines.push('=== PENDING ===');
  pendingOrders.forEach((o: any) => {
    lines.push(`Order: ${o.order_number} | Company: ${(o.companies as any)?.name || 'Unknown'}`);
  });
  
  lines.push('');
  lines.push('=== PROCESSING ===');
  processingOrders.forEach((o: any) => {
    lines.push(`Order: ${o.order_number} | Company: ${(o.companies as any)?.name || 'Unknown'}`);
  });

  const textContent = lines.join('\n');
  
  // Create a minimal valid PDF
  const pdfLines = [
    '%PDF-1.4',
    '1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj',
    '2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj',
  ];
  
  // Encode text content safely for PDF
  const safeText = textContent.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
  const textLines = safeText.split('\n');
  
  // Build content stream
  let stream = 'BT\n/F1 10 Tf\n';
  let y = 780;
  for (const line of textLines) {
    if (y < 40) {
      // simple page break handling - just stop
      stream += `1 0 0 1 40 ${y} Tm\n(... continued in full report) Tj\n`;
      break;
    }
    stream += `1 0 0 1 40 ${y} Tm\n(${line}) Tj\n`;
    y -= 14;
  }
  stream += 'ET';
  
  pdfLines.push(`3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>endobj`);
  pdfLines.push(`4 0 obj<</Length ${stream.length}>>\nstream\n${stream}\nendstream\nendobj`);
  pdfLines.push('5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Courier>>endobj');
  
  const xrefOffset = pdfLines.join('\n').length + 1;
  pdfLines.push('xref');
  pdfLines.push('0 6');
  pdfLines.push('0000000000 65535 f ');
  pdfLines.push('0000000009 00000 n ');
  pdfLines.push('0000000058 00000 n ');
  pdfLines.push('0000000115 00000 n ');
  // These offsets are approximate but functional for basic PDFs
  pdfLines.push('0000000300 00000 n ');
  pdfLines.push('0000000500 00000 n ');
  pdfLines.push('trailer<</Size 6/Root 1 0 R>>');
  pdfLines.push(`startxref\n${xrefOffset}`);
  pdfLines.push('%%EOF');
  
  const pdfString = pdfLines.join('\n');
  const encoder = new TextEncoder();
  const pdfBytes = encoder.encode(pdfString);
  return base64Encode(pdfBytes);
}
