import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Trash2 } from "lucide-react";
import { Control } from "react-hook-form";
import { OrderFormData } from "../types/OrderFormData";
import { useIsMobile } from "@/hooks/use-mobile";

interface OrderItemsFormProps {
  control: Control<OrderFormData>;
  index: number;
  onRemove: () => void;
  canRemove: boolean;
}

export const OrderItemsForm = ({ control, index, onRemove, canRemove }: OrderItemsFormProps) => {
  const handleItemNameChange = (e: React.ChangeEvent<HTMLInputElement>, onChange: (value: string) => void) => {
    // Allow all characters including special characters
    onChange(e.target.value);
  };

  const isMobile = useIsMobile();

  return (
    <div className={`border rounded-lg space-y-3 ${isMobile ? 'p-3' : 'p-4'}`}>
      {/* Mobile-first responsive layout */}
      <div className={`space-y-3 ${isMobile ? '' : 'sm:space-y-4'}`}>
        {/* Item Name - Full width on mobile */}
        <div className="w-full">
          <FormField 
            control={control} 
            name={`items.${index}.name`} 
            rules={{ required: "Item name is required" }} 
            render={({ field }) => (
              <FormItem>
                <FormLabel className={isMobile ? 'text-sm' : ''}>Item Name</FormLabel>
                <FormControl>
                  <Input 
                    {...field} 
                    placeholder="Enter item name" 
                    onChange={(e) => handleItemNameChange(e, field.onChange)}
                    className={`w-full ${isMobile ? 'h-9 text-sm' : ''}`}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )} 
          />
        </div>

        {/* Quantity and Unit row */}
        <div className="grid grid-cols-2 gap-3">
          <FormField 
            control={control} 
            name={`items.${index}.quantity`} 
            rules={{
              required: "Quantity is required",
              min: { value: 1, message: "Quantity must be at least 1" }
            }} 
            render={({ field }) => (
              <FormItem>
                <FormLabel className={isMobile ? 'text-sm' : ''}>Quantity</FormLabel>
                <FormControl>
                  <Input 
                    {...field} 
                    type="number" 
                    min="1" 
                    onChange={e => field.onChange(parseInt(e.target.value) || 0)} 
                    className={`w-full ${isMobile ? 'h-9 text-sm' : ''}`}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )} 
          />
          <FormField 
            control={control} 
            name={`items.${index}.unit`} 
            render={({ field }) => (
              <FormItem>
                <FormLabel className={isMobile ? 'text-sm' : ''}>Unit</FormLabel>
                <FormControl>
                  <Input 
                    {...field} 
                    placeholder="e.g., kg, pcs" 
                    className={`w-full ${isMobile ? 'h-9 text-sm' : ''}`}
                  />
                </FormControl>
              </FormItem>
            )} 
          />
        </div>

        {/* Notes and Remove button row */}
        <div className="flex gap-3">
          <div className="flex-1">
            <FormField 
              control={control} 
              name={`items.${index}.notes`} 
              render={({ field }) => (
                <FormItem>
                  <FormLabel className={isMobile ? 'text-sm' : ''}>Notes</FormLabel>
                  <FormControl>
                    <Input 
                      {...field} 
                      placeholder="Additional notes" 
                      className={`w-full ${isMobile ? 'h-9 text-sm' : ''}`}
                    />
                  </FormControl>
                </FormItem>
              )} 
            />
          </div>
          <div className="flex items-end">
            <Button 
              type="button" 
              onClick={onRemove} 
              size="sm" 
              variant="outline" 
              disabled={!canRemove}
              className={isMobile ? 'h-9 px-2' : 'h-10 px-3'}
            >
              <Trash2 className={isMobile ? 'w-3 h-3' : 'w-4 h-4'} />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};
