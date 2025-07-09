
import { Control, UseFormRegister } from "react-hook-form";
import { AdminCompanySelector } from "./company/AdminCompanySelector";
import { ClientCompanyDisplay } from "./company/ClientCompanyDisplay";
import { OrderFormData } from "../types/OrderFormData";

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
      <AdminCompanySelector
        control={control}
        availableCompanies={availableCompanies}
      />
    );
  }

  return (
    <ClientCompanyDisplay
      register={register}
      userCompany={userCompany}
    />
  );
};

export default OrderFormCompanySelector;
