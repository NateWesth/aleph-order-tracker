
import { TableCell, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Eye, MoreHorizontal, Clock, ShoppingCart, Package, Truck } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import OrderExportActions from "./OrderExportActions";
import { OrderUpdatesButton } from "./OrderUpdatesButton";
import { useState } from "react";
import OrderDetailsDialog from "./OrderDetailsDialog";
import ManagePOsDialog from "./ManagePOsDialog";
import { OrderWithCompany, PurchaseOrderInfo } from "../types/orderTypes";
import { useIsMobile } from "@/hooks/use-mobile";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface OrderRowProps {
  order: OrderWithCompany;
  isAdmin: boolean;
  onReceiveOrder: (order: OrderWithCompany) => void;
  onDeleteOrder: (orderId: string, orderNumber: string) => void;
  onOrderClick?: (order: OrderWithCompany) => void;
  compact?: boolean;
}

interface StockStatusCounts {
  awaiting: number;
  ordered: number;
  inStock: number;
  total: number;
}

// Parse stock status counts from order description
const parseStockStatusCounts = (description: string | null): StockStatusCounts => {
  if (!description) {
    return { awaiting: 0, ordered: 0, inStock: 0, total: 0 };
  }

  const lines = description.split('\n').filter(line => line.trim());
  let awaiting = 0;
  let ordered = 0;
  let inStock = 0;

  lines.forEach(line => {
    const stockMatch = line.match(/\[Stock:\s*(awaiting|ordered|in-stock)\]/);
    if (stockMatch) {
      switch (stockMatch[1]) {
        case 'awaiting':
          awaiting++;
          break;
        case 'ordered':
          ordered++;
          break;
        case 'in-stock':
          inStock++;
          break;
      }
    } else {
      // Default to awaiting if no stock status is specified
      awaiting++;
    }
  });

  return { awaiting, ordered, inStock, total: lines.length };
};

// Stock status indicator component
const StockStatusIndicator = ({ counts }: { counts: StockStatusCounts }) => {
  if (counts.total === 0) return null;

  return (
    <TooltipProvider>
      <div className="flex items-center gap-1">
        {counts.awaiting > 0 && (
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-yellow-100 dark:bg-yellow-900/50 text-yellow-700 dark:text-yellow-300 text-xs font-medium">
                <Clock className="h-3 w-3" />
                <span>{counts.awaiting}</span>
              </div>
            </TooltipTrigger>
            <TooltipContent>
              <p>{counts.awaiting} item{counts.awaiting > 1 ? 's' : ''} awaiting stock</p>
            </TooltipContent>
          </Tooltip>
        )}
        {counts.ordered > 0 && (
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 text-xs font-medium">
                <ShoppingCart className="h-3 w-3" />
                <span>{counts.ordered}</span>
              </div>
            </TooltipTrigger>
            <TooltipContent>
              <p>{counts.ordered} item{counts.ordered > 1 ? 's' : ''} ordered</p>
            </TooltipContent>
          </Tooltip>
        )}
        {counts.inStock > 0 && (
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-green-100 dark:bg-green-900/50 text-green-700 dark:text-green-300 text-xs font-medium">
                <Package className="h-3 w-3" />
                <span>{counts.inStock}</span>
              </div>
            </TooltipTrigger>
            <TooltipContent>
              <p>{counts.inStock} item{counts.inStock > 1 ? 's' : ''} received/in stock</p>
            </TooltipContent>
          </Tooltip>
        )}
      </div>
    </TooltipProvider>
  );
};

// Purchase Orders indicator component
const PurchaseOrdersIndicator = ({ purchaseOrders }: { purchaseOrders?: PurchaseOrderInfo[] }) => {
  if (!purchaseOrders || purchaseOrders.length === 0) return null;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-purple-100 dark:bg-purple-900/50 text-purple-700 dark:text-purple-300 text-xs font-medium cursor-help">
            <Truck className="h-3 w-3" />
            <span>{purchaseOrders.length}</span>
          </div>
        </TooltipTrigger>
        <TooltipContent className="max-w-xs">
          <div className="space-y-1">
            <p className="font-medium text-xs">Linked Purchase Orders:</p>
            {purchaseOrders.map((po, idx) => (
              <p key={idx} className="text-xs">
                {po.supplierName}: <span className="font-mono">{po.purchase_order_number}</span>
              </p>
            ))}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};

export default function OrderRow({ 
  order, 
  isAdmin,
  onReceiveOrder,
  onDeleteOrder,
  onOrderClick,
  compact = false
}: OrderRowProps) {
  const [showDetails, setShowDetails] = useState(false);
  const [showManagePOs, setShowManagePOs] = useState(false);
  const isMobile = useIsMobile();
  const stockCounts = parseStockStatusCounts(order.description);

  const getStatusColor = (status: string | null) => {
    switch (status?.toLowerCase()) {
      case 'delivered':
        return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300';
      case 'in-stock':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300';
      case 'ordered':
        return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300';
      // Legacy status support
      case 'completed':
        return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300';
      case 'processing':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300';
      case 'received':
      case 'in-progress':
        return 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300';
      case 'pending':
        return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300';
      default:
        return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300';
    }
  };

  const getStatusBadge = (status: string | null) => (
    <Badge className={getStatusColor(status)}>
      {status || 'pending'}
    </Badge>
  );

  const handleRowClick = (e: React.MouseEvent) => {
    // Don't navigate if clicking on buttons or dropdowns
    if ((e.target as HTMLElement).closest('button') || (e.target as HTMLElement).closest('[role="menuitem"]')) {
      return;
    }

    // Show details dialog when clicking on any order
    setShowDetails(true);
  };

  if (isMobile) {
    // Mobile card layout
    return (
      <>
        <div className={`cursor-pointer ${compact ? 'p-2' : ''}`} onClick={handleRowClick}>
          <div className={compact ? 'space-y-1' : 'space-y-2'}>
            {/* Order header */}
            <div className="flex justify-between items-start">
              <div className="min-w-0 flex-1">
                <div className={`font-medium truncate ${compact ? 'text-xs' : 'text-sm'}`}>{order.order_number}</div>
                {order.reference && (
                  <div className="text-xs text-muted-foreground truncate">{order.reference}</div>
                )}
              </div>
              <div className="ml-2 flex-shrink-0 flex items-center gap-1">
                <PurchaseOrdersIndicator purchaseOrders={order.purchaseOrders} />
                <StockStatusIndicator counts={stockCounts} />
                {getStatusBadge(order.status)}
              </div>
            </div>

            {/* Purchase Orders display */}
            {order.purchaseOrders && order.purchaseOrders.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {order.purchaseOrders.map((po, idx) => (
                  <Badge key={idx} variant="outline" className="text-[10px] px-1 py-0">
                    {po.supplierName}: {po.purchase_order_number}
                  </Badge>
                ))}
              </div>
            )}
            
            {/* Company and date */}
            <div className="flex justify-between items-center text-xs text-muted-foreground">
              <span className="truncate mr-2">{order.companyName || 'No Company'}</span>
              <span className="flex-shrink-0">{new Date(order.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
            </div>
            
            {/* Actions - hidden in compact mode */}
            {!compact && (
              <div className="flex items-center justify-between gap-2 pt-2 border-t">
                <div className="flex gap-1 flex-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowDetails(true);
                    }}
                    className="flex-1 h-8 text-xs"
                  >
                    <Eye className="h-3 w-3 mr-1" />
                    View
                  </Button>
                  <div onClick={(e) => e.stopPropagation()}>
                    <OrderUpdatesButton
                      orderId={order.id}
                      orderNumber={order.order_number}
                      size="sm"
                      variant="ghost"
                    />
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowManagePOs(true);
                    }}
                    className="h-8 text-xs"
                  >
                    <Truck className="h-3 w-3 mr-1" />
                    POs
                  </Button>
                </div>
                {isAdmin && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button 
                        variant="ghost" 
                        size="sm"
                        onClick={(e) => e.stopPropagation()}
                        className="h-8 w-8 p-0"
                      >
                        <MoreHorizontal className="h-3 w-3" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="z-50 bg-background border">
                      <DropdownMenuItem
                        onClick={(e) => {
                          e.stopPropagation();
                          onReceiveOrder(order);
                        }}
                        className="text-xs"
                      >
                        Receive Order
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={(e) => {
                          e.stopPropagation();
                          onDeleteOrder(order.id, order.order_number);
                        }}
                        className="text-xs"
                      >
                        Delete Order
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>
            )}
          </div>
        </div>

        <OrderDetailsDialog
          open={showDetails}
          onOpenChange={setShowDetails}
          order={order}
          isAdmin={isAdmin}
        />
      </>
    );
  }

  // Desktop table layout
  return (
    <>
      <TableRow 
        className="order-row-hover"
        onClick={handleRowClick}
      >
        <TableCell className={compact ? 'py-2' : ''}>
          <div>
            <div className={`font-medium ${compact ? 'text-sm' : 'text-base'}`}>{order.order_number}</div>
            {order.reference && (
              <div className="text-xs text-muted-foreground">{order.reference}</div>
            )}
          </div>
        </TableCell>
        <TableCell className={`text-sm ${compact ? 'py-2' : ''}`}>{order.companyName || 'No Company'}</TableCell>
        <TableCell className={compact ? 'py-2' : ''}>
          <div className="flex items-center gap-2 flex-wrap">
            {getStatusBadge(order.status)}
            <StockStatusIndicator counts={stockCounts} />
            <PurchaseOrdersIndicator purchaseOrders={order.purchaseOrders} />
            {order.purchaseOrders && order.purchaseOrders.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {order.purchaseOrders.slice(0, 2).map((po, idx) => (
                  <Badge key={idx} variant="outline" className="text-[10px] px-1.5 py-0 font-normal">
                    {po.supplierName}: {po.purchase_order_number}
                  </Badge>
                ))}
                {order.purchaseOrders.length > 2 && (
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0 font-normal">
                    +{order.purchaseOrders.length - 2} more
                  </Badge>
                )}
              </div>
            )}
          </div>
        </TableCell>
        <TableCell className={`text-sm ${compact ? 'py-2' : ''}`}>{new Date(order.created_at).toLocaleDateString()}</TableCell>
        {!compact && <TableCell>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                setShowDetails(true);
              }}
            >
              <Eye className="h-4 w-4" />
              <span className="ml-1">View</span>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                setShowManagePOs(true);
              }}
            >
              <Truck className="h-4 w-4" />
              <span className="ml-1">POs</span>
            </Button>
            <div onClick={(e) => e.stopPropagation()}>
              <OrderUpdatesButton
                orderId={order.id}
                orderNumber={order.order_number}
              />
            </div>
            <OrderExportActions order={order} />
            {isAdmin && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button 
                    variant="ghost" 
                    className="h-8 w-8 p-0"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <span className="sr-only">Open menu</span>
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="z-50 bg-background border">
                  <DropdownMenuItem
                    onClick={(e) => {
                      e.stopPropagation();
                      onReceiveOrder(order);
                    }}
                  >
                    Receive Order
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeleteOrder(order.id, order.order_number);
                    }}
                  >
                    Delete Order
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </TableCell>}
      </TableRow>

      <OrderDetailsDialog
        open={showDetails}
        onOpenChange={setShowDetails}
        order={order}
        isAdmin={isAdmin}
      />

      <ManagePOsDialog
        open={showManagePOs}
        onOpenChange={setShowManagePOs}
        orderId={order.id}
        orderNumber={order.order_number}
      />
    </>
  );
}
