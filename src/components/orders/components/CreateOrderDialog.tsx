
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import OrderForm from "./OrderForm";
import { getUserRole } from "@/utils/authService";

interface CreateOrderDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onOrderCreated: () => void;
  isAdmin?: boolean;
}

export default function CreateOrderDialog({
  isOpen,
  onClose,
  onOrderCreated,
  isAdmin = false
}: CreateOrderDialogProps) {
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();
  const { user } = useAuth();

  const handleSubmit = async (orderData: {
    orderNumber: string;
    description: string;
    companyId: string;
    totalAmount: number;
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
    
    try {
      // Get user role for additional context
      const userRole = await getUserRole(user.id);
      console.log("🔐 CreateOrderDialog: User role:", userRole);
      
      // Prepare order data for database insertion
      const orderInsertData = {
        order_number: orderData.orderNumber,
        description: orderData.description,
        company_id: orderData.companyId,
        total_amount: orderData.totalAmount || 0,
        user_id: user.id,
        status: 'pending',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      console.log("💾 CreateOrderDialog: Final order data for database:", orderInsertData);
      console.log("🏢 CreateOrderDialog: Company ID being saved:", orderInsertData.company_id);
      console.log("👤 CreateOrderDialog: User ID being saved:", orderInsertData.user_id);

      // Verify company exists before creating order
      if (orderInsertData.company_id) {
        const { data: companyCheck, error: companyError } = await supabase
          .from('companies')
          .select('id, name, code')
          .eq('id', orderInsertData.company_id)
          .single();

        if (companyError) {
          console.error("❌ CreateOrderDialog: Company verification failed:", companyError);
          throw new Error(`Company verification failed: ${companyError.message}`);
        }

        console.log("✅ CreateOrderDialog: Company verified:", companyCheck);
      } else {
        console.warn("⚠️ CreateOrderDialog: No company ID provided - order will be created without company link");
      }

      // Insert the order into the database
      const { data: createdOrder, error: insertError } = await supabase
        .from('orders')
        .insert([orderInsertData])
        .select('*')
        .single();

      if (insertError) {
        console.error("❌ CreateOrderDialog: Database insertion failed:", insertError);
        console.error("❌ CreateOrderDialog: Insert error details:", {
          code: insertError.code,
          message: insertError.message,
          details: insertError.details,
          hint: insertError.hint
        });
        throw insertError;
      }

      console.log("🎉 CreateOrderDialog: Order created successfully in database:", createdOrder);
      console.log("🔍 CreateOrderDialog: Created order company_id:", createdOrder.company_id);
      console.log("🔍 CreateOrderDialog: Created order user_id:", createdOrder.user_id);

      // Verify the order was saved with correct company_id
      const { data: verificationOrder, error: verificationError } = await supabase
        .from('orders')
        .select('*')
        .eq('id', createdOrder.id)
        .single();

      if (verificationError) {
        console.error("❌ CreateOrderDialog: Order verification failed:", verificationError);
      } else {
        console.log("✅ CreateOrderDialog: Order verification successful:", verificationOrder);
        console.log("🏢 CreateOrderDialog: Verified company_id in database:", verificationOrder.company_id);
      }

      toast({
        title: "Order Created Successfully",
        description: `Order ${orderData.orderNumber} has been created and linked to the company.`,
      });

      onClose();
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
    <Dialog open={isOpen} onOpenChange={onClose}>
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
