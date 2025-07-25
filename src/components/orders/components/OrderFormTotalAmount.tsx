import { Input } from "@/components/ui/input";
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Control } from "react-hook-form";
import { OrderFormData } from "../types/OrderFormData";
interface OrderFormTotalAmountProps {
  control: Control<OrderFormData>;
}
const OrderFormTotalAmount = ({
  control
}: OrderFormTotalAmountProps) => {
  return (
    <FormField 
      control={control} 
      name="totalAmount" 
      render={({ field }) => (
        <FormItem>
          <FormLabel>Total Amount</FormLabel>
          <FormControl>
            <Input 
              {...field} 
              type="number" 
              step="0.01" 
              placeholder="0.00"
              onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
            />
          </FormControl>
          <FormMessage />
        </FormItem>
      )} 
    />
  );
};
export default OrderFormTotalAmount;