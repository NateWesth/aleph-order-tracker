import { useState, useCallback, memo } from "react";
import { useDroppable, useDraggable } from "@dnd-kit/core";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Trash2, ArrowRight, Package, PackageCheck, PackageX, ChevronDown, Undo2 } from "lucide-react";
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
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
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

  // Animated order-items bubble
  itemsBubble?: {
    orderId: string;
    columnKey: string;
  } | null;
  onOpenItemsBubble?: (orderId: string) => void;
  onCloseItemsBubble?: () => void;
}

// Draggable wrapper for order cards (desktop only)
function DraggableCard({ id, children, disabled }: { id: string; children: React.ReactNode; disabled?: boolean }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id, disabled });
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

  // On desktop/tablet, columns are always expanded and not collapsible
  // On mobile, use the isExpanded prop for collapsible behavior
  const effectiveIsExpanded = isMobile ? isExpanded : true;

  // Client grouping
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
          if (!groups.has(key)) groups.set(key, []);
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
    return { units: items.reduce((sum, i) => sum + (i.quantity || 0), 0) };
  };
  return (
    <>
      <div
        ref={setNodeRef}
        className={cn("flex flex-col w-full min-w-0", isOver && "ring-2 ring-primary/50 rounded-xl transition-all")}
      >
        {/* Column Header - Only clickable to toggle on mobile */}
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

        {/* Column Content - Always visible on desktop, collapsible on mobile */}
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
                              if (next.has(clientName)) next.delete(clientName);
                              else next.add(clientName);
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

  // Helper to render a single order card
  function renderOrderCard(order: Order, index: number) {
    const stockSummary = getItemStockSummary(order.items);
    const isOrderExpanded = expandedOrders.has(order.id);
    const hasItems = order.items && order.items.length > 0;
    const isSelected = selectedOrderIds?.has(order.id) || false;
    const cardContent = (
      <Card
        className={cn(
          "glass-card glow-border hover-lift interactive-scale overflow-hidden",
          "animate-fade-in",
          isSelected && "ring-2 ring-primary bg-primary/5",
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
                {/* Watermark timestamp */}
                <span className="text-[10px] text-muted-foreground/60 font-light block mt-0.5">
                  {order.created_at
                    ? new Date(order.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })
                    : ""}{" "}
                  ·{" "}
                  {order.created_at
                    ? new Date(order.created_at).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })
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
                      {order.items?.length} item{order.items?.length !== 1 ? "s" : ""}
                    </span>

                    {stockSummary && (
                      <span className="flex items-center gap-1 font-medium text-muted-foreground">
                        <PackageCheck className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                        {stockSummary.units} unit{stockSummary.units !== 1 ? "s" : ""}
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

    return isMobile ? (
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
    ) : (
      <DraggableCard key={`${order.id}-${config.key}`} id={`${order.id}::${order.boardStage || config.key}`}>
        {cardContent}
      </DraggableCard>
    );
  }
}

// Memoize the component to prevent unnecessary re-renders
export default memo(OrderStatusColumn);
