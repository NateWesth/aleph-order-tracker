
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface AdminValidationRequest {
  adminCode: string;
}

const handler = async (req: Request): Promise<Response> => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { adminCode }: AdminValidationRequest = await req.json();

    // Get the admin code from environment variables
    const validAdminCode = Deno.env.get('ADMIN_ACCESS_CODE');
    
    if (!validAdminCode) {
      console.error('ADMIN_ACCESS_CODE not configured');
      return new Response(
        JSON.stringify({ error: 'Admin validation not configured' }),
        {
          status: 500,
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
        }
      );
    }

    const isValid = adminCode === validAdminCode;

    console.log('Admin code validation attempt:', { isValid });

    return new Response(
      JSON.stringify({ isValid }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      }
    );
  } catch (error: any) {
    console.error('Error in validate-admin-code function:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      }
    );
  }
};

serve(handler);
