import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Trash2, ArrowRight, Package, PackageCheck, PackageX, ChevronDown, ChevronRight } from "lucide-react";
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
  nextStatus?: string;
  nextLabel?: string;
}

interface OrderStatusColumnProps {
  config: StatusConfig;
  orders: Order[];
  onMoveOrder: (order: Order, newStatus: string) => void;
  onDeleteOrder: (order: Order) => void;
  onToggleItemStock?: (itemId: string, currentStatus: string) => void;
}

export default function OrderStatusColumn({
  config,
  orders,
  onMoveOrder,
  onDeleteOrder,
  onToggleItemStock,
}: OrderStatusColumnProps) {
  const [expandedOrders, setExpandedOrders] = useState<Set<string>>(new Set());

  const toggleExpanded = (orderId: string) => {
    setExpandedOrders(prev => {
      const next = new Set(prev);
      if (next.has(orderId)) {
        next.delete(orderId);
      } else {
        next.add(orderId);
      }
      return next;
    });
  };

  const getUrgencyBadge = (urgency: string | null) => {
    switch (urgency) {
      case "urgent":
        return <Badge className="bg-red-600 text-white text-xs font-semibold">Urgent</Badge>;
      case "high":
        return <Badge className="bg-orange-500 text-white text-xs font-semibold">High</Badge>;
      case "low":
        return <Badge className="bg-slate-500 text-white text-xs">Low</Badge>;
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
    <div className="flex flex-col min-w-[300px] max-w-[340px] flex-1">
      {/* Column Header */}
      <div className={`p-4 rounded-t-xl ${config.bgColor} shadow-lg`}>
        <div className="flex items-center justify-between">
          <h3 className={`font-bold text-sm uppercase tracking-wide ${config.color}`}>
            {config.label}
          </h3>
          <Badge className="bg-white/20 text-white font-bold border-0">
            {orders.length}
          </Badge>
        </div>
      </div>

      {/* Column Content */}
      <div className="flex-1 bg-muted/50 rounded-b-xl border-2 border-t-0 border-muted min-h-[400px]">
        <ScrollArea className="h-[calc(100vh-320px)]">
          <div className="p-3 space-y-3">
            {orders.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                <Package className="h-10 w-10 mb-3 opacity-40" />
                <p className="text-sm font-medium">No orders</p>
              </div>
            ) : (
              orders.map((order) => {
                const stockSummary = getItemStockSummary(order.items);
                const isExpanded = expandedOrders.has(order.id);
                const hasItems = order.items && order.items.length > 0;

                return (
                  <Card
                    key={order.id}
                    className="hover:shadow-lg transition-all duration-200 border-l-4 border-l-primary/50 hover:border-l-primary"
                  >
                    <CardContent className="p-4">
                      <div className="space-y-3">
                        {/* Order Header */}
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <span className="font-bold text-foreground block">
                              {order.order_number}
                            </span>
                            <span className="text-xs text-muted-foreground font-medium truncate block mt-0.5">
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
                              <button className="flex items-center justify-between w-full text-xs bg-muted/50 hover:bg-muted p-2 rounded transition-colors">
                                <span className="flex items-center gap-1.5 text-muted-foreground font-medium">
                                  {isExpanded ? (
                                    <ChevronDown className="h-3.5 w-3.5" />
                                  ) : (
                                    <ChevronRight className="h-3.5 w-3.5" />
                                  )}
                                  {order.items?.length} item{order.items?.length !== 1 ? 's' : ''}
                                </span>
                                {stockSummary && config.key === "ordered" && (
                                  <span className={`flex items-center gap-1 font-medium ${stockSummary.allInStock ? "text-emerald-600" : "text-amber-600"}`}>
                                    {stockSummary.allInStock ? (
                                      <PackageCheck className="h-3 w-3" />
                                    ) : (
                                      <PackageX className="h-3 w-3" />
                                    )}
                                    {stockSummary.inStock}/{stockSummary.total}
                                  </span>
                                )}
                              </button>
                            </CollapsibleTrigger>
                            <CollapsibleContent className="mt-2">
                              <div className="space-y-1.5 bg-muted/30 p-2 rounded border border-border/50">
                                {order.items?.map((item) => (
                                  <div
                                    key={item.id}
                                    className="flex items-center gap-2 text-xs"
                                  >
                                    {config.key === "ordered" && (
                                      <Checkbox
                                        id={item.id}
                                        checked={item.stock_status === "in-stock"}
                                        onCheckedChange={() =>
                                          onToggleItemStock?.(item.id, item.stock_status)
                                        }
                                        className="h-4 w-4 shrink-0"
                                      />
                                    )}
                                    <span className={`flex-1 ${
                                      config.key === "ordered" && item.stock_status === "in-stock"
                                        ? "line-through text-muted-foreground"
                                        : "text-foreground"
                                    }`}>
                                      <span className="font-semibold text-primary">×{item.quantity}</span>
                                      {item.code && <span className="font-mono text-muted-foreground ml-1.5">[{item.code}]</span>}
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
                          {config.nextStatus && (
                            <Button
                              variant="default"
                              size="sm"
                              className="flex-1 h-8 text-xs font-semibold"
                              onClick={() => onMoveOrder(order, config.nextStatus!)}
                            >
                              <ArrowRight className="h-3 w-3 mr-1" />
                              {config.nextLabel}
                            </Button>
                          )}
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button variant="outline" size="icon" className="h-8 w-8">
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Delete Order?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  This will permanently delete order {order.order_number}.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction onClick={() => onDeleteOrder(order)}>
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
