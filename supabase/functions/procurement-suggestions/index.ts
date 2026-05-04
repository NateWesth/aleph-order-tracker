import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface Item {
  sku: string;
  name?: string;
  supplier?: string;
  stock?: number;
  toOrder?: number;
  monthlyDemand?: number;
  daysToZero?: number;
  lastCost?: number;
  abcClass?: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing auth" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: { user } } = await supabase.auth.getUser(
      authHeader.replace("Bearer ", ""),
    );
    if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const items: Item[] = (body.items || []).slice(0, 80);

    if (!items.length) {
      return new Response(
        JSON.stringify({ suggestion: "No procurement data provided." }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "AI not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const summary = items
      .map(
        (i) =>
          `${i.sku} ${i.name || ""} | supplier: ${i.supplier || "?"} | stock: ${i.stock ?? "?"} | suggested: ${i.toOrder ?? 0} | monthly demand: ${i.monthlyDemand ?? "?"} | days-to-zero: ${i.daysToZero ?? "?"} | class: ${i.abcClass || "?"}`,
      )
      .join("\n");

    const prompt = `You are a procurement analyst. Given this snapshot of items requiring restock, give plain-text recommendations in under 180 words.

Focus on:
- Top 3 SKUs with greatest urgency (lowest days-to-zero, A-class)
- Any items where suggested order qty looks low for their demand
- Supplier consolidation opportunities (multiple SKUs from same supplier)

End with one line starting with "Bottom line:" giving a single concrete next action.

DATA:
${summary}`;

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!aiRes.ok) {
      const txt = await aiRes.text();
      console.error("AI error", aiRes.status, txt);
      return new Response(
        JSON.stringify({ error: "AI request failed", status: aiRes.status }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const data = await aiRes.json();
    const suggestion = data.choices?.[0]?.message?.content || "No suggestion generated.";

    return new Response(JSON.stringify({ suggestion, count: items.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("procurement-suggestions error", e);
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
