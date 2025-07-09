
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Order, OrderItem } from "./useOrders";

export function useOrderUpdates() {
  const { toast } = useToast();

  const updateOrder = async (orderId: string, updates: Partial<Omit<Order, 'items'>>) => {
    try {
      const { error } = await supabase
        .from('orders')
        .update(updates)
        .eq('id', orderId);

      if (error) throw error;

      return true;
    } catch (error: any) {
      console.error("Failed to update order:", error);
      toast({
        title: "Error",
        description: "Failed to update order: " + error.message,
        variant: "destructive",
      });
      return false;
    }
  };

  const updateOrderItems = async (orderId: string, items: OrderItem[]) => {
    try {
      // Convert items back to description format for storage
      const itemsDescription = items.map(item => 
        `${item.name} (Qty: ${item.quantity})`
      ).join('\n');

      const { error } = await supabase
        .from('orders')
        .update({ description: itemsDescription })
        .eq('id', orderId);

      if (error) throw error;

      return true;
    } catch (error: any) {
      console.error("Failed to update order items:", error);
      toast({
        title: "Error",
        description: "Failed to update order items: " + error.message,
        variant: "destructive",
      });
      return false;
    }
  };

  return {
    updateOrder,
    updateOrderItems
  };
}
