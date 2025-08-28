import { useState, useEffect } from 'react';
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export const useOrderUpdates = (orderId: string | null) => {
  const { user } = useAuth();
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    if (!orderId || !user?.id) {
      setUnreadCount(0);
      return;
    }

    const fetchUnreadCount = async () => {
      try {
        const { data, error } = await supabase.rpc('get_unread_updates_count', {
          order_uuid: orderId,
          user_uuid: user.id
        });

        if (error) throw error;
        setUnreadCount(data || 0);
      } catch (error) {
        console.error('Error fetching unread count:', error);
        setUnreadCount(0);
      }
    };

    fetchUnreadCount();

    // Set up real-time subscription for new updates
    const channel = supabase
      .channel(`order-updates-${orderId}-${user.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'order_updates',
          filter: `order_id=eq.${orderId}`
        },
        (payload) => {
          // Only count updates from other users
          if (payload.new.user_id !== user.id) {
            setUnreadCount(prev => prev + 1);
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'order_update_reads',
          filter: `user_id=eq.${user.id}`
        },
        (payload) => {
          // When this user marks something as read, refresh count
          fetchUnreadCount();
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'order_update_reads',
          filter: `user_id=eq.${user.id}`
        },
        () => {
          // If read status is removed, refresh count
          fetchUnreadCount();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [orderId, user?.id]);

  const updateUnreadCount = (newCount: number) => {
    setUnreadCount(newCount);
  };

  return {
    unreadCount,
    updateUnreadCount
  };
};