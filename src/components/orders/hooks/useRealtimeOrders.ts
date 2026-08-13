
import { useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface Order {
  id: string;
  order_number: string;
  description: string | null;
  status: string | null;
  total_amount: number | null;
  created_at: string;
  company_id: string | null;
  user_id: string | null;
}

interface UseRealtimeOrdersProps {
  onOrdersChange: () => void;
  isAdmin: boolean;
}

export const useRealtimeOrders = ({ onOrdersChange, isAdmin }: UseRealtimeOrdersProps) => {
  const { toast } = useToast();

  const handleOrderInsert = useCallback((payload: any) => {
    
    // Show notification for new orders
    toast({
      title: "New Order Created",
      description: `Order ${payload.new.order_number} has been created.`,
    });
    
    // Refresh the orders list
    onOrdersChange();
  }, [toast, onOrdersChange]);

  const handleOrderUpdate = useCallback((payload: any) => {
    
    // Show notification for order updates
    toast({
      title: "Order Updated",
      description: `Order ${payload.new.order_number} has been updated.`,
    });
    
    // Refresh the orders list
    onOrdersChange();
  }, [toast, onOrdersChange]);

  const handleOrderDelete = useCallback((payload: any) => {
    
    // Show notification for deleted orders
    toast({
      title: "Order Deleted",
      description: `Order ${payload.old.order_number} has been deleted.`,
    });
    
    // Refresh the orders list
    onOrdersChange();
  }, [toast, onOrdersChange]);

  useEffect(() => {
    
    const channel = supabase
      .channel('orders-changes')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'orders'
        },
        handleOrderInsert
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'orders'
        },
        handleOrderUpdate
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'orders'
        },
        handleOrderDelete
      )
      .subscribe((status) => {
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [handleOrderInsert, handleOrderUpdate, handleOrderDelete]);

  return null;
};
