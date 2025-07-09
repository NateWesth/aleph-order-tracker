
import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useCompanyData } from "@/components/admin/hooks/useCompanyData";
import { getUserProfile, getUserRole } from "@/utils/auth";

export const useOrderFormData = () => {
  const { user } = useAuth();
  const { companies, loading: companiesLoading } = useCompanyData();
  const [userProfile, setUserProfile] = useState<any>(null);
  const [availableCompanies, setAvailableCompanies] = useState<any[]>([]);
  const [currentUserRole, setCurrentUserRole] = useState<string>('');
  const [isLoadingUserInfo, setIsLoadingUserInfo] = useState(false);
  const [userCompany, setUserCompany] = useState<any>(null);

  useEffect(() => {
    const fetchUserInfo = async () => {
      if (!user?.id || companies.length === 0) {
        console.log("🔍 OrderForm: Skipping fetchUserInfo - userId:", user?.id, "companies:", companies.length);
        return;
      }

      setIsLoadingUserInfo(true);
      try {
        console.log("🔍 OrderForm: Starting user info fetch for:", user.id);
        console.log("🔍 OrderForm: Available companies count:", companies.length);

        const [role, profile] = await Promise.all([
          getUserRole(user.id),
          getUserProfile(user.id)
        ]);

        console.log("🔍 OrderForm: User role:", role);
        console.log("🔍 OrderForm: User profile:", profile);

        setCurrentUserRole(role);
        setUserProfile(profile);

        if (role === 'admin') {
          console.log("👑 OrderForm: Admin user - showing all companies:", companies.length);
          setAvailableCompanies(companies);
        } else if (role === 'user') {
          console.log("👤 OrderForm: Client user - auto-linking to their company");

          let userLinkedCompany = null;
          if (profile?.company_id) {
            userLinkedCompany = companies.find(company => company.id === profile.company_id);
          } else if (profile?.company_code) {
            userLinkedCompany = companies.find(company => company.code === profile.company_code);
          }

          if (userLinkedCompany) {
            console.log("✅ OrderForm: Found user's company:", userLinkedCompany.name);
            setUserCompany(userLinkedCompany);
          } else {
            console.error("❌ OrderForm: No matching company found for client user");
            setUserCompany(null);
          }
          setAvailableCompanies([]);
        }
      } catch (error) {
        console.error("❌ OrderForm: Error fetching user info:", error);
        setAvailableCompanies([]);
        setUserCompany(null);
      } finally {
        setIsLoadingUserInfo(false);
      }
    };

    fetchUserInfo();
  }, [user?.id, companies]);

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
