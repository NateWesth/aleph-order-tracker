import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface Database {
  public: {
    Tables: {
      orders: any
      companies: any
      profiles: any
    }
  }
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient<Database>(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const url = new URL(req.url);
    const method = req.method;
    
    console.log(`API Request: ${method} ${url.pathname}`);

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
            id,
            name,
            code,
            contact_person,
            email,
            phone,
            address,
            vat_number
          ),
          profiles (
            id,
            full_name,
            email,
            phone,
            position
          )
        `);

      // Apply filters
      if (orderId) {
        query = query.eq('id', orderId);
      }
      if (status) {
        query = query.eq('status', status);
      }
      if (companyId) {
        query = query.eq('company_id', companyId);
      }
      if (startDate) {
        query = query.gte('created_at', startDate);
      }
      if (endDate) {
        query = query.lte('created_at', endDate);
      }
      if (limit) {
        query = query.limit(parseInt(limit));
      }

      query = query.order('created_at', { ascending: false });

      const { data: orders, error } = await query;

      if (error) {
        console.error('Error fetching orders:', error);
        return new Response(
          JSON.stringify({ error: 'Failed to fetch orders', details: error.message }),
          { 
            status: 500, 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          }
        );
      }

      console.log(`Successfully fetched ${orders?.length || 0} orders`);

      return new Response(
        JSON.stringify({
          success: true,
          count: orders?.length || 0,
          orders: orders || []
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
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
          JSON.stringify({ error: 'Failed to fetch companies', details: error.message }),
          { 
            status: 500, 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          }
        );
      }

      return new Response(
        JSON.stringify({
          success: true,
          count: companies?.length || 0,
          companies: companies || []
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
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
            id,
            name,
            code,
            contact_person,
            email,
            phone,
            address,
            vat_number,
            account_manager
          ),
          profiles (
            id,
            full_name,
            email,
            phone,
            position
          )
        `)
        .eq('id', orderId)
        .single();

      if (error) {
        console.error('Error fetching order:', error);
        return new Response(
          JSON.stringify({ error: 'Order not found', details: error.message }),
          { 
            status: 404, 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          }
        );
      }

      console.log(`Successfully fetched order: ${order.order_number}`);

      return new Response(
        JSON.stringify({
          success: true,
          order: order
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    // GET / - API documentation
    if (method === 'GET' && url.pathname === '/orders-api') {
      const documentation = {
        title: "Orders API Documentation",
        version: "1.0.0",
        description: "API for integrating order data with accounting systems",
        endpoints: {
          "GET /orders-api/orders": {
            description: "Get all orders with optional filtering",
            parameters: {
              id: "Filter by specific order ID",
              status: "Filter by order status (pending, processing, completed, etc.)",
              company_id: "Filter by company ID",
              start_date: "Filter orders from this date (ISO format)",
              end_date: "Filter orders until this date (ISO format)",
              limit: "Limit number of results"
            },
            example: "/orders-api/orders?status=completed&start_date=2024-01-01&limit=50"
          },
          "GET /orders-api/orders/{id}": {
            description: "Get specific order by ID",
            example: "/orders-api/orders/123e4567-e89b-12d3-a456-426614174000"
          },
          "GET /orders-api/companies": {
            description: "Get all companies",
            example: "/orders-api/companies"
          }
        },
        authentication: "No authentication required (public API)",
        response_format: {
          success: true,
          count: "Number of records returned",
          orders: "Array of order objects with company and profile data",
          companies: "Array of company objects"
        }
      };

      return new Response(
        JSON.stringify(documentation, null, 2),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    // Route not found
    return new Response(
      JSON.stringify({ 
        error: 'Route not found',
        available_endpoints: [
          'GET /orders-api - API documentation',
          'GET /orders-api/orders - Get all orders',
          'GET /orders-api/orders/{id} - Get specific order',
          'GET /orders-api/companies - Get all companies'
        ]
      }),
      { 
        status: 404, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );

  } catch (error) {
    console.error('Unexpected error:', error);
    return new Response(
      JSON.stringify({ 
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error'
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});