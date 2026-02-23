import { useState, useCallback, memo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Trash2, ArrowRight, Package, PackageCheck, PackageX, ChevronDown, Undo2 } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { useTheme } from "@/contexts/ThemeContext";
import { useIsMobile } from "@/hooks/use-mobile";
import SwipeableCard from "@/components/ui/SwipeableCard";
interface OrderItem {
  id: string;
  name: string;
  code: string | null;
  quantity: number;
  stock_status: string;
}
interface Order {
  id: string;
  order_number: string;
  description: string | null;
  status: string | null;
  urgency: string | null;
  company_id: string | null;
  created_at: string | null;
  companyName?: string;
  items?: OrderItem[];
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
  onToggleExpand
}: OrderStatusColumnProps) {
  const { stockStatusColors } = useTheme();
  const isMobile = useIsMobile();
  const [expandedOrders, setExpandedOrders] = useState<Set<string>>(new Set());
  
  // On desktop/tablet, columns are always expanded and not collapsible
  // On mobile, use the isExpanded prop for collapsible behavior
  const effectiveIsExpanded = isMobile ? isExpanded : true;
  const toggleExpanded = useCallback((orderId: string) => {
    setExpandedOrders(prev => {
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
        return <Badge variant="destructive" className="text-[10px] font-semibold px-1.5 py-0">
            Urgent
          </Badge>;
      case "high":
        return <Badge className="bg-amber-500 hover:bg-amber-500 text-white text-[10px] font-semibold px-1.5 py-0">
            High
          </Badge>;
      case "low":
        return <Badge variant="secondary" className="text-[10px] font-medium px-1.5 py-0">
            Low
          </Badge>;
      default:
        return null;
    }
  };
  const getItemStockSummary = (items: OrderItem[] | undefined) => {
    if (!items || items.length === 0) return null;
    const inStock = items.filter(i => i.stock_status === "in-stock").length;
    const total = items.length;
    return {
      inStock,
      total,
      allInStock: inStock === total
    };
  };
  return <div className="flex flex-col w-full min-w-0">
      {/* Column Header - Only clickable to toggle on mobile */}
      {isMobile ? (
        <button 
          onClick={onToggleExpand}
          className={cn(
            "px-3 sm:px-4 py-2.5 sm:py-3 rounded-t-xl w-full text-left transition-all duration-200 hover:opacity-90 active:scale-[0.99]",
            !effectiveIsExpanded && "rounded-b-xl",
            !config.customColor && config.bgColor
          )} 
          style={config.customColor ? { backgroundColor: config.customColor } : undefined}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 min-w-0">
              <ChevronDown className={cn(
                "h-4 w-4 shrink-0 transition-transform duration-200",
                config.color,
                !effectiveIsExpanded && "-rotate-90"
              )} />
              <h3 className={cn("font-semibold text-xs sm:text-sm uppercase tracking-wide truncate", config.color)}>
                {config.label}
              </h3>
            </div>
            <Badge variant="secondary" className="bg-white/20 text-white border-0 font-semibold text-xs shrink-0 ml-2">
              {orders.length}
            </Badge>
          </div>
        </button>
      ) : (
        <div 
          className={cn(
            "px-3 sm:px-4 py-2.5 sm:py-3 rounded-t-xl w-full text-left",
            !config.customColor && config.bgColor
          )} 
          style={config.customColor ? { backgroundColor: config.customColor } : undefined}
        >
          <div className="flex items-center justify-between">
            <h3 className={cn("font-semibold text-xs sm:text-sm uppercase tracking-wide truncate", config.color)}>
              {config.label}
            </h3>
            <Badge variant="secondary" className="bg-white/20 text-white border-0 font-semibold text-xs shrink-0 ml-2">
              {orders.length}
            </Badge>
          </div>
        </div>
      )}

      {/* Column Content - Always visible on desktop, collapsible on mobile */}
      {effectiveIsExpanded && (
        <div className="flex-1 bg-muted/30 dark:bg-muted/10 rounded-b-xl border border-t-0 border-border min-h-[200px] sm:min-h-[400px] animate-fade-in">
          <ScrollArea className={cn(
            "sm:h-[calc(100vh-320px)]",
            isMobile ? "max-h-[50vh]" : ""
          )}>
            <div className="p-2 space-y-2">
              {orders.length === 0 ? <div className="flex flex-col items-center justify-center py-12 sm:py-16 text-muted-foreground">
                <Package className="h-8 w-8 sm:h-10 sm:w-10 mb-3 opacity-30" />
                <p className="text-xs sm:text-sm font-medium">No orders</p>
              </div> : orders.map((order, index) => {
            const stockSummary = getItemStockSummary(order.items);
            const isExpanded = expandedOrders.has(order.id);
            const hasItems = order.items && order.items.length > 0;
            const cardContent = <Card className={cn("bg-card border-border hover-lift overflow-hidden", "animate-fade-in")} style={{
              animationDelay: `${index * 30}ms`
            }}>
                    <CardContent className="p-2.5 sm:p-3">
                      <div className="space-y-2 sm:space-y-2.5">
                        {/* Order Header */}
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <span className="font-semibold text-xs sm:text-sm text-foreground block truncate">
                              {order.order_number}
                            </span>
                            <span className="text-[10px] sm:text-xs text-muted-foreground truncate block mt-0.5">
                              {order.companyName}
                            </span>
                          </div>
                          {getUrgencyBadge(order.urgency)}
                        </div>


                        {/* Collapsible Items Section */}
                        {hasItems && <Collapsible open={isExpanded} onOpenChange={() => toggleExpanded(order.id)}>
                            <CollapsibleTrigger asChild>
                              <button className="flex items-center justify-between w-full text-[10px] sm:text-xs bg-muted/50 hover:bg-muted px-2 sm:px-2.5 py-1.5 sm:py-2 rounded-lg transition-colors">
                                <span className="flex items-center gap-1 sm:gap-1.5 text-muted-foreground font-medium">
                                  <ChevronDown className={cn("h-3 w-3 sm:h-3.5 sm:w-3.5 transition-transform duration-200", isExpanded ? "rotate-0" : "-rotate-90")} />
                                  {order.items?.length} item{order.items?.length !== 1 ? 's' : ''}
                                </span>
                                {stockSummary && config.key === "ordered" && <span className={cn("flex items-center gap-1 font-medium", stockSummary.allInStock ? "text-primary" : "text-amber-600")}>
                                    {stockSummary.allInStock ? <PackageCheck className="h-3 w-3 sm:h-3.5 sm:w-3.5" /> : <PackageX className="h-3 w-3 sm:h-3.5 sm:w-3.5" />}
                                    {stockSummary.inStock}/{stockSummary.total}
                                  </span>}
                              </button>
                            </CollapsibleTrigger>
                            <CollapsibleContent className="mt-2">
                              <div className="space-y-1.5 bg-muted/30 p-2.5 rounded-lg">
                                {/* Column Headers for Awaiting Stock */}
                                {config.key === "ordered" && order.items && order.items.length > 0 && <div className="flex items-center gap-2 text-[10px] font-medium text-muted-foreground pb-1 border-b border-border/50 mb-1">
                                    <div className="flex items-center gap-2 shrink-0">
                                      <span className="w-4 text-center" style={{ color: stockStatusColors.orderedColor }}>O</span>
                                      <span className="w-4 text-center" style={{ color: stockStatusColors.receivedColor }}>R</span>
                                    </div>
                                    <span className="flex-1">Item</span>
                                  </div>}
                                {order.items?.map(item => <div key={item.id} className="flex items-center gap-2 text-xs py-1">
                                    {config.key === "ordered" && <div className="flex items-center gap-2 shrink-0">
                                        {/* Ordered - Blue */}
                                        <TooltipProvider>
                                          <Tooltip>
                                            <TooltipTrigger asChild>
                                              <span>
                                                <Checkbox id={`${item.id}-ordered`} checked={item.stock_status === "ordered" || item.stock_status === "in-stock"} onCheckedChange={checked => {
                                      if (!canEditItems) return;
                                      onSetItemStockStatus?.(item.id, checked ? "ordered" : "awaiting");
                                    }} disabled={!canEditItems} className="h-4 w-4" style={{
                                      '--checkbox-color': stockStatusColors.orderedColor,
                                    } as React.CSSProperties}
                                    data-custom-color="true" />
                                              </span>
                                            </TooltipTrigger>
                                            <TooltipContent side="top">
                                              <p>Ordered: Item has been ordered from supplier</p>
                                            </TooltipContent>
                                          </Tooltip>
                                        </TooltipProvider>

                                        {/* Received - Custom color */}
                                        <TooltipProvider>
                                          <Tooltip>
                                            <TooltipTrigger asChild>
                                              <span>
                                                <Checkbox id={`${item.id}-received`} checked={item.stock_status === "in-stock"} onCheckedChange={checked => {
                                      if (!canEditItems) return;
                                      if (checked) {
                                        onSetItemStockStatus?.(item.id, "in-stock");
                                      } else {
                                        onSetItemStockStatus?.(item.id, "ordered");
                                      }
                                    }} disabled={!canEditItems} className="h-4 w-4" style={{
                                      '--checkbox-color': stockStatusColors.receivedColor,
                                    } as React.CSSProperties}
                                    data-custom-color="true" />
                                              </span>
                                            </TooltipTrigger>
                                            <TooltipContent side="top">
                                              <p>Received: Item has arrived and is in stock</p>
                                            </TooltipContent>
                                          </Tooltip>
                                        </TooltipProvider>
                                      </div>}
                                    <span className={cn("flex-1 min-w-0 break-words", config.key === "ordered" && item.stock_status === "in-stock" ? "line-through text-muted-foreground" : "text-foreground")}>
                                      <span className="font-semibold text-primary">×{item.quantity}</span>
                                      {item.code && <span className="font-mono text-muted-foreground ml-1">[{item.code}]</span>}
                                      <span className="ml-1">{item.name}</span>
                                    </span>
                                  </div>)}
                                
                                {/* Bulk Actions & Legend */}
                                {config.key === "ordered" && order.items && order.items.length > 0 && canEditItems && <div className="flex items-center justify-between pt-2 mt-1 border-t border-border/50">
                                    <div className="flex items-center gap-1">
                                      <Button size="sm" variant="outline" className="h-6 text-[10px] px-2" style={{
                                        backgroundColor: `${stockStatusColors.orderedColor}15`,
                                        borderColor: `${stockStatusColors.orderedColor}40`,
                                        color: stockStatusColors.orderedColor,
                                      }} onClick={() => {
                              const itemIds = order.items?.map(i => i.id) || [];
                              onBulkSetItemsStatus?.(itemIds, "ordered");
                            }}>
                                        All Ordered
                                      </Button>
                                      
                                    </div>
                                    <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                                      <div className="flex items-center gap-1">
                                        <div className="w-2 h-2 rounded-sm" style={{ backgroundColor: stockStatusColors.orderedColor }}></div>
                                        <span>O</span>
                                      </div>
                                      <div className="flex items-center gap-1">
                                        <div className="w-2 h-2 rounded-sm" style={{ backgroundColor: stockStatusColors.receivedColor }}></div>
                                        <span>R</span>
                                      </div>
                                    </div>
                                  </div>}
                                {/* Legend only when not editable */}
                                {config.key === "ordered" && order.items && order.items.length > 0 && !canEditItems && <div className="flex items-center gap-3 pt-2 mt-1 border-t border-border/50 text-[10px] text-muted-foreground">
                                    <div className="flex items-center gap-1">
                                      <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: stockStatusColors.orderedColor }}></div>
                                      <span>Ordered</span>
                                    </div>
                                    <div className="flex items-center gap-1">
                                      <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: stockStatusColors.receivedColor }}></div>
                                      <span>Received</span>
                                    </div>
                                  </div>}
                              </div>
                            </CollapsibleContent>
                          </Collapsible>}

                        {/* Actions */}
                        <div className="flex items-center gap-1.5 sm:gap-2 pt-1">
                          {/* Back button for In Stock column */}
                          {config.key === "in-stock" && <Button size="sm" variant="outline" className="h-7 sm:h-8 text-[10px] sm:text-xs font-medium rounded-lg px-2 sm:px-3" onClick={() => onMoveOrder(order, "ordered")}>
                              <Undo2 className="h-3 w-3 sm:h-3.5 sm:w-3.5 mr-1" />
                              Back
                            </Button>}
                          {config.nextStatus && <Button size="sm" className="flex-1 h-7 sm:h-8 text-[10px] sm:text-xs font-medium rounded-lg" onClick={() => onMoveOrder(order, config.nextStatus!)}>
                              <span className="truncate">{config.nextLabel}</span>
                              <ArrowRight className="h-3 w-3 sm:h-3.5 sm:w-3.5 ml-1 shrink-0" />
                            </Button>}
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-7 w-7 sm:h-8 sm:w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-lg shrink-0">
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
                                <AlertDialogAction onClick={() => onDeleteOrder(order)} className="rounded-lg bg-destructive hover:bg-destructive/90">
                                  Delete
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </div>
                    </CardContent>
                  </Card>;
            
            // Wrap with swipeable on mobile
            return isMobile ? (
              <SwipeableCard
                key={order.id}
                onSwipeLeft={() => onDeleteOrder(order)}
                onSwipeRight={config.nextStatus ? () => onMoveOrder(order, config.nextStatus!) : undefined}
                leftLabel="Delete"
                rightLabel={config.nextLabel || "Next"}
                rightIcon={<ArrowRight className="h-4 w-4" />}
              >
                {cardContent}
              </SwipeableCard>
            ) : (
              <div key={order.id}>{cardContent}</div>
            );
          })}
            </div>
          </ScrollArea>
        </div>
      )}
    </div>;
}

// Memoize the component to prevent unnecessary re-renders
export default memo(OrderStatusColumn);