import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import OrderForm from "./OrderForm";
import { getUserRole } from "@/utils/authService";
import { sendOrderNotification } from "@/utils/emailNotifications";
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
  const {
    toast
  } = useToast();
  const {
    user
  } = useAuth();
  const handleSubmit = async (orderData:{requestId:string;orderNumber:string;companyId:string;urgency:string;items:any[];purchaseOrders:any[]}):Promise<boolean> => {
    if(!user?.id||loading)return false;
    setLoading(true);
    try{
      const {data:createdId,error}=await (supabase as any).rpc("create_order_draft_safe",{
        p_request_id:orderData.requestId,p_order:{order_number:orderData.orderNumber,company_id:orderData.companyId,urgency:orderData.urgency},
        p_items:orderData.items,p_purchase_orders:orderData.purchaseOrders
      });
      if(error)throw new Error(error.message);
      // A notification failure must not turn a confirmed order into a failed save.
      try {
        await sendOrderNotification({
          orderId:createdId,orderNumber:orderData.orderNumber,
          companyName:companies.find(company=>company.id===orderData.companyId)?.name||"Unknown Company",
          changeType:"created",newStatus:"ordered",
          description:orderData.items.map(item=>item.description||item.name).filter(Boolean).join(", ")
        });
      } catch(notificationError) { console.warn("Order saved; notification was not sent",notificationError); }
      toast({title:"Order saved",description:"Order, items and PO links saved together."});setOpen(false);onOrderCreated();return true;
    }catch(error){toast({title:"Order not confirmed — draft kept",description:error instanceof Error?error.message:"Retry the same draft",variant:"destructive"});return false;}
    finally{setLoading(false);}
  };
  return <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="bg-emerald-950 hover:bg-emerald-800">
          <Plus className="w-4 h-4 mr-2" />
          Create Order
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto w-[95vw] md:w-full">
        <DialogHeader>
          <DialogTitle className="text-lg md:text-xl">Create New Order</DialogTitle>
          <DialogDescription className="text-sm md:text-base">
            Fill in the order details below. All fields marked with * are required.
          </DialogDescription>
        </DialogHeader>
        <OrderForm onSubmit={handleSubmit} loading={loading} />
      </DialogContent>
    </Dialog>;
}
