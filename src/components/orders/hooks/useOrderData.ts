import { useState, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { getUserRole, getUserProfile } from "@/utils/authService";

export interface OrderItem {
  id: string;
  name: string;
  quantity: number;
  delivered_quantity?: number;
  unit?: string;
  notes?: string;
}

export interface Order {
  id: string;
  order_number: string;
  description?: string;
  status: string;
  progress_stage?: string;
  total_amount?: number;
  created_at: string;
  updated_at: string;
  completed_date?: string;
  company_id?: string;
  user_id?: string;
  items?: OrderItem[];
  companyName?: string;
}

export function useOrderData() {
  const { toast } = useToast();
  const { user } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [userRole, setUserRole] = useState<'admin' | 'user'>('user');
  const [userCompanyId, setUserCompanyId] = useState<string | null>(null);

  const fetchUserInfo = async () => {
    if (!user?.id) return;

    try {
      const [role, profile] = await Promise.all([
        getUserRole(user.id),
        getUserProfile(user.id)
      ]);

      setUserRole(role);
      if (role === 'user' && profile?.company_id) {
        setUserCompanyId(profile.company_id);
      }
    } catch (error) {
      console.error("Error fetching user info:", error);
    }
  };

  const fetchOrders = async () => {
    if (!user?.id) {
      console.log("No user ID available for fetching orders");
      setLoading(false);
      return;
    }

    try {
      console.log("Fetching orders for user:", user.id);
      
      let query = supabase
        .from('orders')
        .select('*')
        .neq('status', 'completed') // Exclude completed orders from the main orders page
        .order('created_at', { ascending: false });

      // Filter by company for non-admin users
      if (userRole === 'user' && userCompanyId) {
        console.log("Filtering orders by company:", userCompanyId);
        query = query.eq('company_id', userCompanyId);
      }

      const { data, error } = await query;

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

  useEffect(() => {
    if (user?.id) {
      fetchUserInfo();
    }
  }, [user?.id]);

  useEffect(() => {
    if (user?.id && (userRole === 'admin' || userCompanyId)) {
      fetchOrders();
    }
  }, [user?.id, userRole, userCompanyId]);

  const updateOrder = async (orderId: string, updates: Partial<Omit<Order, 'items'>>) => {
    try {
      const { error } = await supabase
        .from('orders')
        .update(updates)
        .eq('id', orderId);

      if (error) throw error;

      // Update local state
      setOrders(prev => prev.map(order => 
        order.id === orderId ? { ...order, ...updates } : order
      ));

      return true;
    } catch (error: any) {
      console.error("Failed to update order:", error);
      toast({
        title: "Error",
        description: "Failed to update order: " + error.message,
        variant: "destructive",
      });
      return false;
    }
  };

  const updateOrderItems = async (orderId: string, items: OrderItem[]) => {
    try {
      // Convert items back to description format for storage
      const itemsDescription = items.map(item => 
        `${item.name} (Qty: ${item.quantity})`
      ).join('\n');

      const { error } = await supabase
        .from('orders')
        .update({ description: itemsDescription })
        .eq('id', orderId);

      if (error) throw error;

      // Update local state
      setOrders(prev => prev.map(order => 
        order.id === orderId ? { ...order, items } : order
      ));

      return true;
    } catch (error: any) {
      console.error("Failed to update order items:", error);
      toast({
        title: "Error",
        description: "Failed to update order items: " + error.message,
        variant: "destructive",
      });
      return false;
    }
  };

  return {
    orders,
    setOrders,
    loading,
    fetchOrders,
    updateOrder,
    updateOrderItems,
    userRole,
    userCompanyId,
    toast
  };
}
