
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import OrderForm from "./OrderForm";
import { generateOrderNumber } from "../utils/orderUtils";

interface CreateOrderDialogProps {
  isAdmin: boolean;
  companies: Array<{ id: string; name: string; code: string }>;
  profiles: Array<{ id: string; full_name: string; email: string; company_id: string }>;
  userProfile: any;
  onOrderCreated: () => void;
}

export default function CreateOrderDialog({
  isAdmin,
  companies,
  profiles,
  userProfile,
  onOrderCreated
}: CreateOrderDialogProps) {
  const { toast } = useToast();
  const { user } = useAuth();
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleOrderSubmit = async (orderData: {
    description: string;
    companyId: string;
    totalAmount: number;
    items: any[];
  }) => {
    if (!orderData.description.trim() || orderData.items.length === 0) {
      toast({
        title: "Error",
        description: "Please provide a description and add at least one item.",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);

    try {
      console.log("Creating order with real-time updates...");
      
      // Convert items to a formatted description string
      const itemsDescription = orderData.items.map(item => 
        `${item.name} (Qty: ${item.quantity})`
      ).join('\n');
      
      const newOrderData = {
        order_number: generateOrderNumber(),
        description: itemsDescription,
        total_amount: orderData.totalAmount || null,
        status: 'pending',
        company_id: orderData.companyId || null,
        user_id: user?.id
      };

      console.log("Order data for real-time insert:", newOrderData);

      // Insert the order - this will trigger real-time updates automatically
      const { error } = await supabase
        .from('orders')
        .insert([newOrderData]);

      if (error) {
        console.error("Order creation error:", error);
        throw error;
      }

      console.log("Order created successfully - real-time updates should be triggered");

      toast({
        title: "Order Created",
        description: `Order ${newOrderData.order_number} has been created successfully with ${orderData.items.length} item(s).`,
      });

      setShowCreateDialog(false);
      
      // Call the callback to refresh local state
      onOrderCreated();
    } catch (error: any) {
      console.error("Failed to create order:", error);
      toast({
        title: "Error",
        description: "Failed to create order. Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="h-4 w-4 mr-2" />
          Create Order
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create New Order</DialogTitle>
        </DialogHeader>
        <OrderForm
          onSubmit={handleOrderSubmit}
          loading={loading}
        />
      </DialogContent>
    </Dialog>
  );
}
