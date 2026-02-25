import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Validate authentication
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized - Bearer token required' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create client with user's auth context to enforce RLS
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    )

    // Verify the user is authenticated
    const token = authHeader.replace('Bearer ', '');
    const { data: claimsData, error: claimsError } = await supabaseClient.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(
        JSON.stringify({ error: 'Invalid or expired token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const userId = claimsData.claims.sub;
    console.log(`Authenticated API request from user: ${userId}`);

    const url = new URL(req.url);
    const method = req.method;

    // GET /orders - Get all orders or filter by query params
    if (method === 'GET' && url.pathname === '/orders-api/orders') {
      const orderId = url.searchParams.get('id');
      const status = url.searchParams.get('status');
      const companyId = url.searchParams.get('company_id');
      const startDate = url.searchParams.get('start_date');
      const endDate = url.searchParams.get('end_date');
      const limit = url.searchParams.get('limit');

      let query = supabaseClient
        .from('orders')
        .select(`
          *,
          companies (
            id, name, code, contact_person, email, phone, address, vat_number
          ),
          profiles (
            id, full_name, email, phone, position
          )
        `);

      if (orderId) query = query.eq('id', orderId);
      if (status) query = query.eq('status', status);
      if (companyId) query = query.eq('company_id', companyId);
      if (startDate) query = query.gte('created_at', startDate);
      if (endDate) query = query.lte('created_at', endDate);
      if (limit) query = query.limit(parseInt(limit));

      query = query.order('created_at', { ascending: false });

      const { data: orders, error } = await query;

      if (error) {
        console.error('Error fetching orders:', error);
        return new Response(
          JSON.stringify({ error: 'Failed to fetch orders' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      return new Response(
        JSON.stringify({ success: true, count: orders?.length || 0, orders: orders || [] }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // GET /companies - Get all companies
    if (method === 'GET' && url.pathname === '/orders-api/companies') {
      const { data: companies, error } = await supabaseClient
        .from('companies')
        .select('*')
        .order('name');

      if (error) {
        console.error('Error fetching companies:', error);
        return new Response(
          JSON.stringify({ error: 'Failed to fetch companies' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      return new Response(
        JSON.stringify({ success: true, count: companies?.length || 0, companies: companies || [] }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // GET /orders/{id} - Get specific order by ID
    const orderIdMatch = url.pathname.match(/^\/orders-api\/orders\/([^\/]+)$/);
    if (method === 'GET' && orderIdMatch) {
      const orderId = orderIdMatch[1];

      const { data: order, error } = await supabaseClient
        .from('orders')
        .select(`
          *,
          companies (
            id, name, code, contact_person, email, phone, address, vat_number, account_manager
          ),
          profiles (
            id, full_name, email, phone, position
          )
        `)
        .eq('id', orderId)
        .single();

      if (error) {
        return new Response(
          JSON.stringify({ error: 'Order not found' }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      return new Response(
        JSON.stringify({ success: true, order }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // GET / - API documentation
    if (method === 'GET' && url.pathname === '/orders-api') {
      return new Response(
        JSON.stringify({
          title: "Orders API Documentation",
          version: "1.1.0",
          description: "Authenticated API for order data integration",
          authentication: "Bearer token required (Supabase JWT)",
          endpoints: {
            "GET /orders-api/orders": {
              description: "Get orders (filtered by your access level via RLS)",
              parameters: { id: "Filter by order ID", status: "Filter by status", company_id: "Filter by company", start_date: "From date (ISO)", end_date: "To date (ISO)", limit: "Max results" }
            },
            "GET /orders-api/orders/{id}": { description: "Get specific order by ID" },
            "GET /orders-api/companies": { description: "Get companies you have access to" }
          }
        }, null, 2),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ error: 'Route not found' }),
      { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Unexpected error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
