
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
      // Get user role and profile for logging purposes
      const [userRole, userProfile] = await Promise.all([
        getUserRole(user.id),
        getUserProfile(user.id)
      ]);
      
      console.log("🔍 useCompanyData: User role:", userRole);
      console.log("🔍 useCompanyData: User profile:", userProfile);

      // Fetch companies - RLS policies will handle the access control
      // Admin users will see all companies, client users will only see their associated company
      const { data, error: fetchError } = await supabase
        .from('companies')
        .select('*')
        .order('name');

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
