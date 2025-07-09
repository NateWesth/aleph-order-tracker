
import { Textarea } from "@/components/ui/textarea";
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Control } from "react-hook-form";

interface OrderFormData {
  orderNumber: string;
  description: string;
  companyId: string;
  totalAmount: number;
  items: Array<{
    id: string;
    name: string;
    quantity: number;
    unit?: string;
    notes?: string;
  }>;
}

interface OrderFormDescriptionProps {
  control: Control<OrderFormData>;
}

const OrderFormDescription = ({ control }: OrderFormDescriptionProps) => {
  return (
    <FormField 
      control={control} 
      name="description" 
      rules={{ required: "Order description is required" }} 
      render={({ field }) => (
        <FormItem>
          <FormLabel>Order Description</FormLabel>
          <FormControl>
            <Textarea 
              {...field} 
              placeholder="Describe the order requirements..." 
              className="min-h-[100px]" 
            />
          </FormControl>
          <FormMessage />
        </FormItem>
      )} 
    />
  );
};

export default OrderFormDescription;
