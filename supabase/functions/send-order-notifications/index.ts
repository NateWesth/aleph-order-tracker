
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.8';
import { Resend } from "npm:resend@2.0.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface NotificationRequest {
  orderId: string;
  orderNumber: string;
  companyName: string;
  changeType: 'created' | 'status_change' | 'updated' | 'deleted';
  oldStatus?: string;
  newStatus?: string;
  description?: string;
}

const supabase = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
);

serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('Starting order notification process...');
    
    // Check if RESEND_API_KEY is available
    const resendApiKey = Deno.env.get('RESEND_API_KEY');
    if (!resendApiKey) {
      console.error('RESEND_API_KEY is not configured');
      return new Response(
        JSON.stringify({ error: 'Email service not configured' }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const resend = new Resend(resendApiKey);

    const { orderId, orderNumber, companyName, changeType, oldStatus, newStatus, description }: NotificationRequest = await req.json();

    console.log('Processing order notification:', { orderId, orderNumber, changeType });

    // Get the order details including company_id
    const { data: orderData, error: orderError } = await supabase
      .from('orders')
      .select('company_id, user_id')
      .eq('id', orderId)
      .single();

    if (orderError) {
      console.error('Error fetching order:', orderError);
      throw orderError;
    }

    console.log('Order data:', orderData);

    // Get all admin users
    const { data: adminUsers, error: adminError } = await supabase
      .from('user_roles')
      .select(`
        user_id,
        profiles!inner(email, full_name)
      `)
      .eq('role', 'admin');

    if (adminError) {
      console.error('Error fetching admin users:', adminError);
      throw adminError;
    }

    console.log('Admin users found:', adminUsers?.length || 0);

    // Get client users linked to the company
    let clientUsers: any[] = [];
    if (orderData.company_id) {
      const { data: companyUsers, error: companyError } = await supabase
        .from('profiles')
        .select('email, full_name, id')
        .eq('company_id', orderData.company_id)
        .not('email', 'is', null);

      if (companyError) {
        console.error('Error fetching company users:', companyError);
      } else {
        clientUsers = companyUsers || [];
        console.log('Company users found:', clientUsers.length);
      }
    }

    // Also include the order creator if they're not already included
    if (orderData.user_id) {
      const { data: orderCreator, error: creatorError } = await supabase
        .from('profiles')
        .select('email, full_name, id')
        .eq('id', orderData.user_id)
        .single();

      if (!creatorError && orderCreator && !clientUsers.find(u => u.id === orderCreator.id)) {
        clientUsers.push(orderCreator);
        console.log('Added order creator to recipients');
      }
    }

    // Combine all email recipients
    const allRecipients = [
      ...adminUsers.map((admin: any) => ({
        email: admin.profiles.email,
        name: admin.profiles.full_name || 'Admin User',
        role: 'admin'
      })),
      ...clientUsers.map((client: any) => ({
        email: client.email,
        name: client.full_name || 'Client User',
        role: 'client'
      }))
    ].filter(recipient => recipient.email);

    console.log(`Sending notifications to ${allRecipients.length} recipients`);

    if (allRecipients.length === 0) {
      console.log('No recipients found, skipping email send');
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'No recipients found',
          sent: 0, 
          failed: 0,
          recipients: 0 
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Generate email content based on change type
    let subject = '';
    let emailContent = '';

    switch (changeType) {
      case 'created':
        subject = `New Order Created - ${orderNumber}`;
        emailContent = `
          <h2>New Order Created</h2>
          <p>A new order has been created:</p>
          <ul>
            <li><strong>Order Number:</strong> ${orderNumber}</li>
            <li><strong>Company:</strong> ${companyName}</li>
            <li><strong>Status:</strong> ${newStatus || 'Pending'}</li>
            ${description ? `<li><strong>Description:</strong> ${description}</li>` : ''}
          </ul>
          <p>Please log in to the system to view the full order details.</p>
        `;
        break;

      case 'status_change':
        subject = `Order Status Updated - ${orderNumber}`;
        emailContent = `
          <h2>Order Status Updated</h2>
          <p>The status of order ${orderNumber} has been updated:</p>
          <ul>
            <li><strong>Order Number:</strong> ${orderNumber}</li>
            <li><strong>Company:</strong> ${companyName}</li>
            <li><strong>Previous Status:</strong> ${oldStatus || 'Unknown'}</li>
            <li><strong>New Status:</strong> ${newStatus || 'Unknown'}</li>
          </ul>
          <p>Please log in to the system to view the updated order details.</p>
        `;
        break;

      case 'updated':
        subject = `Order Updated - ${orderNumber}`;
        emailContent = `
          <h2>Order Updated</h2>
          <p>Order ${orderNumber} has been updated:</p>
          <ul>
            <li><strong>Order Number:</strong> ${orderNumber}</li>
            <li><strong>Company:</strong> ${companyName}</li>
            <li><strong>Current Status:</strong> ${newStatus || 'Unknown'}</li>
          </ul>
          <p>Please log in to the system to view the updated order details.</p>
        `;
        break;

      case 'deleted':
        subject = `Order Deleted - ${orderNumber}`;
        emailContent = `
          <h2>Order Deleted</h2>
          <p>Order ${orderNumber} has been deleted:</p>
          <ul>
            <li><strong>Order Number:</strong> ${orderNumber}</li>
            <li><strong>Company:</strong> ${companyName}</li>
          </ul>
          <p>This order is no longer available in the system.</p>
        `;
        break;
    }

    // Send emails to all recipients
    const emailPromises = allRecipients.map(async (recipient) => {
      try {
        console.log(`Sending email to: ${recipient.email}`);
        
        const personalizedContent = `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px;">
              <h1 style="color: #333; margin-bottom: 20px;">Order Management System</h1>
              <p>Hello ${recipient.name},</p>
              ${emailContent}
              <hr style="margin: 20px 0; border: none; border-top: 1px solid #ddd;">
              <p style="color: #666; font-size: 12px;">
                You are receiving this notification as ${recipient.role === 'admin' ? 'an administrator' : 'a client user'} 
                of the Order Management System.
              </p>
            </div>
          </div>
        `;

        const result = await resend.emails.send({
          from: 'Order Management <orders@resend.dev>',
          to: [recipient.email],
          subject: subject,
          html: personalizedContent,
        });

        console.log(`Email sent successfully to ${recipient.email}:`, result);
        return { success: true, email: recipient.email, result };
      } catch (error) {
        console.error(`Failed to send email to ${recipient.email}:`, error);
        return { success: false, email: recipient.email, error };
      }
    });

    const results = await Promise.allSettled(emailPromises);
    const successful = results.filter(result => 
      result.status === 'fulfilled' && result.value.success
    ).length;
    const failed = results.filter(result => 
      result.status === 'rejected' || (result.status === 'fulfilled' && !result.value.success)
    ).length;

    console.log(`Email notifications completed: ${successful} successful, ${failed} failed`);

    // Log failed attempts for debugging
    results.forEach((result, index) => {
      if (result.status === 'rejected') {
        console.error(`Email ${index} rejected:`, result.reason);
      } else if (result.status === 'fulfilled' && !result.value.success) {
        console.error(`Email ${index} failed:`, result.value.error);
      }
    });

    return new Response(
      JSON.stringify({ 
        success: true, 
        sent: successful, 
        failed: failed,
        recipients: allRecipients.length 
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error: any) {
    console.error('Error in send-order-notifications function:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
