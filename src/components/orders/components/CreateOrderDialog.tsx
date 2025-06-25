
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
  const [newOrder, setNewOrder] = useState({
    order_number: '',
    description: '',
    total_amount: '',
    company_id: '',
    user_id: ''
  });

  const createOrder = async () => {
    if (!newOrder.order_number || !newOrder.description) {
      toast({
        title: "Error",
        description: "Please fill in all required fields.",
        variant: "destructive",
      });
      return;
    }

    try {
      console.log("Creating order...");
      
      // For client users, automatically use their company_id from their profile
      let orderCompanyId = null;
      if (isAdmin) {
        orderCompanyId = newOrder.company_id || null;
      } else {
        // Client user - use their company_id from profile
        orderCompanyId = userProfile?.company_id || null;
      }
      
      const orderData = {
        order_number: newOrder.order_number,
        description: newOrder.description,
        total_amount: newOrder.total_amount ? parseFloat(newOrder.total_amount) : null,
        status: 'pending',
        company_id: orderCompanyId,
        user_id: isAdmin ? (newOrder.user_id || user?.id) : user?.id
      };

      console.log("Order data:", orderData);

      const { error } = await supabase
        .from('orders')
        .insert([orderData]);

      if (error) {
        console.error("Order creation error:", error);
        throw error;
      }

      console.log("Order created successfully");

      toast({
        title: "Order Created",
        description: `Order ${newOrder.order_number} has been created successfully.`,
      });

      setShowCreateDialog(false);
      setNewOrder({
        order_number: '',
        description: '',
        total_amount: '',
        company_id: '',
        user_id: ''
      });
      onOrderCreated();
    } catch (error: any) {
      console.error("Failed to create order:", error);
      toast({
        title: "Error",
        description: "Failed to create order. Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleGenerateOrderNumber = () => {
    setNewOrder({ ...newOrder, order_number: generateOrderNumber() });
  };

  const getCompanyProfiles = (companyId: string) => {
    return profiles.filter(profile => profile.company_id === companyId);
  };

  return (
    <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="h-4 w-4 mr-2" />
          Create Order
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Create New Order</DialogTitle>
        </DialogHeader>
        <OrderForm
          newOrder={newOrder}
          setNewOrder={setNewOrder}
          isAdmin={isAdmin}
          companies={companies}
          profiles={getCompanyProfiles(newOrder.company_id)}
          userProfile={userProfile}
          onGenerateOrderNumber={handleGenerateOrderNumber}
          onSubmit={createOrder}
          onCancel={() => setShowCreateDialog(false)}
        />
      </DialogContent>
    </Dialog>
  );
}
