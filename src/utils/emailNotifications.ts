
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
    console.log('Sending order notification:', params);
    
    const { data, error } = await supabase.functions.invoke('send-order-notifications', {
      body: params
    });

    if (error) {
      console.error('Error sending order notification:', error);
      throw error;
    }

    console.log('Order notification sent successfully:', data);
    return data;
  } catch (error) {
    console.error('Failed to send order notification:', error);
    throw error;
  }
};
