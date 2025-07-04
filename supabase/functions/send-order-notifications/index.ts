
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

const resend = new Resend(Deno.env.get('RESEND_API_KEY'));

serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
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

        return resend.emails.send({
          from: 'Order Management <orders@resend.dev>',
          to: [recipient.email],
          subject: subject,
          html: personalizedContent,
        });
      } catch (error) {
        console.error(`Failed to send email to ${recipient.email}:`, error);
        return { error };
      }
    });

    const results = await Promise.allSettled(emailPromises);
    const successful = results.filter(result => result.status === 'fulfilled').length;
    const failed = results.filter(result => result.status === 'rejected').length;

    console.log(`Email notifications sent: ${successful} successful, ${failed} failed`);

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
