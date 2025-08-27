
import { TableCell, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FileText, Eye, MoreHorizontal } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import OrderExportActions from "./OrderExportActions";
import { OrderUpdatesButton } from "./OrderUpdatesButton";
import { useState } from "react";
import OrderDetailsDialog from "./OrderDetailsDialog";
import { OrderWithCompany } from "../types/orderTypes";
import { useNavigate } from "react-router-dom";
import { useIsMobile } from "@/hooks/use-mobile";

interface OrderRowProps {
  order: OrderWithCompany;
  isAdmin: boolean;
  onReceiveOrder: (order: OrderWithCompany) => void;
  onDeleteOrder: (orderId: string, orderNumber: string) => void;
  onOrderClick?: (order: OrderWithCompany) => void;
}

export default function OrderRow({ 
  order, 
  isAdmin,
  onReceiveOrder,
  onDeleteOrder,
  onOrderClick
}: OrderRowProps) {
  const [showDetails, setShowDetails] = useState(false);
  const navigate = useNavigate();
  const isMobile = useIsMobile();

  const getStatusColor = (status: string | null) => {
    switch (status?.toLowerCase()) {
      case 'completed':
        return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300';
      case 'processing':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300';
      case 'received':
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

    if (onOrderClick) {
      onOrderClick(order);
      return;
    }

    // Navigate based on order status if admin
    if (isAdmin) {
      const status = order.status?.toLowerCase();
      switch (status) {
        case 'pending':
          navigate('/admin-dashboard');
          // Set active view to orders after navigation
          setTimeout(() => {
            const event = new CustomEvent('setActiveView', { detail: 'orders' });
            window.dispatchEvent(event);
          }, 100);
          break;
        case 'received':
        case 'in-progress':
          navigate('/admin-dashboard');
          setTimeout(() => {
            const event = new CustomEvent('setActiveView', { detail: 'progress' });
            window.dispatchEvent(event);
          }, 100);
          break;
        case 'processing':
          navigate('/admin-dashboard');
          setTimeout(() => {
            const event = new CustomEvent('setActiveView', { detail: 'processing' });
            window.dispatchEvent(event);
          }, 100);
          break;
        case 'completed':
          navigate('/admin-dashboard');
          setTimeout(() => {
            const event = new CustomEvent('setActiveView', { detail: 'completed' });
            window.dispatchEvent(event);
          }, 100);
          break;
        default:
          navigate('/admin-dashboard');
          setTimeout(() => {
            const event = new CustomEvent('setActiveView', { detail: 'orders' });
            window.dispatchEvent(event);
          }, 100);
      }
    }
  };

  if (isMobile) {
    // Mobile card layout
    return (
      <>
        <div className="cursor-pointer" onClick={handleRowClick}>
          <div className="space-y-2">
            {/* Order header */}
            <div className="flex justify-between items-start">
              <div className="min-w-0 flex-1">
                <div className="font-medium text-sm truncate">{order.order_number}</div>
                {order.reference && (
                  <div className="text-xs text-muted-foreground truncate">{order.reference}</div>
                )}
              </div>
              <div className="ml-2 flex-shrink-0">
                {getStatusBadge(order.status)}
              </div>
            </div>
            
            {/* Company and date */}
            <div className="flex justify-between items-center text-xs text-muted-foreground">
              <span className="truncate mr-2">{order.companyName || 'No Company'}</span>
              <span className="flex-shrink-0">{new Date(order.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
            </div>
            
            {/* Actions */}
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
          </div>
        </div>

        <OrderDetailsDialog
          open={showDetails}
          onOpenChange={setShowDetails}
          order={order}
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
        <TableCell>
          <div>
            <div className="font-medium text-base">{order.order_number}</div>
            {order.reference && (
              <div className="text-sm text-muted-foreground">{order.reference}</div>
            )}
          </div>
        </TableCell>
        <TableCell className="text-sm">{order.companyName || 'No Company'}</TableCell>
        <TableCell>
          {getStatusBadge(order.status)}
        </TableCell>
        <TableCell className="text-sm">{new Date(order.created_at).toLocaleDateString()}</TableCell>
        <TableCell>
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
        </TableCell>
      </TableRow>

      <OrderDetailsDialog
        open={showDetails}
        onOpenChange={setShowDetails}
        order={order}
      />
    </>
  );
}
