
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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

interface Company {
  id: string;
  name: string;
  code: string;
}

interface AdminCompanySelectorProps {
  control: Control<OrderFormData>;
  availableCompanies: Company[];
}

export const AdminCompanySelector = ({ 
  control, 
  availableCompanies 
}: AdminCompanySelectorProps) => {
  return (
    <FormField 
      control={control} 
      name="companyId" 
      rules={{ required: "Company is required" }} 
      render={({ field }) => (
        <FormItem>
          <FormLabel>Company</FormLabel>
          <Select value={field.value} onValueChange={field.onChange}>
            <FormControl>
              <SelectTrigger>
                <SelectValue placeholder="Select a company" />
              </SelectTrigger>
            </FormControl>
            <SelectContent>
              {availableCompanies.map(company => (
                <SelectItem key={company.id} value={company.id}>
                  {company.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <FormMessage />
        </FormItem>
      )} 
    />
  );
};
