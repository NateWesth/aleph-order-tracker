import React, { useState, useRef, useEffect, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';

import { Bell, CheckCheck, Trash2, Package, ArrowRightLeft, MessageCircle, X, Inbox, Reply, AtSign, SmilePlus, UserCog } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { useNotifications, Notification } from '@/hooks/useNotifications';
import { formatDistanceToNow } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';

interface NotificationCenterProps {
  onNavigateToOrder?: (orderId: string) => void;
}

const typeConfig: Record<string, { icon: typeof Package; color: string }> = {
  order_created: { icon: Package, color: 'text-emerald-500' },
  order_status_changed: { icon: ArrowRightLeft, color: 'text-blue-500' },
  order_update_message: { icon: MessageCircle, color: 'text-amber-500' },
  order_assigned: { icon: UserCog, color: 'text-primary' },
  fulfillment_assigned: { icon: UserCog, color: 'text-cyan-500' },
  fulfillment_unassigned: { icon: UserCog, color: 'text-muted-foreground' },
  item_comment: { icon: MessageCircle, color: 'text-blue-500' },
  entity_comment: { icon: MessageCircle, color: 'text-blue-500' },
  comment_reply: { icon: Reply, color: 'text-blue-500' },
  comment_mention: { icon: AtSign, color: 'text-warning' },
  comment_reaction: { icon: SmilePlus, color: 'text-blue-500' },
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

  const openTarget = () => {
    if (!notification.read) onRead(notification.id);
    if (notification.order_id && onNavigate) onNavigate(notification.order_id);
    else if (notification.metadata?.kind === "collection") {
      window.dispatchEvent(new CustomEvent("setActiveView", { detail: "fulfillment" }));
      window.setTimeout(() => window.dispatchEvent(new CustomEvent("aleph:open-collection", { detail: notification.metadata?.purchase_order_id })), 60);
    }
  };

  const releaseAssignment = async (event: React.MouseEvent) => {
    event.stopPropagation();
    if (notification.metadata?.kind === "delivery" && notification.order_id) {
      await supabase.from("orders").update({ fulfillment_assigned_to: null } as any).eq("id", notification.order_id);
    } else if (notification.metadata?.kind === "collection" && notification.metadata?.purchase_order_id) {
      await (supabase as any).from("po_collection_state").update({ assigned_to: null }).eq("purchase_order_id", notification.metadata.purchase_order_id);
    }
    onRead(notification.id);
  };

  return (
    <div
      role="button" tabIndex={0}
      onClick={openTarget}
      onKeyDown={(e) => { if (e.key === "Enter") openTarget(); }}
      className={cn(
        "w-full flex items-start gap-3 p-3 text-left transition-colors rounded-lg",
        "hover:bg-muted/60",
        !notification.read && "bg-primary/5",
        notification.type === 'item_comment' && !notification.read && "border border-blue-500/15 bg-blue-500/[0.07] shadow-[0_10px_28px_-24px_rgba(59,130,246,.75)]",
        notification.type === 'entity_comment' && !notification.read && "border border-blue-500/15 bg-blue-500/[0.07] shadow-[0_10px_28px_-24px_rgba(59,130,246,.75)]",
        notification.type === 'comment_mention' && !notification.read && "border border-warning/25 bg-warning/[0.08]"
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
        {notification.type === "fulfillment_assigned" && (
          <div className="mt-2 flex gap-2">
            <Button size="sm" className="h-7 rounded-lg px-2 text-[10px]" onClick={(e) => { e.stopPropagation(); openTarget(); }}>Open</Button>
            <Button size="sm" variant="outline" className="h-7 rounded-lg px-2 text-[10px]" onClick={releaseAssignment}>Release</Button>
          </div>
        )}
      </div>
    </div>
  );
}

export default function NotificationCenter({ onNavigateToOrder }: NotificationCenterProps) {
  const { notifications, unreadCount, loading, markAsRead, markAllAsRead, clearAll } = useNotifications();
  const [isOpen, setIsOpen] = useState(false);
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const [category, setCategory] = useState<'orders' | 'comments'>('orders');
  const panelRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [coords, setCoords] = useState({ top: 0, right: 8 });

  const commentTypes = ['order_update_message', 'item_comment', 'entity_comment', 'comment_reply', 'comment_mention', 'comment_reaction'];
  const isComment = (n: Notification) => commentTypes.includes(n.type);
  const orderNotifications = notifications.filter(n => !isComment(n));
  const commentNotifications = notifications.filter(isComment);
  const categoryNotifications = category === 'comments' ? commentNotifications : orderNotifications;
  const categoryUnread = categoryNotifications.filter(n => !n.read).length;
  const visibleNotifications = filter === 'unread'
    ? categoryNotifications.filter(item => !item.read)
    : categoryNotifications;


  // Position the portalled panel under the bell button
  useLayoutEffect(() => {
    if (!isOpen) return;
    const update = () => {
      const rect = buttonRef.current?.getBoundingClientRect();
      if (!rect) return;
      setCoords({
        top: Math.round(rect.bottom + 8),
        right: Math.max(8, Math.round(window.innerWidth - rect.right)),
      });
    };
    update();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [isOpen]);

  // Close on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      const target = e.target as Node;
      if (panelRef.current?.contains(target)) return;
      if (dropdownRef.current?.contains(target)) return;
      setIsOpen(false);
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
        ref={buttonRef}
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

      {/* Dropdown Panel — portalled so no ancestor can clip or stack above it */}
      {isOpen && createPortal(
        <div
          ref={dropdownRef}
          style={{ top: coords.top, right: coords.right }}
          className="fixed w-[min(360px,calc(100vw-1rem))] max-w-[calc(100vw-1rem)] bg-card border border-border rounded-xl shadow-2xl z-[2147483000] animate-in slide-in-from-top-2 fade-in-0 duration-200"
        >

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

          {/* Category tabs */}
          <div className="grid grid-cols-2 border-b border-border">
            {([
              { value: 'orders' as const, label: 'Order updates', items: orderNotifications },
              { value: 'comments' as const, label: 'Comments & notes', items: commentNotifications },
            ]).map(tab => {
              const tabUnread = tab.items.filter(n => !n.read).length;
              return (
                <button
                  key={tab.value}
                  type="button"
                  onClick={() => setCategory(tab.value)}
                  className={cn(
                    "relative flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold transition-colors",
                    category === tab.value
                      ? "text-foreground after:absolute after:inset-x-3 after:bottom-0 after:h-0.5 after:rounded-full after:bg-primary"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {tab.label}
                  {tabUnread > 0 && (
                    <span className="min-w-[16px] h-4 px-1 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center">
                      {tabUnread > 99 ? '99+' : tabUnread}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-1 border-b border-border px-3 py-2">
            {(['all', 'unread'] as const).map(value => (
              <button
                key={value}
                type="button"
                onClick={() => setFilter(value)}
                className={cn(
                  "rounded-full px-3 py-1 text-xs font-semibold transition-colors",
                  filter === value ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
                )}
              >
                {value === 'all' ? `All ${categoryNotifications.length}` : `Unread ${categoryUnread}`}
              </button>
            ))}
          </div>

          {/* Notification List */}
          <ScrollArea className="max-h-[400px]">
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <div className="h-5 w-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              </div>
            ) : visibleNotifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-muted-foreground">
                <Inbox className="h-8 w-8 mb-2 opacity-30" />
                <p className="text-sm">
                  {filter === 'unread'
                    ? 'You’re all caught up'
                    : category === 'comments'
                      ? 'No comments or notes yet'
                      : 'No order updates yet'}
                </p>
              </div>

            ) : (
              <div className="py-1 px-1">
                {visibleNotifications.map((notification) => (
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
        </div>,
        document.body
      )}

    </div>
  );
}
