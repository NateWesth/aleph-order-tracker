
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

  const syncLocalStorageWithDatabase = useCallback(async (payload: any) => {
    console.log(`Syncing local storage with database change (${pageType}):`, payload.new);
    
    const updatedOrder = payload.new;
    const orderId = updatedOrder.id;
    const newStatus = updatedOrder.status;
    
    // Helper function to update order in localStorage array
    const updateOrderInStorage = (storageKey: string, shouldInclude: boolean) => {
      const existingOrders = JSON.parse(localStorage.getItem(storageKey) || '[]');
      const filteredOrders = existingOrders.filter((order: any) => order.id !== orderId);
      
      if (shouldInclude) {
        // Create order object for localStorage
        const orderForStorage = {
          id: orderId,
          orderNumber: updatedOrder.order_number,
          companyName: updatedOrder.company_name || "Unknown Company",
          orderDate: new Date(updatedOrder.created_at),
          dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days from now
          status: newStatus,
          progress: newStatus === 'received' ? 25 : newStatus === 'in-progress' ? 50 : newStatus === 'processing' ? 75 : 100,
          progressStage: newStatus === 'received' ? 'awaiting-stock' : newStatus === 'in-progress' ? 'packing' : 'completed',
          completedDate: newStatus === 'completed' ? new Date() : undefined,
          items: [
            {
              id: "1",
              name: updatedOrder.description || "Order items",
              quantity: 1,
              delivered: newStatus === 'completed' ? 1 : 0,
              completed: newStatus === 'completed'
            }
          ],
          files: [] // Initialize empty files array
        };
        
        filteredOrders.push(orderForStorage);
      }
      
      localStorage.setItem(storageKey, JSON.stringify(filteredOrders));
    };

    // Update localStorage based on status
    switch (newStatus) {
      case 'received':
      case 'in-progress':
        updateOrderInStorage('progressOrders', true);
        updateOrderInStorage('deliveryOrders', true);
        updateOrderInStorage('processingOrders', false);
        updateOrderInStorage('completedOrders', false);
        break;
      
      case 'processing':
        updateOrderInStorage('progressOrders', false);
        updateOrderInStorage('deliveryOrders', false);
        updateOrderInStorage('processingOrders', true);
        updateOrderInStorage('completedOrders', false);
        break;
      
      case 'completed':
        updateOrderInStorage('progressOrders', false);
        updateOrderInStorage('deliveryOrders', false);
        updateOrderInStorage('processingOrders', false);
        updateOrderInStorage('completedOrders', true);
        break;
      
      default:
        // For pending status, remove from all progress-related storage
        updateOrderInStorage('progressOrders', false);
        updateOrderInStorage('deliveryOrders', false);
        updateOrderInStorage('processingOrders', false);
        updateOrderInStorage('completedOrders', false);
        break;
    }
    
    // Trigger refresh for all pages
    onOrdersChange();
  }, [onOrdersChange, pageType]);

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
    
    if (oldStatus !== newStatus) {
      // Sync with localStorage
      syncLocalStorageWithDatabase(payload);
      
      if (isAdmin) {
        let message = '';
        switch (newStatus) {
          case 'received':
            message = `Order ${payload.new.order_number} has been received and moved to Progress page.`;
            break;
          case 'in-progress':
            message = `Order ${payload.new.order_number} is now in progress.`;
            break;
          case 'processing':
            message = `Order ${payload.new.order_number} has been moved to Processing page.`;
            break;
          case 'completed':
            message = `Order ${payload.new.order_number} has been completed and moved to Completed/Delivery Notes pages.`;
            break;
          default:
            message = `Order ${payload.new.order_number} status changed to ${newStatus}.`;
        }
        
        toast({
          title: "Order Status Updated",
          description: message,
        });
      }
    } else {
      // Just refresh data for other updates
      onOrdersChange();
    }
  }, [toast, onOrdersChange, isAdmin, pageType, syncLocalStorageWithDatabase]);

  const handleOrderDelete = useCallback((payload: any) => {
    console.log(`Order deleted (${pageType}):`, payload.old);
    
    // Remove from all localStorage arrays
    const orderId = payload.old.id;
    ['progressOrders', 'deliveryOrders', 'processingOrders', 'completedOrders'].forEach(storageKey => {
      const existingOrders = JSON.parse(localStorage.getItem(storageKey) || '[]');
      const filteredOrders = existingOrders.filter((order: any) => order.id !== orderId);
      localStorage.setItem(storageKey, JSON.stringify(filteredOrders));
    });
    
    // Show notification only for admins
    if (isAdmin) {
      toast({
        title: "Order Deleted",
        description: `Order ${payload.old.order_number} has been deleted from all systems.`,
      });
    }
    
    // Refresh the data
    onOrdersChange();
  }, [toast, onOrdersChange, isAdmin, pageType]);

  useEffect(() => {
    console.log(`Setting up enhanced real-time order subscriptions for ${pageType}...`);
    
    // Create a unique channel name per page type to avoid conflicts
    const channelName = `orders-realtime-enhanced-${pageType}-${Date.now()}`;
    
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
        console.log(`Enhanced real-time subscription status for ${pageType}:`, status);
        if (status === 'SUBSCRIBED') {
          console.log(`✅ Successfully subscribed to enhanced real-time updates for ${pageType}`);
        } else if (status === 'CHANNEL_ERROR') {
          console.error(`❌ Enhanced real-time subscription error for ${pageType}`);
        }
      });

    return () => {
      console.log(`Cleaning up enhanced real-time subscriptions for ${pageType}...`);
      supabase.removeChannel(channel);
    };
  }, [handleOrderInsert, handleOrderUpdate, handleOrderDelete, pageType]);

  return null;
};
