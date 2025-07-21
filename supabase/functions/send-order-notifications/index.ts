
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.8';

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
    
    const sendgridApiKey = Deno.env.get('SENDGRID_API_KEY');
    console.log('SENDGRID_API_KEY configured:', !!sendgridApiKey);
    
    if (!sendgridApiKey) {
      console.error('❌ SENDGRID_API_KEY is not configured in Supabase secrets');
      return new Response(
        JSON.stringify({ error: 'Email service not configured - SENDGRID_API_KEY missing' }),
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

    // Get the order details
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

    // Collect all recipients
    const allRecipients: Array<{email: string, name: string, role: string}> = [];

    // 1. Get ALL admin users
    console.log('🔍 Fetching admin users...');
    const { data: adminRoles, error: adminRolesError } = await supabase
      .from('user_roles')
      .select(`
        user_id,
        profiles!inner(email, full_name)
      `)
      .eq('role', 'admin');

    if (adminRolesError) {
      console.error('❌ Error fetching admin users:', adminRolesError);
    } else if (adminRoles && adminRoles.length > 0) {
      console.log('👥 Admin users found:', adminRoles.length);
      adminRoles.forEach(adminRole => {
        if (adminRole.profiles && adminRole.profiles.email) {
          allRecipients.push({
            email: adminRole.profiles.email,
            name: adminRole.profiles.full_name || 'Admin User',
            role: 'admin'
          });
          console.log('✅ Added admin:', adminRole.profiles.email);
        }
      });
    }

    // 2. Get ALL users from the same company as the order
    if (orderData.company_id) {
      console.log('🔍 Fetching company users for company_id:', orderData.company_id);
      
      const { data: companyUsers, error: companyUsersError } = await supabase
        .from('profiles')
        .select('email, full_name')
        .eq('company_id', orderData.company_id);

      if (companyUsersError) {
        console.error('❌ Error fetching company users:', companyUsersError);
      } else if (companyUsers && companyUsers.length > 0) {
        console.log('🏢 Company users found:', companyUsers.length);
        companyUsers.forEach(user => {
          if (user.email && !allRecipients.find(r => r.email === user.email)) {
            allRecipients.push({
              email: user.email,
              name: user.full_name || 'Company User',
              role: 'client'
            });
            console.log('✅ Added company user:', user.email);
          }
        });
      }
    }

    // 3. If no company users found by company_id, try by company_code
    if (orderData.company_id && allRecipients.filter(r => r.role === 'client').length === 0 && companyName) {
      console.log('🔍 Trying to find users by company name/code...');
      
      // First get the company code
      const { data: company, error: companyError } = await supabase
        .from('companies')
        .select('code')
        .eq('name', companyName)
        .single();

      if (!companyError && company?.code) {
        console.log('🏢 Found company code:', company.code);
        
        const { data: codeUsers, error: codeUsersError } = await supabase
          .from('profiles')
          .select('email, full_name')
          .eq('company_code', company.code);

        if (!codeUsersError && codeUsers && codeUsers.length > 0) {
          console.log('🏢 Users found by company_code:', codeUsers.length);
          codeUsers.forEach(user => {
            if (user.email && !allRecipients.find(r => r.email === user.email)) {
              allRecipients.push({
                email: user.email,
                name: user.full_name || 'Company User',
                role: 'client'
              });
              console.log('✅ Added user by company_code:', user.email);
            }
          });
        }
      }
    }

    // 4. Always include the order creator
    if (orderData.user_id) {
      console.log('🔍 Fetching order creator:', orderData.user_id);
      const { data: orderCreator, error: creatorError } = await supabase
        .from('profiles')
        .select('email, full_name')
        .eq('id', orderData.user_id)
        .single();

      if (!creatorError && orderCreator?.email) {
        if (!allRecipients.find(r => r.email === orderCreator.email)) {
          allRecipients.push({
            email: orderCreator.email,
            name: orderCreator.full_name || 'Order Creator',
            role: 'creator'
          });
          console.log('✅ Added order creator:', orderCreator.email);
        }
      }
    }

    console.log('📊 Final recipient summary:');
    console.log(`  - Total recipients: ${allRecipients.length}`);
    console.log(`  - Admin recipients: ${allRecipients.filter(r => r.role === 'admin').length}`);
    console.log(`  - Client recipients: ${allRecipients.filter(r => r.role === 'client').length}`);
    console.log(`  - Creator recipients: ${allRecipients.filter(r => r.role === 'creator').length}`);
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

    // Send emails to all recipients using SendGrid
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
                You are receiving this notification as ${recipient.role === 'admin' ? 'an administrator' : recipient.role === 'creator' ? 'the order creator' : 'a client user'} 
                of the Order Management System.
              </p>
            </div>
          </div>
        `;

        // SendGrid API call
        const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${sendgridApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: {
              email: 'orders@yourdomain.com',
              name: 'Order Management System'
            },
            personalizations: [{
              to: [{ email: recipient.email, name: recipient.name }],
              subject: subject
            }],
            content: [{
              type: 'text/html',
              value: personalizedContent
            }]
          })
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`SendGrid API error: ${response.status} - ${errorText}`);
        }

        const result = await response.text();
        console.log(`✅ Email sent successfully to ${recipient.email} via SendGrid`);
        return { success: true, email: recipient.email, result, role: recipient.role };
      } catch (error) {
        console.error(`❌ Failed to send email to ${recipient.email}:`, error);
        return { success: false, email: recipient.email, error: error.message, role: recipient.role };
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
      details: results.map((result, index) => ({
        recipient: allRecipients[index]?.email,
        role: allRecipients[index]?.role,
        status: result.status === 'fulfilled' && result.value.success ? 'sent' : 'failed',
        error: result.status === 'fulfilled' && !result.value.success ? result.value.error : 
               result.status === 'rejected' ? result.reason : null
      })),
      debug: {
        orderData,
        totalRecipientsFound: allRecipients.length,
        recipientBreakdown: {
          admins: allRecipients.filter(r => r.role === 'admin').length,
          clients: allRecipients.filter(r => r.role === 'client').length,
          creators: allRecipients.filter(r => r.role === 'creator').length
        }
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
