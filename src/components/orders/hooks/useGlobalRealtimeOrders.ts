
import { useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface UseGlobalRealtimeOrdersProps {
  onOrdersChange: () => void;
  isAdmin: boolean;
  pageType?: 'orders' | 'progress' | 'processing' | 'completed' | 'files' | 'delivery-notes';
}

export const useGlobalRealtimeOrders = ({ 
  onOrdersChange, 
  isAdmin, 
  pageType = 'orders' 
}: UseGlobalRealtimeOrdersProps) => {
  const { toast } = useToast();

  const handleOrderInsert = useCallback((payload: any) => {
    console.log(`New order created (${pageType}):`, payload.new);
    
    // Show notification only for admins or if it's the user's own order
    if (isAdmin) {
      toast({
        title: "New Order Created",
        description: `Order ${payload.new.order_number} has been created.`,
      });
    }
    
    // Refresh the data
    onOrdersChange();
  }, [toast, onOrdersChange, isAdmin, pageType]);

  const handleOrderUpdate = useCallback((payload: any) => {
    console.log(`Order updated (${pageType}):`, payload.new);
    
    // Show notification for status changes and important updates
    const oldStatus = payload.old?.status;
    const newStatus = payload.new?.status;
    
    if (isAdmin && oldStatus !== newStatus) {
      toast({
        title: "Order Status Updated",
        description: `Order ${payload.new.order_number} status changed from ${oldStatus || 'pending'} to ${newStatus}.`,
      });
    }
    
    // Refresh the data
    onOrdersChange();
  }, [toast, onOrdersChange, isAdmin, pageType]);

  const handleOrderDelete = useCallback((payload: any) => {
    console.log(`Order deleted (${pageType}):`, payload.old);
    
    // Show notification only for admins
    if (isAdmin) {
      toast({
        title: "Order Deleted",
        description: `Order ${payload.old.order_number} has been deleted.`,
      });
    }
    
    // Refresh the data
    onOrdersChange();
  }, [toast, onOrdersChange, isAdmin, pageType]);

  useEffect(() => {
    console.log(`Setting up global real-time order subscriptions for ${pageType}...`);
    
    // Create a unique channel name per page type to avoid conflicts
    const channelName = `orders-realtime-${pageType}-${Date.now()}`;
    
    const channel = supabase
      .channel(channelName)
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
        console.log(`Real-time subscription status for ${pageType}:`, status);
        if (status === 'SUBSCRIBED') {
          console.log(`✅ Successfully subscribed to real-time updates for ${pageType}`);
        } else if (status === 'CHANNEL_ERROR') {
          console.error(`❌ Real-time subscription error for ${pageType}`);
        }
      });

    return () => {
      console.log(`Cleaning up real-time subscriptions for ${pageType}...`);
      supabase.removeChannel(channel);
    };
  }, [handleOrderInsert, handleOrderUpdate, handleOrderDelete, pageType]);

  return null;
};
