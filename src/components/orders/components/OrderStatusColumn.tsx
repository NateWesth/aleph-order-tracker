import { useState, useCallback, memo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Trash2, ArrowRight, ArrowLeft, Package, PackageCheck, PackageX, ChevronDown, Undo2 } from "lucide-react";
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
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";

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
  canEditItems?: boolean;
}

function OrderStatusColumn({
  config,
  orders,
  onMoveOrder,
  onDeleteOrder,
  onSetItemStockStatus,
  canEditItems = false,
}: OrderStatusColumnProps) {
  const [expandedOrders, setExpandedOrders] = useState<Set<string>>(new Set());

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

  const getItemStockSummary = (items: OrderItem[] | undefined) => {
    if (!items || items.length === 0) return null;
    const inStock = items.filter((i) => i.stock_status === "in-stock").length;
    const total = items.length;
    return { inStock, total, allInStock: inStock === total };
  };

  return (
    <div className="flex flex-col w-full">
      {/* Column Header */}
      <div 
        className={cn(
          "px-4 py-3 rounded-t-xl",
          !config.customColor && config.bgColor
        )}
        style={config.customColor ? { backgroundColor: config.customColor } : undefined}
      >
        <div className="flex items-center justify-between">
          <h3 className={cn(
            "font-semibold text-sm uppercase tracking-wide",
            config.color
          )}>
            {config.label}
          </h3>
          <Badge variant="secondary" className="bg-white/20 text-white border-0 font-semibold">
            {orders.length}
          </Badge>
        </div>
      </div>

      {/* Column Content */}
      <div className="flex-1 bg-muted/30 dark:bg-muted/10 rounded-b-xl border border-t-0 border-border min-h-[400px]">
        <ScrollArea className="h-[calc(100vh-320px)]">
          <div className="p-3 space-y-2">
            {orders.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                <Package className="h-10 w-10 mb-3 opacity-30" />
                <p className="text-sm font-medium">No orders</p>
              </div>
            ) : (
              orders.map((order, index) => {
                const stockSummary = getItemStockSummary(order.items);
                const isExpanded = expandedOrders.has(order.id);
                const hasItems = order.items && order.items.length > 0;

                return (
                  <Card
                    key={order.id}
                    className={cn(
                      "bg-card border-border hover-lift overflow-hidden",
                      "animate-fade-in"
                    )}
                    style={{ animationDelay: `${index * 30}ms` }}
                  >
                    <CardContent className="p-3">
                      <div className="space-y-2.5">
                        {/* Order Header */}
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <span className="font-semibold text-sm text-foreground block">
                              {order.order_number}
                            </span>
                            <span className="text-xs text-muted-foreground truncate block mt-0.5">
                              {order.companyName}
                            </span>
                          </div>
                          {getUrgencyBadge(order.urgency)}
                        </div>

                        {/* Description */}
                        {order.description && (
                          <p className="text-xs text-muted-foreground line-clamp-2">
                            {order.description}
                          </p>
                        )}

                        {/* Collapsible Items Section */}
                        {hasItems && (
                          <Collapsible open={isExpanded} onOpenChange={() => toggleExpanded(order.id)}>
                            <CollapsibleTrigger asChild>
                              <button className="flex items-center justify-between w-full text-xs bg-muted/50 hover:bg-muted px-2.5 py-2 rounded-lg transition-colors">
                                <span className="flex items-center gap-1.5 text-muted-foreground font-medium">
                                  <ChevronDown className={cn(
                                    "h-3.5 w-3.5 transition-transform duration-200",
                                    isExpanded ? "rotate-0" : "-rotate-90"
                                  )} />
                                  {order.items?.length} item{order.items?.length !== 1 ? 's' : ''}
                                </span>
                                {stockSummary && config.key === "ordered" && (
                                  <span className={cn(
                                    "flex items-center gap-1 font-medium",
                                    stockSummary.allInStock ? "text-primary" : "text-amber-600"
                                  )}>
                                    {stockSummary.allInStock ? (
                                      <PackageCheck className="h-3.5 w-3.5" />
                                    ) : (
                                      <PackageX className="h-3.5 w-3.5" />
                                    )}
                                    {stockSummary.inStock}/{stockSummary.total}
                                  </span>
                                )}
                              </button>
                            </CollapsibleTrigger>
                            <CollapsibleContent className="mt-2">
                              <div className="space-y-1 bg-muted/30 p-2.5 rounded-lg">
                                {order.items?.map((item) => (
                                  <div
                                    key={item.id}
                                    className="flex items-center gap-2 text-xs py-1"
                                  >
                                    {config.key === "ordered" && (
                                      <div className="flex items-center gap-2 shrink-0">
                                        {/* Ordered */}
                                        <Checkbox
                                          id={`${item.id}-ordered`}
                                          checked={item.stock_status === "ordered" || item.stock_status === "in-stock"}
                                          onCheckedChange={(checked) => {
                                            if (!canEditItems) return;
                                            onSetItemStockStatus?.(
                                              item.id,
                                              checked ? "ordered" : "awaiting"
                                            );
                                          }}
                                          disabled={!canEditItems}
                                          className="h-4 w-4"
                                        />

                                        {/* Received */}
                                        <Checkbox
                                          id={`${item.id}-received`}
                                          checked={item.stock_status === "in-stock"}
                                          onCheckedChange={(checked) => {
                                            if (!canEditItems) return;
                                            if (checked) {
                                              onSetItemStockStatus?.(item.id, "in-stock");
                                            } else {
                                              // If un-receiving, fall back to ordered (if ordered was set) else awaiting
                                              onSetItemStockStatus?.(item.id, "ordered");
                                            }
                                          }}
                                          disabled={!canEditItems}
                                          className="h-4 w-4"
                                        />
                                      </div>
                                    )}
                                    <span className={cn(
                                      "flex-1",
                                      config.key === "ordered" && item.stock_status === "in-stock"
                                        ? "line-through text-muted-foreground"
                                        : "text-foreground"
                                    )}>
                                      <span className="font-semibold text-primary">×{item.quantity}</span>
                                      {item.code && (
                                        <span className="font-mono text-muted-foreground ml-1.5">[{item.code}]</span>
                                      )}
                                      <span className="ml-1.5">{item.name}</span>
                                    </span>
                                  </div>
                                ))}
                              </div>
                            </CollapsibleContent>
                          </Collapsible>
                        )}

                        {/* Actions */}
                        <div className="flex items-center gap-2 pt-1">
                          {/* Back button for In Stock column */}
                          {config.key === "in-stock" && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-8 text-xs font-medium rounded-lg"
                              onClick={() => onMoveOrder(order, "ordered")}
                            >
                              <Undo2 className="h-3.5 w-3.5 mr-1" />
                              Back
                            </Button>
                          )}
                          {config.nextStatus && (
                            <Button
                              size="sm"
                              className="flex-1 h-8 text-xs font-medium rounded-lg"
                              onClick={() => onMoveOrder(order, config.nextStatus!)}
                            >
                              {config.nextLabel}
                              <ArrowRight className="h-3.5 w-3.5 ml-1.5" />
                            </Button>
                          )}
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button 
                                variant="ghost" 
                                size="icon" 
                                className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-lg"
                              >
                                <Trash2 className="h-4 w-4" />
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
              })
            )}
          </div>
        </ScrollArea>
      </div>
    </div>
  );
}

// Memoize the component to prevent unnecessary re-renders
export default memo(OrderStatusColumn);