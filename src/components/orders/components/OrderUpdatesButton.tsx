import React, { useState } from 'react';
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MessageCircle } from 'lucide-react';
import { OrderUpdatesDialog } from './OrderUpdatesDialog';
import { useOrderUpdates } from '@/hooks/useOrderUpdates';

interface OrderUpdatesButtonProps {
  orderId: string;
  orderNumber: string;
  variant?: 'default' | 'ghost' | 'outline';
  size?: 'sm' | 'default' | 'lg';
}

export const OrderUpdatesButton: React.FC<OrderUpdatesButtonProps> = ({
  orderId,
  orderNumber,
  variant = 'outline',
  size = 'sm'
}) => {
  const [showDialog, setShowDialog] = useState(false);
  const { unreadCount, updateUnreadCount } = useOrderUpdates(orderId);

  return (
    <>
      <Button
        variant={variant}
        size={size}
        onClick={() => setShowDialog(true)}
        className="flex items-center gap-2 relative"
      >
        <MessageCircle size={16} />
        Updates
        {unreadCount > 0 && (
          <Badge 
            variant="destructive" 
            className="absolute -top-2 -right-2 h-5 w-5 p-0 flex items-center justify-center text-xs"
          >
            {unreadCount > 99 ? '99+' : unreadCount}
          </Badge>
        )}
      </Button>

      <OrderUpdatesDialog
        isOpen={showDialog}
        onClose={() => setShowDialog(false)}
        orderId={orderId}
        orderNumber={orderNumber}
        unreadCount={unreadCount}
        onUnreadCountChange={updateUnreadCount}
      />
    </>
  );
};