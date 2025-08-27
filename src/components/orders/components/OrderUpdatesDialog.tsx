import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Send, MessageCircle, X } from 'lucide-react';
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { format } from 'date-fns';

interface OrderUpdate {
  id: string;
  order_id: string;
  user_id: string;
  message: string;
  parent_id: string | null;
  created_at: string;
  user_profile?: {
    full_name: string;
    email: string;
  };
}

interface OrderUpdatesDialogProps {
  isOpen: boolean;
  onClose: () => void;
  orderId: string;
  orderNumber: string;
  unreadCount: number;
  onUnreadCountChange: (count: number) => void;
}

export const OrderUpdatesDialog: React.FC<OrderUpdatesDialogProps> = ({
  isOpen,
  onClose,
  orderId,
  orderNumber,
  unreadCount,
  onUnreadCountChange
}) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [updates, setUpdates] = useState<OrderUpdate[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen && orderId) {
      fetchUpdates();
      markAllAsRead();
    }
  }, [isOpen, orderId]);

  const fetchUpdates = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('order_updates')
        .select(`
          id,
          order_id,
          user_id,
          message,
          parent_id,
          created_at,
          profiles!inner(full_name, email)
        `)
        .eq('order_id', orderId)
        .order('created_at', { ascending: true });

      if (error) throw error;
      
      // Transform the data to match our interface
      const transformedData = (data || []).map(item => ({
        ...item,
        user_profile: Array.isArray(item.profiles) ? item.profiles[0] : item.profiles
      }));
      
      setUpdates(transformedData);
    } catch (error) {
      console.error('Error fetching updates:', error);
      toast({
        title: "Error",
        description: "Failed to load updates",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const markAllAsRead = async () => {
    if (!user?.id) return;
    
    try {
      // Mark all updates in this order as read
      const { data: unreadUpdates } = await supabase
        .from('order_updates')
        .select('id')
        .eq('order_id', orderId)
        .neq('user_id', user.id);

      if (unreadUpdates && unreadUpdates.length > 0) {
        const readPromises = unreadUpdates.map(update =>
          supabase.rpc('mark_order_update_as_read', {
            update_id: update.id,
            user_uuid: user.id
          })
        );
        
        await Promise.all(readPromises);
        onUnreadCountChange(0);
      }
    } catch (error) {
      console.error('Error marking updates as read:', error);
    }
  };

  const sendUpdate = async () => {
    if (!newMessage.trim() || !user?.id) return;

    setSubmitting(true);
    try {
      const { data, error } = await supabase
        .from('order_updates')
        .insert({
          order_id: orderId,
          user_id: user.id,
          message: newMessage.trim()
        })
        .select(`
          id,
          order_id,
          user_id,
          message,
          parent_id,
          created_at,
          profiles!inner(full_name, email)
        `)
        .single();

      if (error) throw error;

      // Transform the data to match our interface
      const transformedUpdate = {
        ...data,
        user_profile: Array.isArray(data.profiles) ? data.profiles[0] : data.profiles
      };

      setUpdates(prev => [...prev, transformedUpdate]);
      setNewMessage('');
      
      toast({
        title: "Update sent",
        description: "Your update has been added to the order",
      });
    } catch (error: any) {
      console.error('Error sending update:', error);
      toast({
        title: "Error",
        description: "Failed to send update: " + error.message,
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && e.ctrlKey) {
      sendUpdate();
    }
  };

  const getUserInitials = (profile: any) => {
    if (!profile?.full_name) return '?';
    return profile.full_name
      .split(' ')
      .map((n: string) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col" aria-describedby="order-updates-description">
        <DialogHeader className="flex flex-row items-center justify-between">
          <DialogTitle className="text-xl font-semibold flex items-center gap-2">
            <MessageCircle size={20} />
            Updates - Order {orderNumber}
          </DialogTitle>
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            className="h-8 w-8 p-0"
          >
            <X size={16} />
          </Button>
        </DialogHeader>
        
        <div id="order-updates-description" className="sr-only">
          Order updates and conversation history for {orderNumber}
        </div>
        
        <div className="flex-1 flex flex-col gap-4 min-h-0">
          {/* Updates List */}
          <ScrollArea className="flex-1 border rounded-lg p-4">
            {loading ? (
              <div className="flex items-center justify-center h-32">
                <div className="text-lg">Loading updates...</div>
              </div>
            ) : updates.length === 0 ? (
              <div className="flex items-center justify-center h-32 text-muted-foreground">
                No updates yet. Start the conversation!
              </div>
            ) : (
              <div className="space-y-4">
                {updates.map((update) => (
                  <div key={update.id} className="flex gap-3">
                    <Avatar className="h-8 w-8 flex-shrink-0">
                      <AvatarFallback className="text-xs">
                        {getUserInitials(update.user_profile)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm">
                          {update.user_profile?.full_name || update.user_profile?.email || 'Unknown User'}
                        </span>
                        {update.user_id === user?.id && (
                          <Badge variant="outline" className="text-xs">You</Badge>
                        )}
                        <span className="text-xs text-muted-foreground">
                          {format(new Date(update.created_at), 'MMM dd, HH:mm')}
                        </span>
                      </div>
                      <div className="text-sm bg-muted p-3 rounded-lg">
                        {update.message}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>

          {/* New Message Input */}
          <div className="space-y-2">
            <Textarea
              placeholder="Type your update here... (Ctrl+Enter to send)"
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              onKeyDown={handleKeyPress}
              rows={3}
              className="resize-none"
            />
            <div className="flex justify-between items-center">
              <span className="text-xs text-muted-foreground">
                Ctrl+Enter to send
              </span>
              <Button
                onClick={sendUpdate}
                disabled={!newMessage.trim() || submitting}
                size="sm"
                className="flex items-center gap-2"
              >
                <Send size={14} />
                {submitting ? 'Sending...' : 'Send Update'}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};