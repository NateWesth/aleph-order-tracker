
import { useUserData } from "@/hooks/useUserData";

export interface Company {
  id: string;
  name: string;
  code: string;
  contact_person?: string;
  email?: string;
  phone?: string;
  address?: string;
  vat_number?: string;
  account_manager?: string;
  logo?: string;
  created_at?: string;
  updated_at?: string;
}

export const useCompanyData = () => {
  const { 
    companies, 
    isLoading: loading, 
    error, 
    refetch 
  } = useUserData();

  return {
    companies,
    loading,
    error,
    refetch
  };
};
