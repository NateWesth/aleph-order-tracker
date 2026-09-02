import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export interface Notification {
  id: string;
  user_id: string;
  type: string;
  title: string;
  message: string;
  order_id: string | null;
  order_number: string | null;
  read: boolean;
  created_at: string;
  metadata?: Record<string, any> | null;
}

export function useNotifications() {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);

  const fetchNotifications = useCallback(async () => {
    if (!user?.id) return;
    try {
      // Materialize time-based alerts on demand; the RPC deduplicates each
      // overdue delivery/collection for 24 hours.
      await (supabase as any).rpc('generate_my_overdue_fulfillment_notifications');
      const [{ data, error }, { count, error: countError }] = await Promise.all([
        supabase
          .from('notifications')
          .select('*')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(100),
        supabase
          .from('notifications')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', user.id)
          .eq('read', false),
      ]);

      if (error) throw error;
      if (countError) throw countError;

      setNotifications((data || []) as unknown as Notification[]);
      setUnreadCount(count || 0);
    } catch (err) {
      console.error('Error fetching notifications:', err);
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  const markAsRead = useCallback(async (notificationId: string) => {
    const { error } = await supabase
      .from('notifications')
      .update({ read: true })
      .eq('id', notificationId);

    if (!error) {
      setNotifications(prev =>
        prev.map(n => n.id === notificationId ? { ...n, read: true } : n)
      );
      setUnreadCount(prev => Math.max(0, prev - 1));
    }
  }, []);

  const markAllAsRead = useCallback(async () => {
    if (!user?.id) return;
    const { error } = await supabase
      .from('notifications')
      .update({ read: true })
      .eq('user_id', user.id)
      .eq('read', false);

    if (!error) {
      setNotifications(prev => prev.map(n => ({ ...n, read: true })));
      setUnreadCount(0);
    }
  }, [user?.id]);

  const markAsUnread = useCallback(async (notificationId: string) => {
    const { error } = await supabase
      .from('notifications')
      .update({ read: false })
      .eq('id', notificationId);

    if (!error) {
      setNotifications(prev => prev.map(n => n.id === notificationId ? { ...n, read: false } : n));
      setUnreadCount(prev => prev + 1);
    }
  }, []);

  const dismiss = useCallback(async (notificationId: string) => {
    const existing = notifications.find(item => item.id === notificationId);
    const { error } = await supabase.from('notifications').delete().eq('id', notificationId);
    if (!error) {
      setNotifications(prev => prev.filter(item => item.id !== notificationId));
      if (existing && !existing.read) setUnreadCount(prev => Math.max(0, prev - 1));
    }
  }, [notifications]);

  const clearAll = useCallback(async () => {
    if (!user?.id) return;
    const { error } = await supabase
      .from('notifications')
      .delete()
      .eq('user_id', user.id);

    if (!error) {
      setNotifications([]);
      setUnreadCount(0);
    }
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id) {
      setNotifications([]);
      setUnreadCount(0);
      setLoading(false);
      return;
    }

    fetchNotifications();

    const channel = supabase
      .channel(`notifications-${user.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          const newNotif = payload.new as Notification;
          setNotifications(prev => [newNotif, ...prev.filter(item => item.id !== newNotif.id)].slice(0, 100));
          setUnreadCount(prev => prev + 1);
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          const updated = payload.new as Notification;
          setNotifications(previous => {
            const existing = previous.find(item => item.id === updated.id);
            if (existing && existing.read !== updated.read) {
              setUnreadCount(count => updated.read ? Math.max(0, count - 1) : count + 1);
            }
            return previous.map(item => item.id === updated.id ? updated : item);
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id, fetchNotifications]);

  return {
    notifications,
    unreadCount,
    loading,
    markAsRead,
    markAsUnread,
    markAllAsRead,
    dismiss,
    clearAll,
    refetch: fetchNotifications,
  };
}
