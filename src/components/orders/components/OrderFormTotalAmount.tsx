
import { Input } from "@/components/ui/input";
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Control } from "react-hook-form";

interface OrderFormData {
  orderNumber: string;
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

interface OrderFormTotalAmountProps {
  control: Control<OrderFormData>;
}

const OrderFormTotalAmount = ({ control }: OrderFormTotalAmountProps) => {
  return (
    <FormField 
      control={control} 
      name="totalAmount" 
      render={({ field }) => (
        <FormItem>
          <FormLabel>Total Amount (Optional)</FormLabel>
          <FormControl>
            <Input 
              {...field} 
              type="number" 
              placeholder="0.00" 
              step="0.01" 
              min="0" 
              onChange={e => field.onChange(parseFloat(e.target.value) || 0)} 
            />
          </FormControl>
          <FormMessage />
        </FormItem>
      )} 
    />
  );
};

export default OrderFormTotalAmount;
