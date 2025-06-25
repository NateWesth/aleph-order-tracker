import { useState, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { getUserRole } from "@/utils/authService";

interface Order {
  id: string;
  order_number: string;
  description: string | null;
  status: string | null;
  total_amount: number | null;
  created_at: string;
  company_id: string | null;
  user_id: string | null;
}

interface Company {
  id: string;
  name: string;
  code: string;
}

interface Profile {
  id: string;
  full_name: string;
  email: string;
  company_id: string;
}

export const useOrderData = (isAdmin: boolean) => {
  const { toast } = useToast();
  const { user } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [userProfile, setUserProfile] = useState<any>(null);

  const fetchUserProfile = async () => {
    if (!user?.id) return;
    
    try {
      console.log("Fetching user profile for order creation:", user.id);
      
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .maybeSingle();
      
      if (error) {
        console.error('Error fetching user profile:', error);
        return;
      }
      
      console.log("User profile fetched for orders:", data);
      setUserProfile(data);
    } catch (error) {
      console.error('Unexpected error fetching user profile:', error);
    }
  };

  const fetchOrders = async () => {
    if (!user?.id) {
      console.log("No user ID available for fetching orders");
      setLoading(false);
      return;
    }

    try {
      console.log("Fetching orders for user:", user.id, "isAdmin:", isAdmin);
      
      let query = supabase
        .from('orders')
        .select('*')
        .order('created_at', { ascending: false });

      // If user is admin, fetch all orders; otherwise, fetch only user's orders
      if (!isAdmin) {
        query = query.eq('user_id', user.id);
      }

      const { data, error } = await query;

      if (error) {
        console.error("Orders fetch error:", error);
        console.error("Error details:", {
          code: error.code,
          message: error.message,
          details: error.details,
          hint: error.hint
        });
        throw error;
      }
      
      console.log("Orders fetched successfully:", data);
      setOrders(data || []);
    } catch (error: any) {
      console.error("Failed to fetch orders:", error);
      toast({
        title: "Error",
        description: "Failed to fetch orders. Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchCompanies = async () => {
    if (!user?.id) {
      console.log("No user ID available for fetching companies");
      return;
    }

    try {
      console.log("Fetching companies...");
      const { data, error } = await supabase
        .from('companies')
        .select('id, name, code')
        .order('name');

      if (error) {
        console.error("Companies fetch error:", error);
        console.error("Error details:", {
          code: error.code,
          message: error.message,
          details: error.details,
          hint: error.hint
        });
        throw error;
      }
      
      console.log("Companies fetched successfully:", data);
      setCompanies(data || []);
    } catch (error: any) {
      console.error('Error fetching companies:', error);
      toast({
        title: "Error",
        description: "Failed to fetch companies. Please try again.",
        variant: "destructive",
      });
    }
  };

  const fetchProfiles = async () => {
    if (!user?.id) {
      console.log("No user ID available for fetching profiles");
      return;
    }

    try {
      console.log("Fetching profiles...");
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, email, company_id')
        .order('full_name');

      if (error) {
        console.error("Profiles fetch error:", error);
        console.error("Error details:", {
          code: error.code,
          message: error.message,
          details: error.details,
          hint: error.hint
        });
        throw error;
      }
      
      console.log("Profiles fetched successfully:", data);
      setProfiles(data || []);
    } catch (error: any) {
      console.error('Error fetching profiles:', error);
      toast({
        title: "Error",
        description: "Failed to fetch user profiles. Please try again.",
        variant: "destructive",
      });
    }
  };

  useEffect(() => {
    if (user?.id) {
      fetchOrders();
      fetchUserProfile();
      if (isAdmin) {
        fetchCompanies();
        fetchProfiles();
      }
    }
  }, [isAdmin, user?.id]);

  return {
    orders,
    setOrders,
    loading,
    companies,
    profiles,
    userProfile,
    fetchOrders,
    toast,
    user
  };
};
