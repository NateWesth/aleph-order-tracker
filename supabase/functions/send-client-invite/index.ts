import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.8";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Verify caller is admin
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check admin role
    const { data: roleData } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .single();

    if (roleData?.role !== "admin") {
      return new Response(JSON.stringify({ error: "Admin access required" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { email, company_id } = await req.json();

    if (!email || !company_id) {
      return new Response(
        JSON.stringify({ error: "Email and company_id are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get company info
    const { data: company } = await supabase
      .from("companies")
      .select("name, code")
      .eq("id", company_id)
      .single();

    if (!company) {
      return new Response(
        JSON.stringify({ error: "Company not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create invitation record
    const { data: invitation, error: inviteError } = await supabase
      .from("client_invitations")
      .insert({
        email,
        company_id,
        invited_by: user.id,
      })
      .select()
      .single();

    if (inviteError) {
      console.error("Error creating invitation:", inviteError);
      return new Response(
        JSON.stringify({ error: "Failed to create invitation" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Build invite URL - points to portal signup page
    const appUrl = "https://aleph-order-tracker.lovable.app";
    const inviteUrl = `${appUrl}/portal/invite?token=${invitation.token}`;

    // Send email via Resend
    const resendKey = Deno.env.get("RESEND_API_KEY");
    if (resendKey) {
      const emailRes = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resendKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: "Aleph Orders <noreply@resend.dev>",
          to: [email],
          subject: `You've been invited to view your orders - ${company.name}`,
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 40px 20px;">
              <div style="text-align: center; margin-bottom: 32px;">
                <h1 style="color: #1a1a2e; font-size: 24px; margin: 0;">Aleph Orders</h1>
                <p style="color: #6b7280; font-size: 14px; margin-top: 4px;">Client Portal Invitation</p>
              </div>
              
              <div style="background: #f9fafb; border-radius: 12px; padding: 32px; margin-bottom: 24px;">
                <h2 style="color: #1a1a2e; font-size: 20px; margin: 0 0 12px;">You're invited!</h2>
                <p style="color: #4b5563; font-size: 15px; line-height: 1.6; margin: 0 0 24px;">
                  You've been invited to access the <strong>${company.name}</strong> client portal where you can track your orders in real-time.
                </p>
                
                <a href="${inviteUrl}" style="display: inline-block; background: hsl(270, 76%, 52%); color: white; padding: 12px 32px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 15px;">
                  Accept Invitation
                </a>
              </div>
              
              <p style="color: #9ca3af; font-size: 12px; text-align: center;">
                This invitation expires in 7 days. If you didn't expect this email, you can ignore it.
              </p>
            </div>
          `,
        }),
      });

      if (!emailRes.ok) {
        console.error("Resend error:", await emailRes.text());
      }
    } else {
      console.log("No RESEND_API_KEY set, invite URL:", inviteUrl);
    }

    return new Response(
      JSON.stringify({
        success: true,
        invitation_id: invitation.id,
        invite_url: inviteUrl,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
