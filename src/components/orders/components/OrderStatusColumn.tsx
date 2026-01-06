import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Trash2, ArrowRight, Package, PackageCheck, PackageX, ChevronDown, ChevronRight, Sparkles } from "lucide-react";
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
        return (
          <Badge className="bg-gradient-to-r from-red-600 to-red-500 text-white text-xs font-semibold shadow-lg shadow-red-500/30 animate-pulse">
            Urgent
          </Badge>
        );
      case "high":
        return (
          <Badge className="bg-gradient-to-r from-orange-500 to-amber-500 text-white text-xs font-semibold shadow-lg shadow-orange-500/30">
            High
          </Badge>
        );
      case "low":
        return <Badge className="bg-slate-500/80 text-white text-xs backdrop-blur-sm">Low</Badge>;
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

  // Get glow color based on column type
  const getGlowColor = () => {
    switch (config.key) {
      case "pending": return "hover:shadow-amber-500/20";
      case "ordered": return "hover:shadow-blue-500/20";
      case "progress": return "hover:shadow-purple-500/20";
      case "processing": return "hover:shadow-cyan-500/20";
      case "completed": return "hover:shadow-emerald-500/20";
      default: return "hover:shadow-primary/20";
    }
  };

  const getAccentGradient = () => {
    switch (config.key) {
      case "pending": return "from-amber-500 to-orange-500";
      case "ordered": return "from-blue-500 to-indigo-500";
      case "progress": return "from-purple-500 to-pink-500";
      case "processing": return "from-cyan-500 to-teal-500";
      case "completed": return "from-emerald-500 to-green-500";
      default: return "from-primary to-primary";
    }
  };

  return (
    <div className="flex flex-col min-w-[300px] max-w-[340px] flex-1 group/column">
      {/* Column Header with gradient glow */}
      <div className="relative">
        {/* Glow effect behind header */}
        <div className={`absolute inset-0 bg-gradient-to-r ${getAccentGradient()} rounded-t-2xl blur-xl opacity-30 group-hover/column:opacity-50 transition-opacity duration-500`} />
        
        <div className={`relative p-4 rounded-t-2xl ${config.bgColor} shadow-2xl backdrop-blur-sm border-t border-l border-r border-white/20`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className={`h-2 w-2 rounded-full bg-white/80 animate-pulse`} />
              <h3 className={`font-bold text-sm uppercase tracking-widest ${config.color} drop-shadow-lg`}>
                {config.label}
              </h3>
            </div>
            <Badge className="bg-white/20 text-white font-bold border-0 shadow-inner backdrop-blur-sm px-3">
              {orders.length}
            </Badge>
          </div>
        </div>
      </div>

      {/* Column Content - Dark glassmorphism */}
      <div className="relative flex-1">
        {/* Subtle inner glow */}
        <div className="absolute inset-0 bg-gradient-to-b from-white/5 to-transparent pointer-events-none rounded-b-2xl" />
        
        <div className="flex-1 bg-gradient-to-b from-black/30 via-black/40 to-black/50 dark:from-black/50 dark:via-black/60 dark:to-black/70 backdrop-blur-xl rounded-b-2xl border border-white/10 dark:border-white/5 min-h-[400px] shadow-[inset_0_1px_0_0_rgba(255,255,255,0.1)]">
          <ScrollArea className="h-[calc(100vh-320px)]">
            <div className="p-4 space-y-4">
              {orders.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-white/40">
                  <div className="relative">
                    <Package className="h-12 w-12 mb-4 opacity-40" />
                    <Sparkles className="h-4 w-4 absolute -top-1 -right-1 opacity-60 animate-pulse" />
                  </div>
                  <p className="text-sm font-medium tracking-wide">No orders yet</p>
                  <p className="text-xs opacity-60 mt-1">Orders will appear here</p>
                </div>
              ) : (
                orders.map((order, index) => {
                  const stockSummary = getItemStockSummary(order.items);
                  const isExpanded = expandedOrders.has(order.id);
                  const hasItems = order.items && order.items.length > 0;

                  return (
                    <div
                      key={order.id}
                      className="animate-fade-in"
                      style={{ animationDelay: `${index * 50}ms` }}
                    >
                      <Card
                        className={`
                          relative overflow-hidden
                          bg-gradient-to-br from-card/95 via-card/90 to-card/85 
                          dark:from-card/80 dark:via-card/75 dark:to-card/70
                          backdrop-blur-md
                          border-0
                          shadow-[0_8px_32px_-8px_rgba(0,0,0,0.4),0_4px_16px_-4px_rgba(0,0,0,0.3)]
                          hover:shadow-[0_20px_60px_-15px_rgba(0,0,0,0.5),0_10px_30px_-10px_rgba(0,0,0,0.4)]
                          ${getGlowColor()}
                          transition-all duration-500 ease-out
                          hover:-translate-y-1 hover:scale-[1.02]
                          group
                        `}
                      >
                        {/* Accent gradient border on left */}
                        <div className={`absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b ${getAccentGradient()} opacity-70 group-hover:opacity-100 transition-opacity`} />
                        
                        {/* Shine effect on hover */}
                        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent translate-x-[-200%] group-hover:translate-x-[200%] transition-transform duration-1000 ease-in-out" />
                        
                        {/* Top highlight */}
                        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/30 to-transparent" />

                        <CardContent className="p-4 pl-5">
                          <div className="space-y-3">
                            {/* Order Header */}
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex-1 min-w-0">
                                <span className="font-bold text-foreground block text-base tracking-tight">
                                  {order.order_number}
                                </span>
                                <span className="text-xs text-muted-foreground/80 font-medium truncate block mt-1">
                                  {order.companyName}
                                </span>
                              </div>
                              {getUrgencyBadge(order.urgency)}
                            </div>

                            {/* Description */}
                            {order.description && (
                              <p className="text-xs text-muted-foreground/70 line-clamp-2 leading-relaxed">
                                {order.description}
                              </p>
                            )}

                            {/* Collapsible Items Section */}
                            {hasItems && (
                              <Collapsible open={isExpanded} onOpenChange={() => toggleExpanded(order.id)}>
                                <CollapsibleTrigger asChild>
                                  <button className="flex items-center justify-between w-full text-xs bg-black/20 dark:bg-black/30 hover:bg-black/30 dark:hover:bg-black/40 p-2.5 rounded-lg transition-all duration-200 backdrop-blur-sm border border-white/5">
                                    <span className="flex items-center gap-2 text-foreground/70 font-medium">
                                      <span className={`transition-transform duration-200 ${isExpanded ? 'rotate-0' : '-rotate-90'}`}>
                                        <ChevronDown className="h-3.5 w-3.5" />
                                      </span>
                                      {order.items?.length} item{order.items?.length !== 1 ? 's' : ''}
                                    </span>
                                    {stockSummary && config.key === "ordered" && (
                                      <span className={`flex items-center gap-1.5 font-semibold ${stockSummary.allInStock ? "text-emerald-400" : "text-amber-400"}`}>
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
                                <CollapsibleContent className="mt-2 overflow-hidden">
                                  <div className="space-y-2 bg-black/10 dark:bg-black/20 p-3 rounded-lg border border-white/5 backdrop-blur-sm">
                                    {order.items?.map((item) => (
                                      <div
                                        key={item.id}
                                        className="flex items-center gap-2.5 text-xs group/item hover:bg-white/5 p-1.5 rounded transition-colors"
                                      >
                                        {config.key === "ordered" && (
                                          <Checkbox
                                            id={item.id}
                                            checked={item.stock_status === "in-stock"}
                                            onCheckedChange={() =>
                                              onToggleItemStock?.(item.id, item.stock_status)
                                            }
                                            className="h-4 w-4 shrink-0 border-white/30 data-[state=checked]:bg-emerald-500 data-[state=checked]:border-emerald-500"
                                          />
                                        )}
                                        <span className={`flex-1 ${
                                          config.key === "ordered" && item.stock_status === "in-stock"
                                            ? "line-through text-muted-foreground/50"
                                            : "text-foreground/90"
                                        }`}>
                                          <span className={`font-bold bg-gradient-to-r ${getAccentGradient()} bg-clip-text text-transparent`}>×{item.quantity}</span>
                                          {item.code && <span className="font-mono text-muted-foreground/60 ml-2">[{item.code}]</span>}
                                          <span className="ml-2">{item.name}</span>
                                        </span>
                                      </div>
                                    ))}
                                  </div>
                                </CollapsibleContent>
                              </Collapsible>
                            )}

                            {/* Actions */}
                            <div className="flex items-center gap-2 pt-2">
                              {config.nextStatus && (
                                <Button
                                  variant="default"
                                  size="sm"
                                  className={`flex-1 h-9 text-xs font-semibold bg-gradient-to-r ${getAccentGradient()} hover:opacity-90 shadow-lg transition-all duration-300 hover:shadow-xl hover:scale-[1.02]`}
                                  onClick={() => onMoveOrder(order, config.nextStatus!)}
                                >
                                  <ArrowRight className="h-3.5 w-3.5 mr-1.5" />
                                  {config.nextLabel}
                                </Button>
                              )}
                              <AlertDialog>
                                <AlertDialogTrigger asChild>
                                  <Button 
                                    variant="outline" 
                                    size="icon" 
                                    className="h-9 w-9 border-white/10 bg-black/20 hover:bg-red-500/20 hover:border-red-500/50 transition-all duration-300"
                                  >
                                    <Trash2 className="h-4 w-4 text-destructive" />
                                  </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent className="bg-card/95 backdrop-blur-xl border-white/10">
                                  <AlertDialogHeader>
                                    <AlertDialogTitle>Delete Order?</AlertDialogTitle>
                                    <AlertDialogDescription>
                                      This will permanently delete order {order.order_number}.
                                    </AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel className="border-white/10">Cancel</AlertDialogCancel>
                                    <AlertDialogAction 
                                      onClick={() => onDeleteOrder(order)}
                                      className="bg-gradient-to-r from-red-600 to-red-500 hover:from-red-500 hover:to-red-400"
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
                    </div>
                  );
                })
              )}
            </div>
          </ScrollArea>
        </div>
      </div>
    </div>
  );
}
