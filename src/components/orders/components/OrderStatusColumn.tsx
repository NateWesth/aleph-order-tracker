import { useState, useCallback, memo } from "react";
import { useDroppable, useDraggable } from "@dnd-kit/core";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Trash2, ArrowRight, Package, PackageCheck, ChevronDown, Undo2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { cn } from "@/lib/utils";
import { useTheme } from "@/contexts/ThemeContext";
import { useIsMobile } from "@/hooks/use-mobile";
import SwipeableCard from "@/components/ui/SwipeableCard";
import OrderQuickPeek from "./OrderQuickPeek";
import OrderTags from "./OrderTags";
import OrderDetailsDialog from "./OrderDetailsDialog";
import CircularProgress from "@/components/ui/CircularProgress";

interface OrderItem {
  id: string;
  name: string;
  code: string | null;
  quantity: number;
  stock_status: string;
  totalQuantity?: number;
}

interface Order {
  id: string;
  order_number: string;
  description: string | null;
  status: string | null;
  urgency: string | null;
  company_id: string | null;
  user_id: string | null;
  created_at: string | null;
  companyName?: string;
  creatorName?: string;
  items?: OrderItem[];
  reference?: string | null;
  boardStage?: string;
}

interface StatusConfig {
  key: string;
  label: string;
  color: string;
  bgColor: string;
  customColor?: string;
  nextStatus?: string;
  nextLabel?: string;
  prevStatus?: string;
  prevLabel?: string;
}

interface OrderStatusColumnProps {
  config: StatusConfig;
  orders: Order[];
  onMoveOrder: (order: Order, newStatus: string) => void;
  onDeleteOrder: (order: Order) => void;
  onSetItemStockStatus?: (itemId: string, newStatus: string) => void;
  onBulkSetItemsStatus?: (itemIds: string[], newStatus: string) => void;
  canEditItems?: boolean;
  isExpanded?: boolean;
  onToggleExpand?: () => void;
  selectedOrderIds?: Set<string>;
  onToggleOrderSelection?: (orderId: string) => void;
  groupByClient?: boolean;
  allTags?: { id: string; name: string; color: string }[];
  tagAssignments?: Map<string, string[]>;
  onTagsChanged?: () => void;

  itemsBubble?: {
    orderId: string;
    columnKey: string;
  } | null;
  onOpenItemsBubble?: (orderId: string) => void;
  onCloseItemsBubble?: () => void;
}

function DraggableCard({ id, children, disabled }: { id: string; children: React.ReactNode; disabled?: boolean }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id,
    disabled,
  });

  const style: React.CSSProperties = transform
    ? {
        transform: `translate(${transform.x}px, ${transform.y}px)`,
        opacity: isDragging ? 0.5 : 1,
        zIndex: isDragging ? 50 : undefined,
      }
    : {};

  return (
    <div ref={setNodeRef} style={style} {...listeners} {...attributes}>
      {children}
    </div>
  );
}

function OrderStatusColumn({
  config,
  orders,
  onMoveOrder,
  onDeleteOrder,
  onSetItemStockStatus,
  onBulkSetItemsStatus,
  canEditItems = false,
  isExpanded = true,
  onToggleExpand,
  selectedOrderIds,
  onToggleOrderSelection,
  groupByClient = false,
  allTags = [],
  tagAssignments,
  onTagsChanged,
  itemsBubble,
  onOpenItemsBubble,
  onCloseItemsBubble,
}: OrderStatusColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id: config.key });
  const { stockStatusColors } = useTheme();
  const isMobile = useIsMobile();

  const [expandedOrders, setExpandedOrders] = useState<Set<string>>(new Set());
  const [collapsedClients, setCollapsedClients] = useState<Set<string>>(new Set());
  const [detailsOrder, setDetailsOrder] = useState<Order | null>(null);
  const [detailsTab, setDetailsTab] = useState<"details" | "pos" | "activity">("pos");

  const effectiveIsExpanded = isMobile ? isExpanded : true;

  const CLIENT_COLORS = [
    "bg-primary/10 text-primary",
    "bg-emerald-500/10 text-emerald-600",
    "bg-violet-500/10 text-violet-600",
    "bg-amber-500/10 text-amber-600",
    "bg-cyan-500/10 text-cyan-600",
    "bg-rose-500/10 text-rose-600",
  ];

  const clientGroups = groupByClient
    ? (() => {
        const groups = new Map<string, Order[]>();

        orders.forEach((order) => {
          const key = order.companyName || "No Client";

          if (!groups.has(key)) {
            groups.set(key, []);
          }

          groups.get(key)!.push(order);
        });

        return groups;
      })()
    : null;

  const toggleExpanded = useCallback((orderId: string) => {
    setExpandedOrders((prev) => {
      const next = new Set(prev);

      if (next.has(orderId)) {
        next.delete(orderId);
      } else {
        next.add(orderId);
      }

      return next;
    });
  }, []);

  const getUrgencyBadge = (urgency: string | null) => {
    switch (urgency) {
      case "urgent":
        return (
          <Badge variant="destructive" className="text-[10px] font-semibold px-1.5 py-0">
            Urgent
          </Badge>
        );

      case "high":
        return (
          <Badge className="bg-amber-500 hover:bg-amber-500 text-white text-[10px] font-semibold px-1.5 py-0">
            High
          </Badge>
        );

      case "low":
        return (
          <Badge variant="secondary" className="text-[10px] font-medium px-1.5 py-0">
            Low
          </Badge>
        );

      default:
        return null;
    }
  };

  const STAGE_PROGRESS: Record<string, number> = {
    "awaiting-stock": 15,
    ordered: 40,
    "in-stock": 65,
    "ready-for-delivery": 90,
    completed: 100,
  };

  const getOrderProgress = (order: Order) => STAGE_PROGRESS[order.boardStage || ""] ?? 15;

  const getItemStockSummary = (items: OrderItem[] | undefined) => {
    if (!items || items.length === 0) return null;

    return {
      units: items.reduce((sum, i) => sum + (i.quantity || 0), 0),
    };
  };

  return (
    <>
      <style>{`
        /*
         * STEPS 4–7
         *
         * Step 4:
         * Subtle elastic overshoot / bounce.
         *
         * Step 5:
         * Shadow + glow trail follows the expansion point.
         *
         * Step 6:
         * Main animation is kept inside the 500–650ms range so it
         * feels responsive enough for a real business application.
         *
         * Step 7:
         * All existing drag/drop, scrolling and mobile behavior remains
         * untouched. These animations only affect the visual bubble/card
         * connection when the bubble is opened.
         */

        @keyframes order-card-bubble-elastic {
          0% {
            transform: translateX(0) scale(1);
            filter: drop-shadow(0 0 0 transparent);
          }

          20% {
            transform: translateX(3px) scale(1.012);
          }

          43% {
            transform: translateX(7px) scale(1.022);
            filter: drop-shadow(
              8px 0 10px hsl(var(--primary) / 0.10)
            );
          }

          61% {
            transform: translateX(4px) scale(1.008);
            filter: drop-shadow(
              5px 0 8px hsl(var(--primary) / 0.08)
            );
          }

          77% {
            transform: translateX(1.5px) scale(1.002);
            filter: drop-shadow(
              2px 0 5px hsl(var(--primary) / 0.04)
            );
          }

          89% {
            transform: translateX(-0.5px) scale(1.001);
          }

          100% {
            transform: translateX(0) scale(1);
            filter: drop-shadow(0 0 0 transparent);
          }
        }

        @keyframes order-bubble-elastic-grow {
          0% {
            opacity: 0;
            transform-origin: left center;
            transform:
              translateX(-12px)
              scaleX(0.10)
              scaleY(0.78);
            border-radius: 1rem;
            box-shadow:
              0 0 0 0 hsl(var(--primary) / 0),
              0 0 0 0 hsl(var(--primary) / 0);
          }

          13% {
            opacity: 0.22;
            transform:
              translateX(-8px)
              scaleX(0.28)
              scaleY(0.84);
            box-shadow:
              -6px 0 12px 2px hsl(var(--primary) / 0.10);
          }

          31% {
            opacity: 0.65;
            transform:
              translateX(-3px)
              scaleX(0.62)
              scaleY(0.93);
            box-shadow:
              -8px 0 18px 3px hsl(var(--primary) / 0.14);
          }

          52% {
            opacity: 1;
            transform:
              translateX(1px)
              scaleX(1.045)
              scaleY(1.018);
            box-shadow:
              -10px 0 24px 4px hsl(var(--primary) / 0.16),
              0 8px 28px -8px hsl(var(--primary) / 0.14);
          }

          68% {
            transform:
              translateX(0)
              scaleX(0.985)
              scaleY(0.993);
            box-shadow:
              -7px 0 18px 3px hsl(var(--primary) / 0.10),
              0 6px 24px -10px hsl(var(--primary) / 0.10);
          }

          82% {
            transform:
              translateX(0)
              scaleX(1.012)
              scaleY(1.006);
            box-shadow:
              -4px 0 12px 2px hsl(var(--primary) / 0.06),
              0 5px 20px -12px hsl(var(--primary) / 0.08);
          }

          92% {
            transform:
              translateX(0)
              scaleX(0.997)
              scaleY(0.998);
          }

          100% {
            opacity: 1;
            transform:
              translateX(0)
              scaleX(1)
              scaleY(1);
            border-radius: 1rem;
            box-shadow:
              0 25px 50px -20px hsl(var(--foreground) / 0.20);
          }
        }

        /*
         * The connector has its own small elastic motion so the visual
         * connection between the card and bubble feels continuous.
         */
        @keyframes order-bubble-connector-elastic {
          0% {
            opacity: 0;
            transform:
              translateX(-9px)
              rotate(45deg)
              scale(0.2);
          }

          35% {
            opacity: 0.65;
            transform:
              translateX(-3px)
              rotate(45deg)
              scale(0.78);
          }

          58% {
            opacity: 1;
            transform:
              translateX(1px)
              rotate(45deg)
              scale(1.08);
          }

          76% {
            transform:
              translateX(-0.5px)
              rotate(45deg)
              scale(0.96);
          }

          100% {
            opacity: 1;
            transform:
              translateX(0)
              rotate(45deg)
              scale(1);
          }
        }

        /*
         * Short glow pulse at the point where the bubble leaves the card.
         * This creates the subtle "energy trail" without being distracting.
         */
        @keyframes order-bubble-glow-trail {
          0% {
            opacity: 0;
            transform:
              translateX(-10px)
              scaleX(0.35)
              scaleY(0.75);
          }

          20% {
            opacity: 0.75;
            transform:
              translateX(-3px)
              scaleX(0.75)
              scaleY(0.92);
          }

          45% {
            opacity: 0.5;
            transform:
              translateX(4px)
              scaleX(1.15)
              scaleY(1);
          }

          70% {
            opacity: 0.22;
            transform:
              translateX(9px)
              scaleX(1.4)
              scaleY(1.02);
          }

          100% {
            opacity: 0;
            transform:
              translateX(16px)
              scaleX(1.65)
              scaleY(1.05);
          }
        }

        @keyframes order-bubble-content-rise {
          0% {
            opacity: 0;
            transform: translateY(7px);
          }

          45% {
            opacity: 0;
            transform: translateY(4px);
          }

          72% {
            opacity: 0.75;
            transform: translateY(1px);
          }

          100% {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @keyframes order-item-pop {
          0% {
            opacity: 0;
            transform: translateX(-7px) scale(0.97);
          }

          65% {
            opacity: 1;
            transform: translateX(1px) scale(1.005);
          }

          100% {
            opacity: 1;
            transform: translateX(0) scale(1);
          }
        }

        /*
         * 600ms = fast enough for frequent business interactions while
         * still allowing the elastic motion to be perceived.
         */
        .animate-order-card-bubble-grow {
          animation:
            order-card-bubble-elastic
            600ms
            cubic-bezier(0.22, 1, 0.36, 1)
            both;
          will-change: transform, filter;
        }

        .animate-order-bubble-grow {
          animation:
            order-bubble-elastic-grow
            620ms
            cubic-bezier(0.22, 1, 0.36, 1)
            both;
          will-change: transform, opacity, box-shadow;
        }

        .animate-order-bubble-connector {
          animation:
            order-bubble-connector-elastic
            520ms
            80ms
            cubic-bezier(0.22, 1, 0.36, 1)
            both;
          will-change: transform, opacity;
        }

        .animate-order-bubble-glow-trail {
          animation:
            order-bubble-glow-trail
            560ms
            cubic-bezier(0.22, 1, 0.36, 1)
            both;
          will-change: transform, opacity;
        }

        .animate-order-bubble-content {
          animation:
            order-bubble-content-rise
            560ms
            70ms
            cubic-bezier(0.22, 1, 0.36, 1)
            both;
          will-change: transform, opacity;
        }

        .animate-item-pop {
          animation:
            order-item-pop
            300ms
            cubic-bezier(0.22, 1, 0.36, 1)
            both;
        }

        @media (prefers-reduced-motion: reduce) {
          .animate-order-card-bubble-grow,
          .animate-order-bubble-grow,
          .animate-order-bubble-connector,
          .animate-order-bubble-glow-trail,
          .animate-order-bubble-content,
          .animate-item-pop {
            animation: none !important;
          }
        }
      `}</style>

      <div
        ref={setNodeRef}
        className={cn("flex flex-col w-full min-w-0", isOver && "ring-2 ring-primary/50 rounded-xl transition-all")}
      >
        {isMobile ? (
          <button
            onClick={onToggleExpand}
            className={cn(
              "px-3 sm:px-4 py-2.5 sm:py-3 rounded-t-xl w-full text-left transition-all duration-200 hover:opacity-90 active:scale-[0.99]",
              !effectiveIsExpanded && "rounded-b-xl",
              !config.customColor && config.bgColor,
            )}
            style={config.customColor ? { backgroundColor: config.customColor } : undefined}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 min-w-0">
                <ChevronDown
                  className={cn(
                    "h-4 w-4 shrink-0 transition-transform duration-200",
                    config.color,
                    !effectiveIsExpanded && "-rotate-90",
                  )}
                />

                <h3 className={cn("font-semibold text-xs sm:text-sm uppercase tracking-wide truncate", config.color)}>
                  {config.label}
                </h3>
              </div>

              <Badge
                variant="secondary"
                className="bg-white/20 text-white border-0 font-semibold text-xs shrink-0 ml-2"
              >
                {orders.length}
              </Badge>
            </div>
          </button>
        ) : (
          <div
            className={cn(
              "px-3 sm:px-4 py-2.5 sm:py-3 rounded-t-xl w-full text-left",
              !config.customColor && config.bgColor,
            )}
            style={config.customColor ? { backgroundColor: config.customColor } : undefined}
          >
            <div className="flex items-center justify-between">
              <h3 className={cn("font-semibold text-xs sm:text-sm uppercase tracking-wide truncate", config.color)}>
                {config.label}
              </h3>

              <Badge
                variant="secondary"
                className="bg-white/20 text-white border-0 font-semibold text-xs shrink-0 ml-2"
              >
                {orders.length}
              </Badge>
            </div>
          </div>
        )}

        {effectiveIsExpanded && (
          <div className="flex-1 bg-muted/30 dark:bg-muted/10 rounded-b-xl border border-t-0 border-border glass-card !rounded-t-none min-h-[200px] sm:min-h-[400px] animate-fade-in">
            <ScrollArea className={cn("sm:h-[calc(100vh-320px)]", isMobile ? "h-[calc(100vh-280px)]" : "")}>
              <div className="p-2 space-y-2">
                {orders.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 sm:py-16 text-muted-foreground">
                    <Package className="h-8 w-8 sm:h-10 sm:w-10 mb-3 opacity-30" />
                    <p className="text-xs sm:text-sm font-medium">No orders</p>
                  </div>
                ) : groupByClient && clientGroups ? (
                  Array.from(clientGroups.entries()).map(([clientName, clientOrders], groupIdx) => {
                    const isClientCollapsed = collapsedClients.has(clientName);
                    const colorClass = CLIENT_COLORS[groupIdx % CLIENT_COLORS.length];
                    const initial = clientName.charAt(0).toUpperCase();

                    return (
                      <div key={clientName} className="space-y-1.5">
                        <button
                          onClick={() =>
                            setCollapsedClients((prev) => {
                              const next = new Set(prev);

                              if (next.has(clientName)) {
                                next.delete(clientName);
                              } else {
                                next.add(clientName);
                              }

                              return next;
                            })
                          }
                          className="flex items-center gap-2 w-full px-2 py-1.5 rounded-lg bg-muted/40 hover:bg-muted/60 transition-colors"
                        >
                          <div
                            className={cn(
                              "h-6 w-6 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0",
                              colorClass,
                            )}
                          >
                            {initial}
                          </div>

                          <span className="text-xs font-medium text-foreground truncate flex-1 text-left">
                            {clientName}
                          </span>

                          <span className="text-[10px] text-muted-foreground">{clientOrders.length}</span>

                          <ChevronDown
                            className={cn(
                              "h-3.5 w-3.5 text-muted-foreground transition-transform",
                              isClientCollapsed && "-rotate-90",
                            )}
                          />
                        </button>

                        {!isClientCollapsed && clientOrders.map((order, index) => renderOrderCard(order, index))}
                      </div>
                    );
                  })
                ) : (
                  orders.map((order, index) => renderOrderCard(order, index))
                )}
              </div>
            </ScrollArea>
          </div>
        )}
      </div>

      {detailsOrder && (
        <OrderDetailsDialog
          open={!!detailsOrder}
          onOpenChange={(o) => {
            if (!o) {
              setDetailsOrder(null);
              setDetailsTab("details");
            }
          }}
          order={detailsOrder as any}
          isAdmin={canEditItems}
          defaultTab={detailsTab}
        />
      )}
    </>
  );

  function renderOrderCard(order: Order, index: number) {
    const stockSummary = getItemStockSummary(order.items);
    const isOrderExpanded = expandedOrders.has(order.id);
    const hasItems = order.items && order.items.length > 0;
    const isSelected = selectedOrderIds?.has(order.id) || false;
    const isBubbleOpen = itemsBubble?.orderId === order.id;

    const cardContent = (
      <Card
        className={cn(
          "glass-card glow-border hover-lift interactive-scale overflow-hidden",
          "animate-fade-in",
          isSelected && "ring-2 ring-primary bg-primary/5",
          isBubbleOpen && "relative z-40",
        )}
        style={{ animationDelay: `${index * 30}ms` }}
      >
        <CardContent className="p-2.5 sm:p-3">
          <div className="space-y-2 sm:space-y-2.5">
            {/* Order Header */}
            <div className="flex items-start justify-between gap-2">
              {onToggleOrderSelection && (
                <Checkbox
                  checked={isSelected}
                  onCheckedChange={() => onToggleOrderSelection(order.id)}
                  className="h-4 w-4 mt-0.5 shrink-0"
                  onClick={(e) => e.stopPropagation()}
                />
              )}

              <div className="flex-1 min-w-0">
                <HoverCard openDelay={400} closeDelay={100}>
                  <HoverCardTrigger asChild>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setDetailsTab("pos");
                        setDetailsOrder(order);
                      }}
                      className="font-semibold text-xs sm:text-sm text-primary hover:underline truncate cursor-pointer flex items-center gap-1 text-left"
                    >
                      {order.order_number}

                      {order.reference && (
                        <span className="inline-flex items-center rounded bg-muted px-1 py-0.5 text-[9px] font-medium text-muted-foreground whitespace-nowrap">
                          SO: {order.reference}
                        </span>
                      )}
                    </button>
                  </HoverCardTrigger>

                  <HoverCardContent side="right" align="start" className="p-0 w-auto">
                    <OrderQuickPeek
                      orderId={order.id}
                      orderNumber={order.order_number}
                      companyName={order.companyName}
                      status={order.status}
                      urgency={order.urgency}
                      createdAt={order.created_at}
                    />
                  </HoverCardContent>
                </HoverCard>

                <span className="text-[10px] sm:text-xs text-muted-foreground truncate block mt-0.5">
                  {order.companyName}
                </span>

                <span className="text-[10px] text-muted-foreground/60 font-light block mt-0.5">
                  {order.created_at
                    ? new Date(order.created_at).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                      })
                    : ""}{" "}
                  ·{" "}
                  {order.created_at
                    ? new Date(order.created_at).toLocaleTimeString("en-US", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })
                    : ""}
                  {order.creatorName && <> · {order.creatorName}</>}
                </span>
              </div>

              <CircularProgress value={getOrderProgress(order)} size={24} strokeWidth={2.5} />

              {getUrgencyBadge(order.urgency)}
            </div>

            {/* Order Tags */}
            {allTags.length > 0 && onTagsChanged && (
              <OrderTags
                orderId={order.id}
                assignedTagIds={tagAssignments?.get(order.id) || []}
                allTags={allTags}
                onTagsChanged={onTagsChanged}
                compact
              />
            )}

            {/* Collapsible Items Section */}
            {hasItems && (
              <Collapsible open={isOrderExpanded} onOpenChange={() => toggleExpanded(order.id)}>
                <CollapsibleTrigger asChild>
                  <button
                    className={cn(
                      "flex items-center justify-between w-full text-[10px] sm:text-xs bg-muted/50 hover:bg-muted px-2 sm:px-2.5 py-1.5 sm:py-2 rounded-lg transition-all duration-200",
                      itemsBubble?.orderId === order.id && "ring-2 ring-primary/40 bg-primary/10",
                    )}
                    onClick={(e) => {
                      e.stopPropagation();

                      if (itemsBubble?.orderId === order.id) {
                        onCloseItemsBubble?.();
                      } else {
                        onOpenItemsBubble?.(order.id);
                      }
                    }}
                  >
                    <span className="flex items-center gap-1 sm:gap-1.5 text-muted-foreground font-medium">
                      <ChevronDown
                        className={cn(
                          "h-3 w-3 sm:h-3.5 sm:w-3.5 transition-transform duration-200",
                          isOrderExpanded ? "rotate-0" : "-rotate-90",
                        )}
                      />
                      {order.items?.length} item
                      {order.items?.length !== 1 ? "s" : ""}
                    </span>

                    {stockSummary && (
                      <span className="flex items-center gap-1 font-medium text-muted-foreground">
                        <PackageCheck className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                        {stockSummary.units} unit
                        {stockSummary.units !== 1 ? "s" : ""}
                      </span>
                    )}
                  </button>
                </CollapsibleTrigger>

                <CollapsibleContent className="mt-2">
                  <div className="space-y-1.5 bg-muted/30 p-2.5 rounded-lg">
                    {order.items?.map((item) => {
                      const total = item.totalQuantity ?? item.quantity;
                      const isPartial = total > item.quantity;

                      return (
                        <div key={item.id} className="flex items-center gap-2 text-xs py-1">
                          <span className="flex-1 min-w-0 break-words text-foreground">
                            <span className="font-semibold text-primary">×{item.quantity}</span>

                            {isPartial && <span className="text-[10px] text-muted-foreground ml-1">of {total}</span>}

                            {item.code && <span className="font-mono text-muted-foreground ml-1">[{item.code}]</span>}

                            <span className="ml-1">{item.name}</span>
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </CollapsibleContent>
              </Collapsible>
            )}

            {/* Actions */}
            <div className="flex items-center gap-1.5 sm:gap-2 pt-1">
              {config.prevStatus && (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 sm:h-8 text-[10px] sm:text-xs font-medium rounded-lg px-2 sm:px-3"
                  onClick={() => onMoveOrder(order, config.prevStatus!)}
                >
                  <Undo2 className="h-3 w-3 sm:h-3.5 sm:w-3.5 mr-1" />
                  Back
                </Button>
              )}

              {config.nextStatus && (
                <Button
                  size="sm"
                  className="flex-1 h-7 sm:h-8 text-[10px] sm:text-xs font-medium rounded-lg"
                  onClick={() => onMoveOrder(order, config.nextStatus!)}
                >
                  <span className="truncate">{config.nextLabel}</span>

                  <ArrowRight className="h-3 w-3 sm:h-3.5 sm:w-3.5 ml-1 shrink-0" />
                </Button>
              )}

              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 sm:h-8 sm:w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-lg shrink-0"
                  >
                    <Trash2 className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                  </Button>
                </AlertDialogTrigger>

                <AlertDialogContent className="rounded-2xl">
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete Order?</AlertDialogTitle>

                    <AlertDialogDescription>
                      This will permanently delete order {order.order_number}.
                    </AlertDialogDescription>
                  </AlertDialogHeader>

                  <AlertDialogFooter>
                    <AlertDialogCancel className="rounded-lg">Cancel</AlertDialogCancel>

                    <AlertDialogAction
                      onClick={() => onDeleteOrder(order)}
                      className="rounded-lg bg-destructive hover:bg-destructive/90"
                    >
                      Delete
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </div>
        </CardContent>
      </Card>
    );

    /*
     * STEPS 4–7
     *
     * The bubble remains in the same connection container as the card.
     * The animation is therefore visual only and does not alter:
     *
     * - drag/drop
     * - DnD identifiers
     * - scrolling
     * - mobile swipe behavior
     * - order actions
     * - order data
     */

    const orderItemsBubble = isBubbleOpen ? (
      <div
        className={cn(
          "relative overflow-visible rounded-2xl",
          "border border-primary/20 bg-background/95",
          "backdrop-blur-xl",
          "origin-left",
          "animate-order-bubble-grow",
          "shadow-2xl",
        )}
      >
        {/* Moving glow / shadow trail */}
        <div
          className={cn(
            "absolute -left-4 top-5 bottom-5 w-10",
            "rounded-full",
            "bg-primary/20",
            "blur-xl",
            "pointer-events-none",
            "z-0",
            "animate-order-bubble-glow-trail",
          )}
        />

        {/* Secondary subtle trail */}
        <div
          className={cn(
            "absolute -left-2 top-8 bottom-8 w-5",
            "rounded-full",
            "bg-primary/15",
            "blur-md",
            "pointer-events-none",
            "z-0",
            "animate-order-bubble-glow-trail",
          )}
          style={{
            animationDelay: "45ms",
          }}
        />

        {/* Visual connector from card into bubble */}
        <div
          className={cn(
            "absolute -left-2 top-8 h-4 w-4 rotate-45",
            "border-l border-t border-primary/20",
            "bg-background/95",
            "z-10",
            "animate-order-bubble-connector",
          )}
        />

        {/* Soft ambient top glow */}
        <div className="absolute inset-x-0 top-0 h-16 bg-primary/10 blur-2xl pointer-events-none rounded-t-2xl" />

        <div className="relative z-10 p-4 sm:p-5 animate-order-bubble-content">
          {/* Header */}
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <Package className="h-4 w-4" />
                </div>

                <div className="min-w-0">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Order contents
                  </p>

                  <h3 className="truncate text-sm font-bold text-foreground">{order.order_number}</h3>
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onCloseItemsBubble?.();
              }}
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground transition-all hover:bg-destructive/10 hover:text-destructive hover:scale-110"
              aria-label="Close order items"
            >
              ×
            </button>
          </div>

          {/* Summary */}
          <div className="mt-4 flex items-center justify-between rounded-xl bg-primary/5 px-3 py-2">
            <span className="text-xs font-medium text-muted-foreground">Items</span>

            <span className="text-sm font-bold text-primary">{order.items?.length || 0}</span>
          </div>

          {/* Items */}
          <div className="mt-3 space-y-2">
            {order.items?.map((item, itemIndex) => {
              const total = item.totalQuantity ?? item.quantity;
              const isPartial = total > item.quantity;

              return (
                <div
                  key={item.id}
                  className="flex items-center gap-3 rounded-xl bg-muted/40 px-3 py-2.5 text-xs animate-item-pop"
                  style={{
                    animationDelay: `${Math.min(itemIndex * 45 + 300, 500)}ms`,
                  }}
                >
                  <div className="flex h-7 min-w-7 items-center justify-center rounded-lg bg-primary/10 px-1.5 font-bold text-primary">
                    ×{item.quantity}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="break-words font-medium text-foreground">{item.name}</div>

                    {isPartial && (
                      <span className="text-[10px] text-muted-foreground">
                        {item.quantity} of {total}
                      </span>
                    )}

                    {item.code && (
                      <span className="ml-1 font-mono text-[10px] text-muted-foreground">[{item.code}]</span>
                    )}
                  </div>

                  <PackageCheck className="h-4 w-4 shrink-0 text-muted-foreground/50" />
                </div>
              );
            })}
          </div>

          {/* Total units */}
          {stockSummary && (
            <div className="mt-3 flex items-center justify-end gap-1.5 text-[10px] font-medium text-muted-foreground">
              <PackageCheck className="h-3.5 w-3.5" />
              {stockSummary.units} total unit
              {stockSummary.units !== 1 ? "s" : ""}
            </div>
          )}
        </div>
      </div>
    ) : null;

    return (
      <div
        className={cn(
          "space-y-2 transition-all duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]",
          isBubbleOpen && !isMobile && "relative z-30 lg:space-y-3",
        )}
      >
        {isMobile ? (
          <div className="space-y-2">
            <SwipeableCard
              key={`${order.id}-${config.key}`}
              onSwipeLeft={() => onDeleteOrder(order)}
              onSwipeRight={config.nextStatus ? () => onMoveOrder(order, config.nextStatus!) : undefined}
              leftLabel="Delete"
              rightLabel={config.nextLabel || "Next"}
              rightIcon={<ArrowRight className="h-4 w-4" />}
            >
              {cardContent}
            </SwipeableCard>

            {orderItemsBubble}
          </div>
        ) : isBubbleOpen ? (
          <div
            className={cn(
              "grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(360px,0.85fr)]",
              "gap-3 lg:gap-4 items-start",
              "relative",
            )}
          >
            {/* Order card */}
            <div className="min-w-0 animate-order-card-bubble-grow">
              <DraggableCard key={`${order.id}-${config.key}`} id={`${order.id}::${order.boardStage || config.key}`}>
                {cardContent}
              </DraggableCard>
            </div>

            {/* Bubble grows out from the right side of the card */}
            <div
              className="min-w-0 lg:sticky lg:top-3 relative z-20"
              style={{
                animationDelay: "40ms",
              }}
            >
              {orderItemsBubble}
            </div>
          </div>
        ) : (
          <DraggableCard key={`${order.id}-${config.key}`} id={`${order.id}::${order.boardStage || config.key}`}>
            {cardContent}
          </DraggableCard>
        )}
      </div>
    );
  }
}

export default memo(OrderStatusColumn);
