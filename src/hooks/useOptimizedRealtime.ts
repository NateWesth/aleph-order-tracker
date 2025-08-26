import { useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface RealtimeSubscription {
  channel: any;
  isActive: boolean;
  lastActivity: number;
}

// Global subscription manager to prevent duplicate subscriptions
const subscriptionManager = new Map<string, RealtimeSubscription>();
const SUBSCRIPTION_TIMEOUT = 30000; // 30 seconds

export interface UseOptimizedRealtimeProps {
  table: string;
  event?: 'INSERT' | 'UPDATE' | 'DELETE' | '*';
  filter?: { column: string; value: string };
  onInsert?: (payload: any) => void;
  onUpdate?: (payload: any) => void;
  onDelete?: (payload: any) => void;
  enabled?: boolean;
}

export function useOptimizedRealtime({
  table,
  event = '*',
  filter,
  onInsert,
  onUpdate,
  onDelete,
  enabled = true
}: UseOptimizedRealtimeProps) {
  const { toast } = useToast();
  const callbacksRef = useRef({ onInsert, onUpdate, onDelete });
  
  // Update callbacks without triggering re-subscription
  callbacksRef.current = { onInsert, onUpdate, onDelete };

  // Create unique subscription key
  const subscriptionKey = `${table}_${event}_${filter ? `${filter.column}:${filter.value}` : 'all'}`;

  const setupSubscription = useCallback(() => {
    if (!enabled) return;

    const existingSubscription = subscriptionManager.get(subscriptionKey);
    const now = Date.now();

    // Reuse existing subscription if it's still active and recent
    if (existingSubscription?.isActive && 
        (now - existingSubscription.lastActivity) < SUBSCRIPTION_TIMEOUT) {
      console.log(`🔄 Reusing existing subscription for ${subscriptionKey}`);
      existingSubscription.lastActivity = now;
      return existingSubscription.channel;
    }

    // Clean up old subscription if it exists
    if (existingSubscription?.channel) {
      console.log(`🧹 Cleaning up old subscription for ${subscriptionKey}`);
      supabase.removeChannel(existingSubscription.channel);
    }

    console.log(`📡 Setting up new optimized real-time subscription for ${subscriptionKey}`);

    const channelName = `optimized-${subscriptionKey}-${Date.now()}`;
    let channel = supabase.channel(channelName);

    // Add event handlers based on what's requested
    if (event === '*' || event === 'INSERT') {
      channel = channel.on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: table,
          ...(filter && { filter: `${filter.column}=eq.${filter.value}` })
        },
        (payload) => {
          console.log(`📥 INSERT event for ${table}:`, payload.new);
          callbacksRef.current.onInsert?.(payload);
        }
      );
    }

    if (event === '*' || event === 'UPDATE') {
      channel = channel.on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: table,
          ...(filter && { filter: `${filter.column}=eq.${filter.value}` })
        },
        (payload) => {
          console.log(`📝 UPDATE event for ${table}:`, payload.new);
          callbacksRef.current.onUpdate?.(payload);
        }
      );
    }

    if (event === '*' || event === 'DELETE') {
      channel = channel.on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: table,
          ...(filter && { filter: `${filter.column}=eq.${filter.value}` })
        },
        (payload) => {
          console.log(`🗑️ DELETE event for ${table}:`, payload.old);
          callbacksRef.current.onDelete?.(payload);
        }
      );
    }

    // Subscribe and handle status
    channel.subscribe((status) => {
      console.log(`📡 Subscription status for ${subscriptionKey}:`, status);
      
      if (status === 'SUBSCRIBED') {
        console.log(`✅ Successfully subscribed to ${subscriptionKey}`);
      } else if (status === 'CHANNEL_ERROR') {
        console.error(`❌ Subscription error for ${subscriptionKey}`);
        toast({
          title: "Connection Issue",
          description: `Real-time updates temporarily unavailable for ${table}`,
          variant: "destructive",
        });
      }
    });

    // Store subscription in manager
    subscriptionManager.set(subscriptionKey, {
      channel,
      isActive: true,
      lastActivity: now
    });

    return channel;
  }, [subscriptionKey, enabled, table, event, filter, toast]);

  // Cleanup function
  const cleanup = useCallback(() => {
    const subscription = subscriptionManager.get(subscriptionKey);
    if (subscription) {
      console.log(`🧹 Cleaning up subscription for ${subscriptionKey}`);
      subscription.isActive = false;
      
      // Delay actual channel removal to allow for quick re-subscriptions
      setTimeout(() => {
        const currentSubscription = subscriptionManager.get(subscriptionKey);
        if (currentSubscription && !currentSubscription.isActive) {
          supabase.removeChannel(currentSubscription.channel);
          subscriptionManager.delete(subscriptionKey);
          console.log(`🗑️ Removed subscription for ${subscriptionKey}`);
        }
      }, 1000);
    }
  }, [subscriptionKey]);

  useEffect(() => {
    const channel = setupSubscription();
    
    return cleanup;
  }, [setupSubscription, cleanup]);

  // Update activity timestamp periodically to keep subscription alive
  useEffect(() => {
    if (!enabled) return;

    const interval = setInterval(() => {
      const subscription = subscriptionManager.get(subscriptionKey);
      if (subscription?.isActive) {
        subscription.lastActivity = Date.now();
      }
    }, 10000); // Update every 10 seconds

    return () => clearInterval(interval);
  }, [subscriptionKey, enabled]);

  return {
    isConnected: subscriptionManager.get(subscriptionKey)?.isActive || false
  };
}

// Utility function to clean up all subscriptions
export function cleanupAllSubscriptions() {
  console.log('🧹 Cleaning up all real-time subscriptions');
  subscriptionManager.forEach((subscription, key) => {
    subscription.isActive = false;
    supabase.removeChannel(subscription.channel);
    console.log(`🗑️ Cleaned up subscription: ${key}`);
  });
  subscriptionManager.clear();
}
