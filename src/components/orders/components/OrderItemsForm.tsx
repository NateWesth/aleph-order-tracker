
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Trash2 } from "lucide-react";
import { Control } from "react-hook-form";
import { OrderFormData } from "../types/OrderFormData";

interface OrderItemsFormProps {
  control: Control<OrderFormData>;
  index: number;
  onRemove: () => void;
  canRemove: boolean;
}

export const OrderItemsForm = ({ control, index, onRemove, canRemove }: OrderItemsFormProps) => {
  return (
    <div className="grid grid-cols-12 gap-3 items-end p-4 border rounded-lg">
      <div className="col-span-4">
        <FormField 
          control={control} 
          name={`items.${index}.name`} 
          rules={{ required: "Item name is required" }} 
          render={({ field }) => (
            <FormItem>
              <FormLabel>Item Name</FormLabel>
              <FormControl>
                <Input {...field} placeholder="Enter item name" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )} 
        />
      </div>
      <div className="col-span-2">
        <FormField 
          control={control} 
          name={`items.${index}.quantity`} 
          rules={{
            required: "Quantity is required",
            min: { value: 1, message: "Quantity must be at least 1" }
          }} 
          render={({ field }) => (
            <FormItem>
              <FormLabel>Quantity</FormLabel>
              <FormControl>
                <Input 
                  {...field} 
                  type="number" 
                  min="1" 
                  onChange={e => field.onChange(parseInt(e.target.value) || 0)} 
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )} 
        />
      </div>
      <div className="col-span-2">
        <FormField 
          control={control} 
          name={`items.${index}.unit`} 
          render={({ field }) => (
            <FormItem>
              <FormLabel>Unit</FormLabel>
              <FormControl>
                <Input {...field} placeholder="e.g., kg, pcs" />
              </FormControl>
            </FormItem>
          )} 
        />
      </div>
      <div className="col-span-3">
        <FormField 
          control={control} 
          name={`items.${index}.notes`} 
          render={({ field }) => (
            <FormItem>
              <FormLabel>Notes</FormLabel>
              <FormControl>
                <Input {...field} placeholder="Additional notes" />
              </FormControl>
            </FormItem>
          )} 
        />
      </div>
      <div className="col-span-1">
        <Button 
          type="button" 
          onClick={onRemove} 
          size="sm" 
          variant="outline" 
          disabled={!canRemove} 
          className="w-full"
        >
          <Trash2 className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
};
