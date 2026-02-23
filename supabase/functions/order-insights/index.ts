import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.8";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { question } = await req.json();
    if (!question) throw new Error("Question is required");

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    // Get auth token from request
    const authHeader = req.headers.get("Authorization");
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch order data for context
    const [ordersRes, companiesRes, suppliersRes, itemsRes] = await Promise.all([
      supabase.from("orders").select("id, order_number, status, urgency, total_amount, created_at, completed_date, company_id, companies(name)").order("created_at", { ascending: false }).limit(500),
      supabase.from("companies").select("id, name, code"),
      supabase.from("suppliers").select("id, name, code"),
      supabase.from("order_items").select("name, quantity, stock_status, order_id"),
    ]);

    const orders = ordersRes.data || [];
    const companies = companiesRes.data || [];
    const suppliers = suppliersRes.data || [];
    const items = itemsRes.data || [];

    // Build summary stats for context
    const totalOrders = orders.length;
    const statusCounts: Record<string, number> = {};
    const urgencyCounts: Record<string, number> = {};
    const companyOrderCounts: Record<string, number> = {};
    let totalRevenue = 0;
    let completedCount = 0;
    let totalCompletionDays = 0;

    for (const o of orders) {
      const status = o.status || "pending";
      statusCounts[status] = (statusCounts[status] || 0) + 1;
      
      const urgency = o.urgency || "normal";
      urgencyCounts[urgency] = (urgencyCounts[urgency] || 0) + 1;

      if (o.total_amount) totalRevenue += Number(o.total_amount);

      const companyName = (o.companies as any)?.name || "Unknown";
      companyOrderCounts[companyName] = (companyOrderCounts[companyName] || 0) + 1;

      if ((status === "completed" || status === "delivered") && o.completed_date && o.created_at) {
        const days = (new Date(o.completed_date).getTime() - new Date(o.created_at).getTime()) / (1000 * 60 * 60 * 24);
        totalCompletionDays += days;
        completedCount++;
      }
    }

    const avgCompletion = completedCount > 0 ? Math.round(totalCompletionDays / completedCount * 10) / 10 : 0;

    // Item aggregation
    const itemAgg: Record<string, number> = {};
    for (const item of items) {
      itemAgg[item.name] = (itemAgg[item.name] || 0) + item.quantity;
    }
    const topItems = Object.entries(itemAgg).sort(([,a],[,b]) => b - a).slice(0, 10);

    const topClients = Object.entries(companyOrderCounts).sort(([,a],[,b]) => b - a).slice(0, 10);

    const dataContext = `
ORDER MANAGEMENT SYSTEM DATA SUMMARY:
- Total orders: ${totalOrders}
- Total revenue: R${totalRevenue.toLocaleString()}
- Average completion time: ${avgCompletion} days
- Total clients: ${companies.length}
- Total suppliers: ${suppliers.length}

STATUS BREAKDOWN: ${JSON.stringify(statusCounts)}
URGENCY BREAKDOWN: ${JSON.stringify(urgencyCounts)}

TOP 10 CLIENTS BY ORDER COUNT: ${topClients.map(([name, count]) => `${name}: ${count} orders`).join(", ")}

TOP 10 ITEMS BY QUANTITY: ${topItems.map(([name, qty]) => `${name}: ${qty} units`).join(", ")}

RECENT 20 ORDERS: ${JSON.stringify(orders.slice(0, 20).map(o => ({
  number: o.order_number,
  status: o.status,
  urgency: o.urgency,
  amount: o.total_amount,
  company: (o.companies as any)?.name,
  created: o.created_at?.slice(0, 10),
  completed: o.completed_date?.slice(0, 10),
})))}
`;

    const systemPrompt = `You are an AI business analyst for Aleph Engineering and Supplies' order management system. You have access to real order data. Provide concise, actionable insights. Use bullet points and numbers. Currency is South African Rand (R). Be specific with data — don't be vague. If asked about trends, reference actual numbers. Keep responses under 300 words.

${dataContext}`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: question },
        ],
        stream: true,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again in a moment." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted. Please top up in workspace settings." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      return new Response(JSON.stringify({ error: "AI service unavailable" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(response.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (e) {
    console.error("order-insights error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
