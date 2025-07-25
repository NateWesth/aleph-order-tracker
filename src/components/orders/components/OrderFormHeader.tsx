
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { RefreshCw } from "lucide-react";
import { Control } from "react-hook-form";
import { generateOrderNumber } from "../utils/orderUtils";

interface OrderFormData {
  orderNumber: string;
  reference?: string;
  companyId: string;
  totalAmount: number;
  urgency: string;
  items: Array<{
    id: string;
    name: string;
    quantity: number;
    unit?: string;
    notes?: string;
  }>;
}

interface OrderFormHeaderProps {
  control: Control<OrderFormData>;
  setValue: (name: keyof OrderFormData, value: any) => void;
}

const OrderFormHeader = ({ control, setValue }: OrderFormHeaderProps) => {
  const handleGenerateOrderNumber = () => {
    const newOrderNumber = generateOrderNumber();
    setValue('orderNumber', newOrderNumber);
  };

  return (
    <div className="space-y-4">
      <FormField 
        control={control} 
        name="orderNumber" 
        rules={{ required: "Order number is required" }} 
        render={({ field }) => (
          <FormItem>
            <FormLabel>Order Number</FormLabel>
            <div className="flex gap-2">
              <FormControl>
                <Input {...field} placeholder="Enter order number or generate one" />
              </FormControl>
              <Button 
                type="button" 
                variant="outline" 
                size="sm" 
                onClick={handleGenerateOrderNumber} 
                className="shrink-0"
              >
                <RefreshCw className="w-4 h-4 mr-1" />
                Generate
              </Button>
            </div>
            <FormMessage />
          </FormItem>
        )} 
      />
      
      <FormField 
        control={control} 
        name="reference" 
        render={({ field }) => (
          <FormItem>
            <FormLabel>Order Reference (Optional)</FormLabel>
            <FormControl>
              <Input {...field} placeholder="Enter order reference" />
            </FormControl>
            <FormMessage />
          </FormItem>
        )} 
      />
    </div>
  );
};

export default OrderFormHeader;
