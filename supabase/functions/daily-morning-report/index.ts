
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

    // Fetch active orders (NOT delivered)
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

    const awaitingStock = activeOrders.filter(o => o.status === 'ordered');
    const inStock = activeOrders.filter(o => o.status === 'in-stock');
    const inProgress = activeOrders.filter(o => o.status === 'in-progress');
    const ready = activeOrders.filter(o => o.status === 'ready');

    const today = new Date().toLocaleDateString('en-ZA', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

    // ── HTML helpers ──

    const urgencyDot = (u: string) => {
      const c = u === 'urgent' ? '#dc2626' : u === 'high' ? '#ea580c' : '#9ca3af';
      return `<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${c};margin-right:6px;"></span>`;
    };

    const itemTable = (orderItems: any[]) => {
      if (orderItems.length === 0) return '<p style="color:#9ca3af;font-size:12px;margin:6px 0 0;">No items</p>';
      return `<table width="100%" cellpadding="0" cellspacing="0" style="margin-top:8px;border-collapse:collapse;">
        <tr style="background:#f9fafb;">
          <td style="padding:4px 8px;font-size:11px;font-weight:600;color:#6b7280;border-bottom:1px solid #e5e7eb;">Item</td>
          <td style="padding:4px 8px;font-size:11px;font-weight:600;color:#6b7280;border-bottom:1px solid #e5e7eb;text-align:center;">Qty</td>
          <td style="padding:4px 8px;font-size:11px;font-weight:600;color:#6b7280;border-bottom:1px solid #e5e7eb;text-align:right;">Stock</td>
        </tr>
        ${orderItems.map(i => {
          const stockLabel = i.stock_status === 'in-stock' ? 'Received' : i.stock_status === 'ordered' ? 'On Order' : 'Not Ordered';
          const stockColor = i.stock_status === 'in-stock' ? '#16a34a' : i.stock_status === 'ordered' ? '#d97706' : '#dc2626';
          return `<tr>
            <td style="padding:5px 8px;font-size:12px;color:#374151;border-bottom:1px solid #f3f4f6;">${i.name}${i.code ? ` <span style="color:#9ca3af;">${i.code}</span>` : ''}</td>
            <td style="padding:5px 8px;font-size:12px;color:#374151;border-bottom:1px solid #f3f4f6;text-align:center;">${i.quantity}</td>
            <td style="padding:5px 8px;font-size:11px;font-weight:600;color:${stockColor};border-bottom:1px solid #f3f4f6;text-align:right;">${stockLabel}</td>
          </tr>`;
        }).join('')}
      </table>`;
    };

    const orderCard = (order: any, showItems: boolean) => {
      const company = (order.companies as any)?.name || 'Unknown';
      const orderItems = items.filter(i => i.order_id === order.id);
      const orderPOs = pos.filter(p => p.order_id === order.id);
      return `
        <div style="border:1px solid #e5e7eb;border-radius:8px;padding:14px 16px;margin-bottom:10px;background:#ffffff;">
          <table width="100%" cellpadding="0" cellspacing="0"><tr>
            <td>${urgencyDot(order.urgency || 'normal')}<span style="font-weight:700;font-size:14px;color:#111827;">${order.order_number}</span></td>
            <td style="text-align:right;font-size:12px;color:#6b7280;">${orderItems.length} item${orderItems.length !== 1 ? 's' : ''}</td>
          </tr></table>
          <div style="font-size:13px;color:#6b7280;margin-top:2px;">${company}</div>
          ${orderPOs.length > 0 ? `<div style="font-size:11px;color:#9ca3af;margin-top:4px;">PO: ${orderPOs.map(p => p.purchase_order_number).join(', ')}</div>` : ''}
          ${showItems ? itemTable(orderItems) : ''}
        </div>`;
    };

    const sectionHeader = (title: string, count: number, color: string) => `
      <div style="margin-top:28px;margin-bottom:12px;padding-bottom:8px;border-bottom:2px solid ${color};">
        <table width="100%" cellpadding="0" cellspacing="0"><tr>
          <td><span style="font-size:15px;font-weight:700;color:${color};">${title}</span></td>
          <td style="text-align:right;"><span style="background:${color};color:#fff;font-size:11px;font-weight:700;padding:2px 10px;border-radius:99px;">${count}</span></td>
        </tr></table>
      </div>`;

    const statBox = (label: string, value: number, color: string) =>
      `<td style="padding:12px 8px;text-align:center;">
        <div style="font-size:24px;font-weight:800;color:${color};line-height:1;">${value}</div>
        <div style="font-size:10px;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;margin-top:4px;">${label}</div>
      </td>`;

    const emailHtml = `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
    <body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
      <div style="max-width:600px;margin:0 auto;background:#ffffff;">

        <!-- Header -->
        <div style="background:#111827;padding:24px;">
          <p style="color:#4b5563;font-size:11px;text-transform:uppercase;letter-spacing:2px;margin:0 0 4px;">Aleph Engineering & Supplies</p>
          <h1 style="color:#ffffff;margin:0;font-size:18px;font-weight:700;">Morning Board Report</h1>
          <p style="color:#6b7280;margin:4px 0 0;font-size:12px;">${today}</p>
        </div>

        <!-- Stats -->
        <div style="background:#f9fafb;border-bottom:1px solid #e5e7eb;padding:4px 0;">
          <table width="100%" cellpadding="0" cellspacing="0"><tr>
            ${statBox('Awaiting', awaitingStock.length, '#dc2626')}
            <td style="width:1px;background:#e5e7eb;"></td>
            ${statBox('In Stock', inStock.length, '#2563eb')}
            <td style="width:1px;background:#e5e7eb;"></td>
            ${statBox('In Progress', inProgress.length, '#7c3aed')}
            <td style="width:1px;background:#e5e7eb;"></td>
            ${statBox('Ready', ready.length, '#16a34a')}
          </tr></table>
        </div>

        <div style="padding:0 24px 24px;">

          <!-- Awaiting Stock — full detail with item tables -->
          ${sectionHeader('Awaiting Stock', awaitingStock.length, '#dc2626')}
          ${awaitingStock.length > 0
            ? awaitingStock.map(o => orderCard(o, true)).join('')
            : '<p style="color:#16a34a;font-size:13px;margin:4px 0;">All stock received ✓</p>'}

          <!-- In Stock — cards without item tables -->
          ${sectionHeader('In Stock', inStock.length, '#2563eb')}
          ${inStock.length > 0
            ? inStock.map(o => orderCard(o, false)).join('')
            : '<p style="color:#9ca3af;font-size:13px;font-style:italic;">None</p>'}

          <!-- In Progress -->
          ${sectionHeader('In Progress', inProgress.length, '#7c3aed')}
          ${inProgress.length > 0
            ? inProgress.map(o => orderCard(o, false)).join('')
            : '<p style="color:#9ca3af;font-size:13px;font-style:italic;">None</p>'}

          <!-- Ready -->
          ${sectionHeader('Ready for Collection / Delivery', ready.length, '#16a34a')}
          ${ready.length > 0
            ? ready.map(o => orderCard(o, false)).join('')
            : '<p style="color:#9ca3af;font-size:13px;font-style:italic;">None</p>'}

        </div>

        <!-- Footer -->
        <div style="background:#f9fafb;padding:14px 24px;text-align:center;border-top:1px solid #e5e7eb;">
          <p style="font-size:11px;color:#9ca3af;margin:0;">Automated report · Aleph Engineering & Supplies</p>
          <p style="font-size:11px;margin:4px 0 0;"><a href="https://aleph-order-tracker.lovable.app/settings" style="color:#6b7280;">Manage preferences</a></p>
        </div>
      </div>
    </body></html>`;

    const pdfContent = buildPdfBase64({
      date: today, awaitingStock, inStock, inProgress, ready, items, pos, total: activeOrders.length,
    });

    let sent = 0, failed = 0;
    for (const recipient of recipients) {
      if (!recipient.email) continue;
      try {
        const { error: sendError } = await resend.emails.send({
          from: 'Aleph Order System <onboarding@resend.dev>',
          to: [recipient.email],
          subject: `Morning Board Report — ${today}`,
          html: emailHtml,
          attachments: [{ content: pdfContent, filename: `morning-report-${new Date().toISOString().split('T')[0]}.pdf` }]
        });
        if (!sendError) { sent++; console.log(`Sent to ${recipient.email}`); }
        else { console.error(`Failed ${recipient.email}:`, JSON.stringify(sendError)); failed++; }
      } catch (err) { console.error(`Error ${recipient.email}:`, err); failed++; }
    }

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
  const { date, awaitingStock, inStock, inProgress, ready, items, pos, total } = data;
  const L: string[] = [];
  const line = '='.repeat(62);
  const thin = '-'.repeat(62);

  L.push('');
  L.push('  ALEPH ENGINEERING & SUPPLIES');
  L.push('  Morning Board Report');
  L.push(`  ${date}`);
  L.push('');
  L.push(line);
  L.push('');
  L.push(`  BOARD OVERVIEW`);
  L.push(`  Awaiting Stock: ${awaitingStock.length}   In Stock: ${inStock.length}   In Progress: ${inProgress.length}   Ready: ${ready.length}   Total: ${total}`);
  L.push('');
  L.push(line);

  // Awaiting Stock detail
  L.push('');
  L.push(`  AWAITING STOCK (${awaitingStock.length})`);
  L.push(thin);
  if (awaitingStock.length === 0) {
    L.push('  All stock received.');
  } else {
    awaitingStock.forEach((o: any) => {
      const company = (o.companies as any)?.name || 'Unknown';
      const oi = items.filter((i: any) => i.order_id === o.id);
      const op = pos.filter((p: any) => p.order_id === o.id);
      L.push('');
      L.push(`  ${o.order_number}  |  ${company}  |  Priority: ${(o.urgency || 'normal').toUpperCase()}`);
      if (op.length > 0) L.push(`  PO: ${op.map((p: any) => p.purchase_order_number).join(', ')}`);
      if (oi.length > 0) {
        L.push('  +-----------------------------------------+------+-------------+');
        L.push('  | Item                                    | Qty  | Stock       |');
        L.push('  +-----------------------------------------+------+-------------+');
        oi.forEach((i: any) => {
          const name = `${i.name}${i.code ? ` (${i.code})` : ''}`.substring(0, 39).padEnd(39);
          const qty = String(i.quantity).padEnd(4);
          const stock = (i.stock_status === 'in-stock' ? 'Received' : i.stock_status === 'ordered' ? 'On Order' : 'Not Ordered').padEnd(11);
          L.push(`  | ${name} | ${qty} | ${stock} |`);
        });
        L.push('  +-----------------------------------------+------+-------------+');
      }
    });
  }

  const addCompactSection = (title: string, list: any[]) => {
    L.push('');
    L.push(line);
    L.push('');
    L.push(`  ${title} (${list.length})`);
    L.push(thin);
    if (list.length === 0) { L.push('  None.'); return; }
    list.forEach((o: any) => {
      const c = (o.companies as any)?.name || 'Unknown';
      const n = items.filter((i: any) => i.order_id === o.id).length;
      L.push(`  ${o.order_number}  |  ${c}  |  ${n} item${n !== 1 ? 's' : ''}  |  ${(o.urgency || 'normal').toUpperCase()}`);
    });
  };

  addCompactSection('IN STOCK', inStock);
  addCompactSection('IN PROGRESS', inProgress);
  addCompactSection('READY FOR COLLECTION / DELIVERY', ready);

  L.push('');
  L.push(line);
  L.push('');
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
