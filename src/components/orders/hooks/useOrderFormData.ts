
import { useUserData } from "@/hooks/useUserData";

export const useOrderFormData = () => {
  const { 
    profile: userProfile,
    role: currentUserRole, 
    companies,
    userCompany,
    availableCompanies,
    isLoading: isLoadingUserInfo
  } = useUserData();

  const { user } = { user: userProfile ? { id: userProfile.id } : null };
  const companiesLoading = isLoadingUserInfo;

  return {
    user,
    userProfile,
    availableCompanies,
    currentUserRole,
    isLoadingUserInfo,
    userCompany,
    companiesLoading
  };
};
