
import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { getUserRole, getUserProfile } from '@/utils/authService';

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
  const { user } = useAuth();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchCompanies = async () => {
    if (!user?.id) {
      console.log("🔍 useCompanyData: No user ID available");
      setLoading(false);
      return;
    }

    console.log("🔍 useCompanyData: Fetching companies for user:", user.id);
    setLoading(true);
    setError(null);

    try {
      // Get user role and profile to determine access level
      const [userRole, userProfile] = await Promise.all([
        getUserRole(user.id),
        getUserProfile(user.id)
      ]);
      
      console.log("🔍 useCompanyData: User role:", userRole);
      console.log("🔍 useCompanyData: User profile:", userProfile);

      let query = supabase.from('companies').select('*').order('name');

      if (userRole === 'admin') {
        console.log("👑 useCompanyData: Admin user - fetching all companies");
        // Admin users can see all companies
      } else {
        console.log("👤 useCompanyData: Client user - filtering by company association");
        
        if (userProfile?.company_id) {
          // Filter by company_id if available
          console.log("🔍 useCompanyData: Filtering by company_id:", userProfile.company_id);
          query = query.eq('id', userProfile.company_id);
        } else if (userProfile?.company_code) {
          // Filter by company_code if available
          console.log("🔍 useCompanyData: Filtering by company_code:", userProfile.company_code);
          query = query.eq('code', userProfile.company_code);
        } else {
          console.log("⚠️ useCompanyData: No company association found for client user");
          setCompanies([]);
          setLoading(false);
          return;
        }
      }

      const { data, error: fetchError } = await query;

      if (fetchError) {
        console.error("❌ useCompanyData: Error fetching companies:", fetchError);
        throw fetchError;
      }

      console.log("✅ useCompanyData: Companies fetched successfully:", data?.length || 0);
      console.log("🏢 useCompanyData: Company details:", data?.map(c => ({ id: c.id, name: c.name, code: c.code })));
      
      setCompanies(data || []);
    } catch (err: any) {
      console.error("❌ useCompanyData: Error in fetchCompanies:", err);
      setError(err.message || 'Failed to fetch companies');
      setCompanies([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCompanies();
  }, [user?.id]);

  const refetch = () => {
    fetchCompanies();
  };

  return {
    companies,
    loading,
    error,
    refetch
  };
};
