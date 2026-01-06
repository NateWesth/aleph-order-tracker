import { useState, useEffect, useMemo, useCallback } from "react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useGlobalRealtimeOrders } from "./hooks/useGlobalRealtimeOrders";
import { getUserRole, getUserProfile } from "@/utils/authService";
import OrdersHeader from "./components/OrdersHeader";
import OrderTable from "./components/OrderTable";
import { OrderWithCompany } from "./types/orderTypes";
import { CompletedPageSkeleton } from "@/components/ui/skeletons";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useIsMobile } from "@/hooks/use-mobile";

interface Company {
  id: string;
  name: string;
}

interface CompletedPageProps {
  isAdmin: boolean;
  searchTerm?: string;
}

export default function CompletedPage({
  isAdmin,
  searchTerm: externalSearchTerm
}: CompletedPageProps) {
  const { toast } = useToast();
  const { user } = useAuth();
  const isMobile = useIsMobile();
  const [orders, setOrders] = useState<OrderWithCompany[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [selectedCompanyFilter, setSelectedCompanyFilter] = useState<string>("all");
  const [internalSearchTerm, setInternalSearchTerm] = useState('');
  const searchTerm = externalSearchTerm ?? internalSearchTerm;
  const [userRole, setUserRole] = useState<'admin' | 'user'>('user');
  const [userCompanyId, setUserCompanyId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

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

  const fetchCompletedOrders = async () => {
    if (!user?.id) return;
    
    setLoading(true);
    try {
      if (userRole === 'admin') {
        const { data: companiesData } = await supabase
          .from('companies')
          .select('id, name')
          .order('name');
        if (companiesData) {
          setCompanies(companiesData);
        }
      }
      
      let query = supabase
        .from('orders')
        .select(`*, companies (id, name, code)`)
        .eq('status', 'delivered')
        .order('completed_date', { ascending: false });

      if (userRole === 'user' && userCompanyId) {
        query = query.eq('company_id', userCompanyId);
      } else if (userRole === 'user' && !userCompanyId) {
        query = query.eq('user_id', user.id);
      }

      const { data, error } = await query;
      
      if (error) {
        console.error("Error fetching completed orders:", error);
        return;
      }
      
      const transformedOrders: OrderWithCompany[] = (data || []).map(order => ({
        id: order.id,
        order_number: order.order_number,
        description: order.description,
        status: order.status || 'delivered',
        urgency: order.urgency || 'normal',
        company_id: order.company_id,
        created_at: order.created_at,
        companyName: order.companies?.name || "Unknown Company",
        reference: order.reference,
        total_amount: order.total_amount,
        notes: order.notes,
        user_id: order.user_id,
        completed_date: order.completed_date,
        progress_stage: order.progress_stage,
        updated_at: order.updated_at
      }));
      
      setOrders(transformedOrders);
    } catch (error) {
      console.error("Failed to fetch completed orders:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteOrder = async (orderId: string, orderNumber: string) => {
    if (!isAdmin) {
      toast({
        title: "Access Denied",
        description: "Only administrators can delete orders.",
        variant: "destructive",
      });
      return;
    }

    try {
      const { error } = await supabase
        .from('orders')
        .delete()
        .eq('id', orderId);

      if (error) throw error;

      setOrders(prev => prev.filter(order => order.id !== orderId));

      toast({
        title: "Order Deleted",
        description: `Order ${orderNumber} has been successfully deleted.`,
      });
    } catch (error: any) {
      console.error("Error deleting order:", error);
      toast({
        title: "Error",
        description: "Failed to delete order: " + error.message,
        variant: "destructive",
      });
    }
  };

  useGlobalRealtimeOrders({
    onOrdersChange: () => {
      fetchCompletedOrders();
    },
    isAdmin,
    pageType: 'completed'
  });

  useEffect(() => {
    if (user?.id) {
      fetchUserInfo();
    }
  }, [user?.id]);

  useEffect(() => {
    if (user?.id && (userRole === 'admin' || userCompanyId !== null)) {
      fetchCompletedOrders();
    }
  }, [user?.id, userRole, userCompanyId]);

  const filteredOrders = orders.filter(order => {
    const matchesSearch = 
      order.order_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
      order.companyName.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCompany = 
      selectedCompanyFilter === "all" || order.company_id === selectedCompanyFilter;
    return matchesSearch && matchesCompany;
  });

  return (
    <div className="w-full">
      <div className={`flex flex-col gap-2 ${isMobile ? 'mb-3' : 'gap-4 mb-6'}`}>
        <div className="flex items-center justify-between">
          <h1 className={`font-bold text-foreground ${isMobile ? 'text-base' : 'text-lg md:text-xl'}`}>
            Order History
          </h1>
          <span className="text-sm text-muted-foreground">
            {filteredOrders.length} order{filteredOrders.length !== 1 ? 's' : ''}
          </span>
        </div>
        
        <div className={`flex ${isMobile ? 'flex-col' : 'flex-row'} gap-2`}>
          <div className="flex-1">
            <OrdersHeader 
              searchTerm={searchTerm} 
              onSearchChange={setInternalSearchTerm}
            />
          </div>
          
          {userRole === 'admin' && companies.length > 0 && (
            <Select value={selectedCompanyFilter} onValueChange={setSelectedCompanyFilter}>
              <SelectTrigger className={`${isMobile ? 'w-full' : 'w-48'}`}>
                <SelectValue placeholder="All Companies" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Companies</SelectItem>
                {companies.map((company) => (
                  <SelectItem key={company.id} value={company.id}>
                    {company.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      </div>

      {loading ? (
        <CompletedPageSkeleton />
      ) : (
        <OrderTable
          orders={filteredOrders}
          isAdmin={false}
          onReceiveOrder={() => {}}
          onDeleteOrder={handleDeleteOrder}
          compact
        />
      )}
    </div>
  );
}
