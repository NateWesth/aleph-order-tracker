
import { Input } from "@/components/ui/input";
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { UseFormRegister } from "react-hook-form";
import { OrderFormData } from "../../types/OrderFormData";

interface Company {
  id: string;
  name: string;
  code: string;
}

interface ClientCompanyDisplayProps {
  register: UseFormRegister<OrderFormData>;
  userCompany: Company | null;
}

export const ClientCompanyDisplay = ({ 
  register, 
  userCompany 
}: ClientCompanyDisplayProps) => {
  return (
    <FormItem>
      <FormLabel>Company</FormLabel>
      <FormControl>
        <Input 
          value={userCompany ? `${userCompany.name} (${userCompany.code})` : "No company assigned"} 
          readOnly 
          className="bg-gray-50"
        />
      </FormControl>
      <input 
        type="hidden" 
        {...register("companyId")} 
        value={userCompany?.id || ""} 
      />
      <FormMessage />
    </FormItem>
  );
};
