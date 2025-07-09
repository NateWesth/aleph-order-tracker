
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Control } from "react-hook-form";
import { OrderFormData } from "../../types/OrderFormData";

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
      render={({ field }) => (
        <FormItem>
          <FormLabel>Company *</FormLabel>
          <Select 
            value={field.value || ""} 
            onValueChange={(value) => {
              console.log("🏢 AdminCompanySelector: Company selected:", value);
              field.onChange(value);
            }}
          >
            <FormControl>
              <SelectTrigger>
                <SelectValue placeholder="Select a company" />
              </SelectTrigger>
            </FormControl>
            <SelectContent>
              {availableCompanies.map(company => (
                <SelectItem key={company.id} value={company.id}>
                  {company.name} ({company.code})
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
