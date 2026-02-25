import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "npm:resend@2.0.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface NewUserNotification {
  user_id: string;
  email: string;
  full_name?: string;
  company_code?: string;
  phone?: string;
  position?: string;
}

const handler = async (req: Request): Promise<Response> => {
  console.log("notify-admin-new-user function called");

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Validate authentication
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ error: "Unauthorized - Bearer token required" }),
        { status: 401, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const supabaseAuth = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await supabaseAuth.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(
        JSON.stringify({ error: "Invalid or expired token" }),
        { status: 401, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Use service role for admin operations
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // Dynamically fetch all admin users instead of hardcoding
    const { data: adminRoles, error: adminRolesError } = await supabaseClient
      .from("user_roles")
      .select("user_id")
      .eq("role", "admin");

    if (adminRolesError || !adminRoles || adminRoles.length === 0) {
      console.error("Failed to fetch admin users:", adminRolesError);
      return new Response(
        JSON.stringify({ error: "No admin users found to notify" }),
        { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const adminUserIds = adminRoles.map((r) => r.user_id).filter(Boolean);

    const { data: adminProfiles, error: profilesError } = await supabaseClient
      .from("profiles")
      .select("email, full_name")
      .in("id", adminUserIds);

    if (profilesError || !adminProfiles || adminProfiles.length === 0) {
      console.error("Failed to fetch admin profiles:", profilesError);
      return new Response(
        JSON.stringify({ error: "No admin profiles found" }),
        { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const { user_id, email, full_name, company_code, phone, position }: NewUserNotification = await req.json();

    console.log("New user registration notification:", { email, full_name, company_code });

    const adminDashboardUrl = `${req.headers.get("origin") || "https://app.alepheng.co.za"}/admin-dashboard`;

    // Send notification email to all admin users
    const emailResults = [];
    for (const adminProfile of adminProfiles) {
      if (!adminProfile?.email) continue;

      try {
        const emailResponse = await resend.emails.send({
          from: "Aleph Engineering <onboarding@resend.dev>",
          to: [adminProfile.email],
          subject: "🔔 New User Registration - Approval Required",
          html: `
            <!DOCTYPE html>
            <html>
            <head>
              <meta charset="utf-8">
              <meta name="viewport" content="width=device-width, initial-scale=1.0">
            </head>
            <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f4f4f5; margin: 0; padding: 20px;">
              <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
                <div style="background: linear-gradient(135deg, #22c55e 0%, #16a34a 100%); padding: 32px; text-align: center;">
                  <h1 style="color: #ffffff; margin: 0; font-size: 24px; font-weight: 600;">New User Registration</h1>
                </div>
                <div style="padding: 32px;">
                  <p style="color: #374151; font-size: 16px; line-height: 1.6; margin: 0 0 24px;">
                    Hi ${adminProfile.full_name || "Admin"},
                  </p>
                  <p style="color: #374151; font-size: 16px; line-height: 1.6; margin: 0 0 24px;">
                    A new user has registered and is awaiting your approval.
                  </p>
                  
                  <div style="background-color: #f9fafb; border-radius: 8px; padding: 20px; margin-bottom: 24px;">
                    <h3 style="color: #111827; font-size: 14px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; margin: 0 0 16px;">User Details</h3>
                    <table style="width: 100%; border-collapse: collapse;">
                      <tr>
                        <td style="padding: 8px 0; color: #6b7280; font-size: 14px; width: 120px;">Name:</td>
                        <td style="padding: 8px 0; color: #111827; font-size: 14px; font-weight: 500;">${full_name || "Not provided"}</td>
                      </tr>
                      <tr>
                        <td style="padding: 8px 0; color: #6b7280; font-size: 14px;">Email:</td>
                        <td style="padding: 8px 0; color: #111827; font-size: 14px; font-weight: 500;">${email}</td>
                      </tr>
                      <tr>
                        <td style="padding: 8px 0; color: #6b7280; font-size: 14px;">Phone:</td>
                        <td style="padding: 8px 0; color: #111827; font-size: 14px; font-weight: 500;">${phone || "Not provided"}</td>
                      </tr>
                      <tr>
                        <td style="padding: 8px 0; color: #6b7280; font-size: 14px;">Position:</td>
                        <td style="padding: 8px 0; color: #111827; font-size: 14px; font-weight: 500;">${position || "Not provided"}</td>
                      </tr>
                      <tr>
                        <td style="padding: 8px 0; color: #6b7280; font-size: 14px;">Company Code:</td>
                        <td style="padding: 8px 0; color: #111827; font-size: 14px; font-weight: 500;">${company_code || "Not provided"}</td>
                      </tr>
                    </table>
                  </div>
                  
                  <div style="text-align: center;">
                    <a href="${adminDashboardUrl}" style="display: inline-block; background: linear-gradient(135deg, #22c55e 0%, #16a34a 100%); color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-weight: 600; font-size: 16px;">
                      Review & Approve User
                    </a>
                  </div>
                  
                  <p style="color: #6b7280; font-size: 14px; line-height: 1.6; margin: 24px 0 0; text-align: center;">
                    Go to the Users tab in your admin dashboard to approve or reject this registration.
                  </p>
                </div>
                <div style="background-color: #f9fafb; padding: 20px; text-align: center; border-top: 1px solid #e5e7eb;">
                  <p style="color: #9ca3af; font-size: 12px; margin: 0;">
                    Aleph Engineering and Supplies - Order Tracking System
                  </p>
                </div>
              </div>
            </body>
            </html>
          `,
        });
        emailResults.push({ email: adminProfile.email, success: true, response: emailResponse });
        console.log(`Admin notification sent to ${adminProfile.email}`);
      } catch (emailErr) {
        console.error(`Failed to send to ${adminProfile.email}:`, emailErr);
        emailResults.push({ email: adminProfile.email, success: false, error: String(emailErr) });
      }
    }

    console.log("Admin notification emails completed:", emailResults.length);

    return new Response(JSON.stringify({ success: true, emailResults }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (error: any) {
    console.error("Error in notify-admin-new-user function:", error);
    return new Response(
      JSON.stringify({ error: "An internal error occurred" }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
};

serve(handler);
