

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

serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('=== Order Notification Function Started ===');
    
    const resendApiKey = Deno.env.get('RESEND_API_KEY');
    console.log('RESEND_API_KEY configured:', !!resendApiKey);
    
    if (!resendApiKey) {
      console.error('❌ RESEND_API_KEY is not configured in Supabase secrets');
      return new Response(
        JSON.stringify({ error: 'Email service not configured - RESEND_API_KEY missing' }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const requestBody = await req.json();
    console.log('📨 Request body received:', requestBody);

    const { orderId, orderNumber, companyName, changeType, oldStatus, newStatus, description }: NotificationRequest = requestBody;

    console.log('🔍 Processing notification for:', { orderId, orderNumber, changeType });

    // Get the order details including company_id
    const { data: orderData, error: orderError } = await supabase
      .from('orders')
      .select('company_id, user_id')
      .eq('id', orderId)
      .single();

    if (orderError) {
      console.error('❌ Error fetching order:', orderError);
      return new Response(
        JSON.stringify({ error: `Failed to fetch order: ${orderError.message}` }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    console.log('📋 Order data retrieved:', orderData);

    // 1. Get ALL admin users - simplified approach
    console.log('🔍 Fetching ALL admin users...');
    const adminUsers: any[] = [];
    
    // Get admin user IDs
    const { data: adminRoles, error: adminRolesError } = await supabase
      .from('user_roles')
      .select('user_id')
      .eq('role', 'admin');

    if (adminRolesError) {
      console.error('❌ Error fetching admin roles:', adminRolesError);
    } else if (adminRoles && adminRoles.length > 0) {
      console.log('👥 Admin role records found:', adminRoles.length);
      
      // Get profiles for admin users
      const adminUserIds = adminRoles.map(role => role.user_id);
      const { data: adminProfiles, error: adminProfilesError } = await supabase
        .from('profiles')
        .select('email, full_name, id')
        .in('id', adminUserIds);

      if (adminProfilesError) {
        console.error('❌ Error fetching admin profiles:', adminProfilesError);
      } else if (adminProfiles) {
        adminUsers.push(...adminProfiles);
        console.log('👥 Admin users with profiles:', adminUsers.length);
        console.log('👥 Admin user emails:', adminUsers.map(u => u.email));
      }
    }

    // 2. Get ALL client users - broader approach
    console.log('🔍 Fetching ALL client users...');
    const clientUsers: any[] = [];

    // Method 1: Get users by company_id if available
    if (orderData.company_id) {
      console.log('🔍 Fetching users by company_id:', orderData.company_id);
      const { data: companyUsers, error: companyError } = await supabase
        .from('profiles')
        .select('email, full_name, id, company_id')
        .eq('company_id', orderData.company_id);

      if (companyError) {
        console.error('❌ Error fetching company users by company_id:', companyError);
      } else if (companyUsers) {
        clientUsers.push(...companyUsers);
        console.log('🏢 Users found by company_id:', companyUsers.length);
      }
    }

    // Method 2: Get users by company_code (fallback)
    if (companyName && clientUsers.length === 0) {
      console.log('🔍 Trying to fetch users by company code...');
      
      // First get the company by name to find its code
      const { data: company, error: companyLookupError } = await supabase
        .from('companies')
        .select('code, id')
        .eq('name', companyName)
        .single();

      if (!companyLookupError && company) {
        console.log('🏢 Found company:', company);
        
        const { data: codeUsers, error: codeUsersError } = await supabase
          .from('profiles')
          .select('email, full_name, id, company_code')
          .eq('company_code', company.code);

        if (!codeUsersError && codeUsers) {
          clientUsers.push(...codeUsers);
          console.log('🏢 Users found by company_code:', codeUsers.length);
        }
      }
    }

    // 3. Always include the order creator
    if (orderData.user_id) {
      console.log('🔍 Fetching order creator:', orderData.user_id);
      const { data: orderCreator, error: creatorError } = await supabase
        .from('profiles')
        .select('email, full_name, id')
        .eq('id', orderData.user_id)
        .single();

      if (!creatorError && orderCreator) {
        // Check if not already in clientUsers
        if (!clientUsers.find(u => u.id === orderCreator.id)) {
          clientUsers.push(orderCreator);
          console.log('👤 Added order creator to recipients');
        }
      }
    }

    // 4. Remove duplicates and create recipient lists
    const allUsers = [...adminUsers, ...clientUsers];
    const uniqueUsers = allUsers.filter((user, index, self) => 
      index === self.findIndex(u => u.id === user.id)
    );

    console.log('📊 Summary before filtering:');
    console.log('  - Admin users:', adminUsers.length);
    console.log('  - Client users:', clientUsers.length);
    console.log('  - Total unique users:', uniqueUsers.length);

    // 5. Create final recipient lists with valid emails
    const adminRecipients = adminUsers
      .filter(admin => admin.email && admin.email.trim() !== '')
      .map(admin => ({
        email: admin.email,
        name: admin.full_name || 'Admin User',
        role: 'admin'
      }));

    const clientRecipients = clientUsers
      .filter(client => client.email && client.email.trim() !== '')
      .map(client => ({
        email: client.email,
        name: client.full_name || 'Client User',
        role: 'client'
      }));

    const allRecipients = [...adminRecipients, ...clientRecipients]
      .filter((recipient, index, self) => 
        index === self.findIndex(r => r.email === recipient.email)
      );

    console.log(`📧 Final recipient counts:`);
    console.log(`  - Admin recipients: ${adminRecipients.length}`);
    console.log(`  - Client recipients: ${clientRecipients.length}`);
    console.log(`  - Total unique recipients: ${allRecipients.length}`);
    console.log('📧 All recipient emails:', allRecipients.map(r => ({ email: r.email, role: r.role })));

    if (allRecipients.length === 0) {
      console.log('⚠️ No valid recipients found, skipping email send');
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'No valid recipients found',
          sent: 0, 
          failed: 0,
          recipients: 0,
          debug: {
            adminUsersFound: adminUsers.length,
            clientUsersFound: clientUsers.length,
            orderData: orderData
          }
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

    console.log('📝 Email subject:', subject);

    const resend = new Resend(resendApiKey);

    // Send emails to all recipients
    const emailPromises = allRecipients.map(async (recipient, index) => {
      try {
        console.log(`📤 Sending email ${index + 1}/${allRecipients.length} to: ${recipient.email} (${recipient.role})`);
        
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

        console.log(`✅ Email sent successfully to ${recipient.email}:`, result);
        return { success: true, email: recipient.email, result };
      } catch (error) {
        console.error(`❌ Failed to send email to ${recipient.email}:`, error);
        return { success: false, email: recipient.email, error: error.message };
      }
    });

    console.log('⏳ Waiting for all emails to be sent...');
    const results = await Promise.allSettled(emailPromises);
    
    const successful = results.filter(result => 
      result.status === 'fulfilled' && result.value.success
    ).length;
    
    const failed = results.filter(result => 
      result.status === 'rejected' || (result.status === 'fulfilled' && !result.value.success)
    ).length;

    console.log(`📊 Email sending completed: ${successful} successful, ${failed} failed`);

    // Log failed attempts for debugging
    results.forEach((result, index) => {
      if (result.status === 'rejected') {
        console.error(`❌ Email ${index + 1} rejected:`, result.reason);
      } else if (result.status === 'fulfilled' && !result.value.success) {
        console.error(`❌ Email ${index + 1} failed:`, result.value.error);
      }
    });

    const response = { 
      success: true, 
      sent: successful, 
      failed: failed,
      recipients: allRecipients.length,
      adminRecipients: adminRecipients.length,
      clientRecipients: clientRecipients.length,
      details: results.map((result, index) => ({
        recipient: allRecipients[index]?.email,
        role: allRecipients[index]?.role,
        status: result.status === 'fulfilled' && result.value.success ? 'sent' : 'failed',
        error: result.status === 'fulfilled' && !result.value.success ? result.value.error : 
               result.status === 'rejected' ? result.reason : null
      })),
      debug: {
        orderData,
        adminUsersFound: adminUsers.length,
        clientUsersFound: clientUsers.length,
        totalUniqueUsers: uniqueUsers.length
      }
    };

    console.log('🎯 Final response:', response);
    console.log('=== Order Notification Function Completed ===');

    return new Response(
      JSON.stringify(response),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error: any) {
    console.error('💥 Critical error in send-order-notifications function:', error);
    return new Response(
      JSON.stringify({ 
        error: error.message,
        stack: error.stack 
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});

