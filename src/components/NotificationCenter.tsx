import React, { useState, useRef, useEffect } from 'react';
import { Bell, Check, CheckCheck, Trash2, Package, ArrowRightLeft, MessageCircle, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { useNotifications, Notification } from '@/hooks/useNotifications';
import { formatDistanceToNow } from 'date-fns';

interface NotificationCenterProps {
  onNavigateToOrder?: (orderId: string) => void;
}

const typeConfig: Record<string, { icon: typeof Package; color: string }> = {
  order_created: { icon: Package, color: 'text-emerald-500' },
  order_status_changed: { icon: ArrowRightLeft, color: 'text-blue-500' },
  order_update_message: { icon: MessageCircle, color: 'text-amber-500' },
};

function NotificationItem({
  notification,
  onRead,
  onNavigate,
}: {
  notification: Notification;
  onRead: (id: string) => void;
  onNavigate?: (orderId: string) => void;
}) {
  const config = typeConfig[notification.type] || typeConfig.order_created;
  const Icon = config.icon;

  const timeAgo = formatDistanceToNow(new Date(notification.created_at), { addSuffix: true });

  return (
    <button
      onClick={() => {
        if (!notification.read) onRead(notification.id);
        if (notification.order_id && onNavigate) onNavigate(notification.order_id);
      }}
      className={cn(
        "w-full flex items-start gap-3 p-3 text-left transition-colors rounded-lg",
        "hover:bg-muted/60",
        !notification.read && "bg-primary/5"
      )}
    >
      <div className={cn("mt-0.5 shrink-0", config.color)}>
        <Icon className="h-4 w-4" />
      </div>
      <div className="flex-1 min-w-0 space-y-0.5">
        <div className="flex items-center gap-2">
          <span className={cn("text-sm font-medium truncate", !notification.read && "text-foreground font-semibold")}>
            {notification.title}
          </span>
          {!notification.read && (
            <span className="shrink-0 h-2 w-2 rounded-full bg-primary" />
          )}
        </div>
        <p className="text-xs text-muted-foreground line-clamp-2">{notification.message}</p>
        <p className="text-[11px] text-muted-foreground/70">{timeAgo}</p>
      </div>
    </button>
  );
}

export default function NotificationCenter({ onNavigateToOrder }: NotificationCenterProps) {
  const { notifications, unreadCount, loading, markAsRead, markAllAsRead, clearAll } = useNotifications();
  const [isOpen, setIsOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen]);

  return (
    <div className="relative" ref={panelRef}>
      {/* Bell Button */}
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setIsOpen(prev => !prev)}
        className="rounded-xl text-muted-foreground hover:text-foreground relative"
      >
        <Bell className="h-[18px] w-[18px]" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] flex items-center justify-center text-[10px] font-bold bg-primary text-primary-foreground rounded-full px-1 animate-in zoom-in-50">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </Button>

      {/* Dropdown Panel */}
      {isOpen && (
        <div className="fixed sm:absolute right-2 sm:right-0 left-2 sm:left-auto top-14 sm:top-full sm:mt-2 sm:w-[360px] bg-card border border-border rounded-xl shadow-lg z-[100] animate-in slide-in-from-top-2 fade-in-0 duration-200">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold">Notifications</h3>
              {unreadCount > 0 && (
                <Badge variant="secondary" className="text-xs px-1.5 py-0">
                  {unreadCount} new
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-1">
              {unreadCount > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={markAllAsRead}
                  className="h-7 text-xs text-muted-foreground hover:text-foreground"
                >
                  <CheckCheck className="h-3.5 w-3.5 mr-1" />
                  Read all
                </Button>
              )}
              {notifications.length > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={clearAll}
                  className="h-7 text-xs text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              )}
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setIsOpen(false)}
                className="h-7 w-7 text-muted-foreground"
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>

          {/* Notification List */}
          <ScrollArea className="max-h-[400px]">
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <div className="h-5 w-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              </div>
            ) : notifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-muted-foreground">
                <Bell className="h-8 w-8 mb-2 opacity-30" />
                <p className="text-sm">No notifications yet</p>
              </div>
            ) : (
              <div className="py-1 px-1">
                {notifications.map((notification) => (
                  <NotificationItem
                    key={notification.id}
                    notification={notification}
                    onRead={markAsRead}
                    onNavigate={(orderId) => {
                      setIsOpen(false);
                      onNavigateToOrder?.(orderId);
                    }}
                  />
                ))}
              </div>
            )}
          </ScrollArea>
        </div>
      )}
    </div>
  );
}
