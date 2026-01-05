import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Trash2, ArrowRight, Package } from "lucide-react";
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

interface Order {
  id: string;
  order_number: string;
  description: string | null;
  status: string | null;
  urgency: string | null;
  company_id: string | null;
  created_at: string | null;
  companyName?: string;
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
}

export default function OrderStatusColumn({
  config,
  orders,
  onMoveOrder,
  onDeleteOrder,
}: OrderStatusColumnProps) {
  const getUrgencyBadge = (urgency: string | null) => {
    switch (urgency) {
      case "urgent":
        return <Badge variant="destructive" className="text-xs">Urgent</Badge>;
      case "high":
        return <Badge className="bg-orange-100 text-orange-800 text-xs">High</Badge>;
      case "low":
        return <Badge className="bg-slate-100 text-slate-600 text-xs">Low</Badge>;
      default:
        return null;
    }
  };

  return (
    <div className="flex flex-col min-w-[280px] max-w-[320px] flex-1">
      {/* Column Header */}
      <div className={`p-3 rounded-t-lg ${config.bgColor}`}>
        <div className="flex items-center justify-between">
          <h3 className={`font-semibold ${config.color}`}>{config.label}</h3>
          <Badge variant="secondary" className="bg-background/80">
            {orders.length}
          </Badge>
        </div>
      </div>

      {/* Column Content */}
      <div className="flex-1 bg-muted/30 rounded-b-lg border border-t-0 min-h-[400px]">
        <ScrollArea className="h-[calc(100vh-320px)]">
          <div className="p-2 space-y-2">
            {orders.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                <Package className="h-8 w-8 mb-2 opacity-50" />
                <p className="text-sm">No orders</p>
              </div>
            ) : (
              orders.map((order) => (
                <Card
                  key={order.id}
                  className="hover:shadow-md transition-shadow cursor-pointer"
                >
                  <CardContent className="p-3">
                    <div className="space-y-2">
                      {/* Order Header */}
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <span className="font-semibold text-sm text-foreground block">
                            {order.order_number}
                          </span>
                          <span className="text-xs text-muted-foreground truncate block">
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

                      {/* Actions */}
                      <div className="flex items-center gap-1 pt-1">
                        {config.nextStatus && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="flex-1 h-7 text-xs"
                            onClick={() => onMoveOrder(order, config.nextStatus!)}
                          >
                            <ArrowRight className="h-3 w-3 mr-1" />
                            {config.nextLabel}
                          </Button>
                        )}
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-7 w-7">
                              <Trash2 className="h-3 w-3 text-destructive" />
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
              ))
            )}
          </div>
        </ScrollArea>
      </div>
    </div>
  );
}
