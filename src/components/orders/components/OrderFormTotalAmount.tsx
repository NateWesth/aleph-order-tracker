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
  return <FormField control={control} name="totalAmount" render={({
    field
  }) => {}} />;
};
export default OrderFormTotalAmount;