
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Plus } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import OrderForm from "./OrderForm";
import { getUserRole } from "@/utils/authService";
import { generateOrderNumber } from "../utils/orderUtils";

interface CreateOrderDialogProps {
  isAdmin?: boolean;
  companies: any[];
  profiles: any[];
  userProfile: any;
  onOrderCreated: () => void;
}

export default function CreateOrderDialog({
  isAdmin = false,
  companies,
  profiles,
  userProfile,
  onOrderCreated
}: CreateOrderDialogProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();
  const { user } = useAuth();

  const createOrderWithRetry = async (orderData: any, maxRetries: number = 3): Promise<any> => {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`🔄 CreateOrderDialog: Attempt ${attempt} to create order`);
        
        // Generate a new order number for each attempt
        const orderNumber = generateOrderNumber();
        const orderInsertData = {
          ...orderData,
          order_number: orderNumber
        };

        console.log(`📋 CreateOrderDialog: Using order number: ${orderNumber}`);

        const { data: createdOrder, error: insertError } = await supabase
          .from('orders')
          .insert([orderInsertData])
          .select('*')
          .single();

        if (insertError) {
          if (insertError.code === '23505' && insertError.message.includes('orders_order_number_key')) {
            console.log(`⚠️ CreateOrderDialog: Duplicate order number on attempt ${attempt}, retrying...`);
            if (attempt === maxRetries) {
              throw new Error(`Failed to generate unique order number after ${maxRetries} attempts`);
            }
            continue; // Retry with new order number
          }
          throw insertError; // Re-throw non-duplicate errors
        }

        console.log("🎉 CreateOrderDialog: Order created successfully:", createdOrder);
        return createdOrder;
        
      } catch (error) {
        if (attempt === maxRetries) {
          throw error; // Re-throw on final attempt
        }
        console.log(`❌ CreateOrderDialog: Attempt ${attempt} failed, retrying...`);
        // Wait briefly before retry
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
  };

  const handleSubmit = async (orderData: {
    orderNumber: string;
    companyId: string;
    totalAmount: number;
    urgency: string;
    items: any[];
  }) => {
    if (!user?.id) {
      console.error("❌ CreateOrderDialog: No user ID available");
      toast({
        title: "Error",
        description: "User not authenticated. Please log in again.",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    console.log("🚀 CreateOrderDialog: Starting order creation process");
    console.log("📋 CreateOrderDialog: Order data received:", orderData);
    console.log("👤 CreateOrderDialog: Current user ID:", user.id);
    console.log("🎯 CreateOrderDialog: Order urgency:", orderData.urgency);
    
    try {
      // Get user role for additional context
      const userRole = await getUserRole(user.id);
      console.log("🔐 CreateOrderDialog: User role:", userRole);
      
      // Create description from items
      const itemsDescription = orderData.items
        .filter(item => item.name && item.quantity > 0)
        .map(item => `${item.name} (Qty: ${item.quantity})`)
        .join('\n');
      
      // Prepare order data for database insertion - WITHOUT the order_number (will be generated in retry function)
      const baseOrderData = {
        description: itemsDescription,
        company_id: orderData.companyId,
        total_amount: orderData.totalAmount || 0,
        user_id: user.id,
        status: 'pending',
        urgency: orderData.urgency,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      console.log("💾 CreateOrderDialog: Base order data for database:", baseOrderData);

      // Verify company exists before creating order
      if (baseOrderData.company_id) {
        const { data: companyCheck, error: companyError } = await supabase
          .from('companies')
          .select('id, name, code')
          .eq('id', baseOrderData.company_id)
          .single();

        if (companyError) {
          console.error("❌ CreateOrderDialog: Company verification failed:", companyError);
          throw new Error(`Company verification failed: ${companyError.message}`);
        }

        console.log("✅ CreateOrderDialog: Company verified:", companyCheck);
      } else {
        console.warn("⚠️ CreateOrderDialog: No company ID provided - order will be created without company link");
      }

      // Create order with retry mechanism
      const createdOrder = await createOrderWithRetry(baseOrderData);

      console.log("🎉 CreateOrderDialog: Order created successfully with retry mechanism:", createdOrder);

      const urgencyText = orderData.urgency !== 'normal' ? ` with ${orderData.urgency.toUpperCase()} priority` : '';
      toast({
        title: "Order Created Successfully",
        description: `Order ${createdOrder.order_number} has been created${urgencyText} and linked to the company.`,
      });

      setOpen(false);
      onOrderCreated();
      
    } catch (error: any) {
      console.error("❌ CreateOrderDialog: Order creation failed:", error);
      toast({
        title: "Error Creating Order",
        description: error.message || "Failed to create order. Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="w-4 h-4 mr-2" />
          Create Order
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create New Order</DialogTitle>
          <DialogDescription>
            Fill in the order details below. All fields marked with * are required.
          </DialogDescription>
        </DialogHeader>
        <OrderForm onSubmit={handleSubmit} loading={loading} />
      </DialogContent>
    </Dialog>
  );
}
