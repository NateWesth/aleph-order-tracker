import { useState, useEffect } from 'react';
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export const useGlobalUnreadCount = () => {
  const { user } = useAuth();
  const [unreadOrderUpdates, setUnreadOrderUpdates] = useState(0);
  const [pendingOrdersCount, setPendingOrdersCount] = useState(0);

  useEffect(() => {
    if (!user?.id) {
      setUnreadOrderUpdates(0);
      setPendingOrdersCount(0);
      return;
    }

    const fetchCounts = async () => {
      try {
        // Count total unread order updates
        const { data: allUpdates, error: updatesError } = await supabase
          .from('order_updates')
          .select('id, user_id');

        if (updatesError) throw updatesError;

        // Get read updates for this user
        const { data: readUpdates, error: readsError } = await supabase
          .from('order_update_reads')
          .select('order_update_id')
          .eq('user_id', user.id);

        if (readsError) throw readsError;

        const readIds = new Set(readUpdates?.map(r => r.order_update_id) || []);
        
        // Count unread updates (excluding user's own updates)
        const unreadCount = allUpdates?.filter(
          update => update.user_id !== user.id && !readIds.has(update.id)
        ).length || 0;

        setUnreadOrderUpdates(unreadCount);

        // Count pending orders (status = 'pending')
        const { count: pendingCount, error: pendingError } = await supabase
          .from('orders')
          .select('*', { count: 'exact', head: true })
          .eq('status', 'pending');

        if (pendingError) throw pendingError;
        setPendingOrdersCount(pendingCount || 0);

      } catch (error) {
        console.error('Error fetching global counts:', error);
      }
    };

    fetchCounts();

    // Real-time subscriptions
    const channel = supabase
      .channel(`global-counts-${user.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'order_updates' },
        () => fetchCounts()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'order_update_reads' },
        () => fetchCounts()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'orders' },
        () => fetchCounts()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id]);

  return {
    unreadOrderUpdates,
    pendingOrdersCount,
    totalNotifications: unreadOrderUpdates + pendingOrdersCount
  };
};
