
import { useState, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

interface Company {
  id: string;
  name: string;
  code: string;
  contact_person?: string;
  email?: string;
  phone?: string;
  address?: string;
  vat_number?: string;
  account_manager?: string;
  created_at: string;
}

export function useCompanyData() {
  const { toast } = useToast();
  const { user } = useAuth();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchCompanies = async () => {
    if (!user?.id) {
      console.log("No user ID available for fetching companies");
      setLoading(false);
      return;
    }

    try {
      console.log("Fetching companies for user:", user.id);
      
      const { data, error } = await supabase
        .from('companies')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        console.error("Companies fetch error:", error);
        throw error;
      }
      
      console.log("Companies fetched successfully:", data);
      setCompanies(data || []);
    } catch (error: any) {
      console.error("Failed to fetch companies:", error);
      toast({
        title: "Error",
        description: "Failed to fetch companies: " + error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user?.id) {
      fetchCompanies();
    }
  }, [user?.id]);

  return {
    companies,
    setCompanies,
    loading,
    fetchCompanies,
    toast
  };
}
