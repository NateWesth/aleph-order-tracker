
import { useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface UseGlobalRealtimeOrdersProps {
  onOrdersChange: () => void;
  isAdmin: boolean;
  pageType?: 'orders' | 'progress' | 'processing' | 'completed' | 'files' | 'delivery-notes';
}

// Debounce delay for rapid updates
const DEBOUNCE_DELAY = 300;

export const useGlobalRealtimeOrders = ({ 
  onOrdersChange, 
  isAdmin, 
  pageType = 'orders' 
}: UseGlobalRealtimeOrdersProps) => {
  const { toast } = useToast();
  const debounceTimer = useRef<NodeJS.Timeout | null>(null);
  
  // Debounced refresh to prevent rapid successive calls
  const debouncedRefresh = useCallback(() => {
    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current);
    }
    debounceTimer.current = setTimeout(() => {
      onOrdersChange();
    }, DEBOUNCE_DELAY);
  }, [onOrdersChange]);

  const syncLocalStorageWithDatabase = useCallback(async (payload: any) => {
    
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
    
    // Show notification for both admin and client users
    const shouldShowNotification = isAdmin || payload.new.user_id === supabase.auth.getUser()?.then(u => u.data.user?.id);
    
    if (shouldShowNotification) {
      toast({
        title: "New Order Created",
        description: `Order ${payload.new.order_number} has been created.`,
      });
    }
    
    // Refresh the data with debounce
    debouncedRefresh();
  }, [toast, debouncedRefresh, isAdmin, pageType]);

  const handleOrderUpdate = useCallback(async (payload: any) => {
    
    // Show notification for status changes and important updates
    const oldStatus = payload.old?.status;
    const newStatus = payload.new?.status;
    
    if (oldStatus !== newStatus) {
      
      // Sync with localStorage first
      await syncLocalStorageWithDatabase(payload);
      
      // Check if this user should receive notifications
      const currentUser = await supabase.auth.getUser();
      const userId = currentUser.data.user?.id;
      const shouldShowNotification = isAdmin || payload.new.user_id === userId;
      
      if (shouldShowNotification) {
        let message = '';
        switch (newStatus) {
          case 'received':
            message = `Order ${payload.new.order_number} has been received and moved to Progress page.`;
            break;
          case 'in-progress':
            message = `Order ${payload.new.order_number} is now in progress.`;
            break;
          case 'processing':
            message = `Order ${payload.new.order_number} has been completed and moved to Processing page.`;
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
      // Just refresh data for other updates with debounce
      debouncedRefresh();
    }
  }, [toast, debouncedRefresh, isAdmin, pageType, syncLocalStorageWithDatabase]);

  const handleOrderDelete = useCallback(async (payload: any) => {
    
    // Remove from all localStorage arrays
    const orderId = payload.old.id;
    ['progressOrders', 'deliveryOrders', 'processingOrders', 'completedOrders'].forEach(storageKey => {
      const existingOrders = JSON.parse(localStorage.getItem(storageKey) || '[]');
      const filteredOrders = existingOrders.filter((order: any) => order.id !== orderId);
      localStorage.setItem(storageKey, JSON.stringify(filteredOrders));
    });
    
    // Check if this user should receive notifications
    const currentUser = await supabase.auth.getUser();
    const userId = currentUser.data.user?.id;
    const shouldShowNotification = isAdmin || payload.old.user_id === userId;
    
    if (shouldShowNotification) {
      toast({
        title: "Order Deleted",
        description: `Order ${payload.old.order_number} has been deleted.`,
      });
    }
    
    // Refresh the data with debounce
    debouncedRefresh();
  }, [toast, debouncedRefresh, isAdmin, pageType]);

  useEffect(() => {
    
    // Create a unique channel name per page type to avoid conflicts
    const channelName = `orders-realtime-enhanced-${pageType}`;
    
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
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'order_items'
        },
        (payload) => {
          debouncedRefresh();
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'order_purchase_orders'
        },
        (payload) => {
          debouncedRefresh();
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
        } else if (status === 'CHANNEL_ERROR') {
          console.error(`❌ Enhanced real-time subscription error for ${pageType}`);
        }
      });

    return () => {
      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current);
      }
      supabase.removeChannel(channel);
    };
  }, [pageType, handleOrderInsert, handleOrderUpdate, handleOrderDelete]);

  return null;
};
