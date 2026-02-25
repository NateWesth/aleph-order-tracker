import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.8';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

interface EmailRequest {
  orderId: string;
  orderNumber: string;
  companyName: string;
  recipients: Array<{
    id: string;
    email: string;
    name: string | null;
  }>;
  files: Array<{
    id: string;
    file_name: string;
    file_url: string;
    file_type: string;
    mime_type: string | null;
  }>;
}

const serve_handler = async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('Starting completed order email function...');

    // Validate authentication
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized - Bearer token required' }),
        { status: 401, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
      );
    }

    const supabaseAuth = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace('Bearer ', '');
    const { data: claimsData, error: claimsError } = await supabaseAuth.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(
        JSON.stringify({ error: 'Invalid or expired token' }),
        { status: 401, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
      );
    }

    // Check for SendGrid API key
    const sendGridApiKey = Deno.env.get('SENDGRID_API_KEY');
    if (!sendGridApiKey) {
      console.error('SENDGRID_API_KEY environment variable is not set');
      return new Response(
        JSON.stringify({ error: 'SendGrid API key not configured' }),
        { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
      );
    }

    // Parse request body
    const emailRequest: EmailRequest = await req.json();
    console.log('Email request received:', {
      orderId: emailRequest.orderId,
      orderNumber: emailRequest.orderNumber,
      recipientCount: emailRequest.recipients.length,
      fileCount: emailRequest.files.length
    });

    if (!emailRequest.recipients || emailRequest.recipients.length === 0) {
      return new Response(
        JSON.stringify({ error: 'No recipients provided' }),
        { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
      );
    }

    // Prepare email content
    const subject = `Completed Order Files - Order #${emailRequest.orderNumber}`;
    
    // Create download links for each file
    const fileLinks = emailRequest.files.map(file => 
      `<li><a href="${file.file_url}" target="_blank" download="${file.file_name}" style="color: #2563eb; text-decoration: underline;">${file.file_name}</a> (${file.file_type})</li>`
    ).join('');

    const emailContent = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #333;">Order Completed - Files Ready for Download</h2>
        
        <p>Hello,</p>
        
        <p>We're pleased to inform you that Order #${emailRequest.orderNumber} for ${emailRequest.companyName} has been completed.</p>
        
        <div style="background-color: #f8f9fa; padding: 15px; border-radius: 5px; margin: 20px 0;">
          <h3 style="margin-top: 0; color: #333;">Order Details:</h3>
          <p><strong>Order Number:</strong> ${emailRequest.orderNumber}</p>
          <p><strong>Company:</strong> ${emailRequest.companyName}</p>
          <p><strong>Status:</strong> Completed</p>
        </div>
        
        ${emailRequest.files.length > 0 ? `
        <div style="margin: 20px 0;">
          <h3 style="color: #333;">Download Files:</h3>
          <ul style="background-color: #f8f9fa; padding: 15px; border-radius: 5px;">
            ${fileLinks}
          </ul>
          <p style="font-size: 14px; color: #666; margin-top: 10px;">
            <strong>Note:</strong> Click on any file name to download it directly to your device.
          </p>
        </div>
        ` : '<p>No files are attached to this order.</p>'}
        
        <p>If you have any questions about this order or need additional information, please don't hesitate to contact us.</p>
        
        <p>Best regards,<br>
        The Order Management Team</p>
        
        <hr style="margin: 30px 0; border: none; border-top: 1px solid #ddd;">
        <p style="font-size: 12px; color: #666;">
          This is an automated message. Please do not reply directly to this email.
        </p>
      </div>
    `;

    // Don't try to attach files - instead send download links
    console.log(`Email will contain download links for ${emailRequest.files.length} files`);

    console.log(`Sending emails to ${emailRequest.recipients.length} recipients with download links`);

    // Send emails using SendGrid
    let sent = 0;
    let failed = 0;
    const failedEmails: string[] = [];

    for (const recipient of emailRequest.recipients) {
      try {
        const emailData: any = {
          personalizations: [
            {
              to: [{ email: recipient.email, name: recipient.name || undefined }],
              subject: subject
            }
          ],
          from: {
            email: 'noreply@alepheng.co.za',
            name: 'Order Management System'
          },
          content: [
            {
              type: "text/html",
              value: emailContent
            }
          ]
        };

        // No need for attachments since we're sending download links
        console.log(`Sending email to ${recipient.email}`);

        const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${sendGridApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(emailData),
        });

        if (response.ok) {
          console.log(`Email sent successfully to ${recipient.email}`);
          sent++;
        } else {
          const errorText = await response.text();
          console.error(`SendGrid API error for ${recipient.email}:`, response.status, errorText);
          failed++;
          failedEmails.push(recipient.email);
        }
      } catch (error) {
        console.error(`Error sending email to ${recipient.email}:`, error);
        failed++;
        failedEmails.push(recipient.email);
      }
    }

    console.log(`Email sending completed: ${sent} sent, ${failed} failed`);

    return new Response(
      JSON.stringify({
        success: true,
        sent,
        failed,
        failedEmails,
        message: `Successfully sent ${sent} emails${failed > 0 ? `, ${failed} failed` : ''}`
      }),
      { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
    );

  } catch (error: any) {
    console.error('Error in send-completed-order-email function:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
    );
  }
};

serve(serve_handler);
