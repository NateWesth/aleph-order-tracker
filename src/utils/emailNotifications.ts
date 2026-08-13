
import { supabase } from "@/integrations/supabase/client";

interface EmailNotificationParams {
  orderId: string;
  orderNumber: string;
  companyName: string;
  changeType: 'created' | 'status_change' | 'updated' | 'deleted';
  oldStatus?: string;
  newStatus?: string;
  description?: string;
}

export const sendOrderNotification = async (params: EmailNotificationParams) => {
  try {
    
    const { data, error } = await supabase.functions.invoke('send-order-notifications', {
      body: params
    });

    if (error) {
      console.error('Supabase function invoke error:', error);
      throw new Error(`Function invoke failed: ${error.message}`);
    }

    
    // Check if the response indicates any issues
    if (data?.error) {
      console.error('Function returned error:', data.error);
      throw new Error(`Function error: ${data.error}`);
    }

    if (data?.failed && data.failed > 0) {
      console.warn(`Some emails failed to send: ${data.failed} failed, ${data.sent} sent`);
    }

    return data;
  } catch (error) {
    console.error('Failed to send order notification:', error);
    // Re-throw the error so it can be handled by the calling code
    throw error;
  }
};
