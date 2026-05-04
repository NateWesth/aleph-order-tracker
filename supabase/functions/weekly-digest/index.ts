import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.8";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseAuth = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await supabaseAuth.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = claimsData.claims.sub;
    const { data: userRole } = await supabaseAuth.from("user_roles").select("role").eq("user_id", userId).single();
    if (userRole?.role !== "admin") {
      return new Response(JSON.stringify({ error: "Admin only" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY missing");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Last 7 days vs previous 7 days
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

    const [thisWeekOrders, lastWeekOrders, thisWeekCompleted, lastWeekCompleted, activeOrders, activityLog] = await Promise.all([
      supabase.from("orders").select("id, total_amount, urgency, status, company_id, companies(name)").gte("created_at", weekAgo.toISOString()),
      supabase.from("orders").select("id, total_amount").gte("created_at", twoWeeksAgo.toISOString()).lt("created_at", weekAgo.toISOString()),
      supabase.from("orders").select("id, total_amount, completed_date").eq("status", "delivered").gte("completed_date", weekAgo.toISOString()),
      supabase.from("orders").select("id, total_amount").eq("status", "delivered").gte("completed_date", twoWeeksAgo.toISOString()).lt("completed_date", weekAgo.toISOString()),
      supabase.from("orders").select("id, status, urgency, created_at").neq("status", "delivered"),
      supabase.from("order_activity_log").select("activity_type").gte("created_at", weekAgo.toISOString()),
    ]);

    const tw = thisWeekOrders.data || [];
    const lw = lastWeekOrders.data || [];
    const twc = thisWeekCompleted.data || [];
    const lwc = lastWeekCompleted.data || [];
    const active = activeOrders.data || [];

    const sumAmt = (arr: any[]) => arr.reduce((s, o) => s + (Number(o.total_amount) || 0), 0);
    const twRevenue = sumAmt(tw);
    const lwRevenue = sumAmt(lw);
    const twCompletedRevenue = sumAmt(twc);
    const lwCompletedRevenue = sumAmt(lwc);

    // Top clients this week
    const clientCounts: Record<string, { name: string; count: number; value: number }> = {};
    for (const o of tw) {
      const name = (o as any).companies?.name || "Unknown";
      const key = o.company_id || "unknown";
      if (!clientCounts[key]) clientCounts[key] = { name, count: 0, value: 0 };
      clientCounts[key].count++;
      clientCounts[key].value += Number(o.total_amount) || 0;
    }
    const topClients = Object.values(clientCounts).sort((a, b) => b.value - a.value).slice(0, 3);

    const urgentActive = active.filter(o => o.urgency === "urgent" || o.urgency === "high").length;
    const oldActive = active.filter(o => {
      const days = (Date.now() - new Date(o.created_at).getTime()) / 86400000;
      return days > 14;
    }).length;

    const summary = {
      thisWeek: {
        ordersCreated: tw.length,
        ordersCompleted: twc.length,
        revenueCreated: twRevenue,
        revenueCompleted: twCompletedRevenue,
      },
      lastWeek: {
        ordersCreated: lw.length,
        ordersCompleted: lwc.length,
        revenueCreated: lwRevenue,
        revenueCompleted: lwCompletedRevenue,
      },
      pipeline: {
        active: active.length,
        urgent: urgentActive,
        agingOver14d: oldActive,
      },
      topClients,
      activityCount: (activityLog.data || []).length,
    };

    const prompt = `You are a business analyst writing a weekly digest for an order management app. Write a concise, friendly weekly summary in plain text (no markdown). Highlight: trends vs last week, wins, risks, and one clear recommendation. Keep under 180 words. End with "Bottom line:" followed by one sentence.

DATA:
${JSON.stringify(summary, null, 2)}`;

    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!aiResp.ok) {
      const errText = await aiResp.text();
      throw new Error(`AI gateway error: ${aiResp.status} ${errText}`);
    }

    const aiData = await aiResp.json();
    const digest = aiData.choices?.[0]?.message?.content || "Unable to generate digest.";

    return new Response(JSON.stringify({ digest, summary, generatedAt: new Date().toISOString() }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("weekly-digest error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
