
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Control, UseFormRegister } from "react-hook-form";

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

interface OrderFormCompanySelectorProps {
  control: Control<OrderFormData>;
  register: UseFormRegister<OrderFormData>;
  currentUserRole: string;
  availableCompanies: Company[];
  userCompany: Company | null;
}

const OrderFormCompanySelector = ({ 
  control, 
  register,
  currentUserRole, 
  availableCompanies, 
  userCompany 
}: OrderFormCompanySelectorProps) => {
  if (currentUserRole === 'admin') {
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
  }

  return (
    <div className="space-y-2">
      <Label>Company</Label>
      {userCompany ? (
        <div className="p-4 bg-white dark:bg-black border border-gray-300 dark:border-gray-600 rounded-md py-0">
          <div className="font-medium text-black dark:text-white">
            {userCompany.name}
          </div>
        </div>
      ) : (
        <div className="text-sm text-red-600 bg-red-50 p-3 rounded">
          <div className="font-medium">No company association found.</div>
          <div className="text-xs mt-1">
            Your account is not linked to any company. Please contact an administrator to resolve this issue.
          </div>
        </div>
      )}
      <input type="hidden" {...register('companyId')} value={userCompany?.id || ''} />
    </div>
  );
};

export default OrderFormCompanySelector;
