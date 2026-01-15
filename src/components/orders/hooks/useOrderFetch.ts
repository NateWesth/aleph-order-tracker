
import { useState, useEffect, useMemo } from "react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useUserData } from "@/hooks/useUserData";
import { Order, OrderItem } from "./useOrders";

export function useOrderFetch() {
  const { toast } = useToast();
  const { user } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Get user data from centralized hook
  const { role: userRole, userCompany } = useUserData();
  const userCompanyId = userCompany?.id || null;

  // Helper function to parse order items from description
  const parseOrderItems = (description: string): OrderItem[] => {
    if (!description) return [];

    // Parse the description to extract items and quantities
    // Format: "Item Name (Qty: 2)\nAnother Item (Qty: 1)"
    const items = description.split('\n').map((line, index) => {
      const match = line.match(/^(.+?)\s*\(Qty:\s*(\d+)\)$/);
      if (match) {
        return {
          id: `item-${index}`,
          name: match[1].trim(),
          quantity: parseInt(match[2]),
          delivered_quantity: 0,
          unit: '',
          notes: ''
        };
      }
      // Fallback for items without quantity format
      if (line.trim()) {
        return {
          id: `item-${index}`,
          name: line.trim(),
          quantity: 1,
          delivered_quantity: 0,
          unit: '',
          notes: ''
        };
      }
      return null;
    }).filter(item => item !== null) as OrderItem[];

    return items;
  };

  const fetchOrders = async () => {
    if (!user?.id || !userRole) {
      console.log("No user ID or role available for fetching orders");
      setLoading(false);
      return;
    }

    try {
      console.log("Fetching orders for user:", user.id);
      
      // All authenticated users can see all orders (no company filtering)
      const { data, error } = await supabase
        .from('orders')
        .select('*')
        .neq('status', 'completed')
        .order('created_at', { ascending: false });

      if (error) {
        console.error("Orders fetch error:", error);
        throw error;
      }
      
      console.log("Orders fetched successfully:", data);
      
      // Parse items from description for each order
      const ordersWithItems = (data || []).map(order => ({
        ...order,
        items: parseOrderItems(order.description || '')
      }));
      
      setOrders(ordersWithItems);
    } catch (error: any) {
      console.error("Failed to fetch orders:", error);
      toast({
        title: "Error",
        description: "Failed to fetch orders: " + error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user?.id && userRole) {
      fetchOrders();
    }
  }, [user?.id, userRole]);

  return {
    orders,
    setOrders,
    loading,
    fetchOrders,
    userRole,
    userCompanyId,
    toast
  };
}
