import { useState, useEffect, useMemo, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { getUserProfile, getUserRole } from '@/utils/auth';
import { supabase } from '@/integrations/supabase/client';

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
  created_at: string;
  updated_at: string;
}

export interface UserData {
  profile: any | null;
  role: 'admin' | 'user' | '';
  companies: Company[];
  userCompany: Company | null;
  availableCompanies: Company[];
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
}

// Global cache to prevent multiple simultaneous requests
const userDataCache = new Map<string, Promise<any>>();
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes
const cacheTimestamps = new Map<string, number>();

export function useUserData(): UserData {
  const { user } = useAuth();
  const [profile, setProfile] = useState<any>(null);
  const [role, setRole] = useState<'admin' | 'user' | ''>('');
  const [companies, setCompanies] = useState<Company[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Memoized user company and available companies
  const { userCompany, availableCompanies } = useMemo(() => {
    if (!profile || !companies.length) {
      return { userCompany: null, availableCompanies: [] };
    }

    if (role === 'admin') {
      return { userCompany: null, availableCompanies: companies };
    }

    // For regular users, find their linked company
    let linkedCompany = null;
    if (profile.company_id) {
      linkedCompany = companies.find(company => company.id === profile.company_id);
    } else if (profile.company_code) {
      linkedCompany = companies.find(company => company.code === profile.company_code);
    }

    return { userCompany: linkedCompany, availableCompanies: [] };
  }, [profile, companies, role]);

  // Cached fetch functions
  const fetchUserProfile = useCallback(async (userId: string) => {
    const cacheKey = `profile_${userId}`;
    const now = Date.now();
    
    // Check cache validity
    if (cacheTimestamps.has(cacheKey) && 
        (now - cacheTimestamps.get(cacheKey)!) < CACHE_DURATION &&
        userDataCache.has(cacheKey)) {
      return userDataCache.get(cacheKey);
    }

    const promise = getUserProfile(userId);
    userDataCache.set(cacheKey, promise);
    cacheTimestamps.set(cacheKey, now);
    
    return promise;
  }, []);

  const fetchUserRole = useCallback(async (userId: string) => {
    const cacheKey = `role_${userId}`;
    const now = Date.now();
    
    // Check cache validity
    if (cacheTimestamps.has(cacheKey) && 
        (now - cacheTimestamps.get(cacheKey)!) < CACHE_DURATION &&
        userDataCache.has(cacheKey)) {
      return userDataCache.get(cacheKey);
    }

    const promise = getUserRole(userId);
    userDataCache.set(cacheKey, promise);
    cacheTimestamps.set(cacheKey, now);
    
    return promise;
  }, []);

  const fetchCompanies = useCallback(async (userId: string, userRole: string) => {
    const cacheKey = `companies_${userId}`;
    const now = Date.now();
    
    // Check cache validity
    if (cacheTimestamps.has(cacheKey) && 
        (now - cacheTimestamps.get(cacheKey)!) < CACHE_DURATION &&
        userDataCache.has(cacheKey)) {
      return userDataCache.get(cacheKey);
    }

    let query = supabase.from('companies').select('*');
    
    // If not admin, only fetch companies they have access to
    if (userRole !== 'admin') {
      query = query.or(`id.in.(${userId}),code.in.(select company_code from profiles where id = '${userId}')`);
    }

    const promise = (async () => {
      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    })();

    userDataCache.set(cacheKey, promise);
    cacheTimestamps.set(cacheKey, now);
    
    return promise;
  }, []);

  // Main data fetching function
  const fetchAllUserData = useCallback(async () => {
    if (!user?.id) return;

    setIsLoading(true);
    setError(null);

    try {
      console.log('🔄 useUserData: Fetching consolidated user data for:', user.id);
      
      // Fetch role and profile in parallel
      const [userRole, userProfile] = await Promise.all([
        fetchUserRole(user.id),
        fetchUserProfile(user.id)
      ]);

      console.log('✅ useUserData: Role and profile fetched:', { role: userRole, profile: !!userProfile });
      
      setRole(userRole);
      setProfile(userProfile);

      // Fetch companies based on role
      const companiesData = await fetchCompanies(user.id, userRole);
      console.log('✅ useUserData: Companies fetched:', companiesData.length);
      setCompanies(companiesData);

    } catch (err) {
      console.error('❌ useUserData: Error fetching user data:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch user data');
    } finally {
      setIsLoading(false);
    }
  }, [user?.id, fetchUserRole, fetchUserProfile, fetchCompanies]);

  // Refetch function that clears cache
  const refetch = useCallback(() => {
    if (user?.id) {
      // Clear cache for this user
      userDataCache.delete(`profile_${user.id}`);
      userDataCache.delete(`role_${user.id}`);
      userDataCache.delete(`companies_${user.id}`);
      cacheTimestamps.delete(`profile_${user.id}`);
      cacheTimestamps.delete(`role_${user.id}`);
      cacheTimestamps.delete(`companies_${user.id}`);
      
      fetchAllUserData();
    }
  }, [user?.id, fetchAllUserData]);

  // Effect to fetch data when user changes
  useEffect(() => {
    fetchAllUserData();
  }, [fetchAllUserData]);

  return {
    profile,
    role,
    companies,
    userCompany,
    availableCompanies,
    isLoading,
    error,
    refetch
  };
}