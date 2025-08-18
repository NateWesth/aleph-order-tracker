import React, { useState, useEffect } from 'react';
import { ChevronDown, List } from 'lucide-react';
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useCompanyData } from "@/components/admin/hooks/useCompanyData";
import { getUserRole } from "@/utils/auth";
import OrderTable from "./components/OrderTable";
import OrdersHeader from "./components/OrdersHeader";
import { format, startOfMonth, endOfMonth } from "date-fns";

interface Company {
  id: string;
  name: string;
  code: string;
}

interface Order {
  id: string;
  order_number: string;
  status: string;
  description: string;
  total_amount: number;
  created_at: string;
  user_id: string;
  company_id: string;
  urgency: string;
  reference: string;
}

interface OrderWithCompanyLocal extends Order {
  company_name: string;
  companyName: string; // For compatibility with OrderTable
}

export const OrdersListPage: React.FC = () => {
  const { user } = useAuth();
  const { companies } = useCompanyData();
  const [userRole, setUserRole] = useState<'admin' | 'user' | null>(null);
  const [userCompanyId, setUserCompanyId] = useState<string | null>(null);
  const [selectedCompanyId, setSelectedCompanyId] = useState<string | null>(null);
  const [orders, setOrders] = useState<OrderWithCompanyLocal[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");

  useEffect(() => {
    const fetchUserData = async () => {
      if (!user) return;

      try {
        // Get user role
        const role = await getUserRole(user.id);
        setUserRole(role || 'user');

        // Get user company if not admin
        if (role !== 'admin') {
          const { data: profile } = await supabase
            .from('profiles')
            .select('company_id')
            .eq('id', user.id)
            .single();
          
          if (profile?.company_id) {
            setUserCompanyId(profile.company_id);
            setSelectedCompanyId(profile.company_id);
          }
        }
      } catch (error) {
        console.error('Error fetching user data:', error);
      }
    };

    fetchUserData();
  }, [user]);

  useEffect(() => {
    if (selectedCompanyId) {
      fetchOrders();
    }
  }, [selectedCompanyId]);

  const fetchOrders = async () => {
    if (!selectedCompanyId) return;

    setLoading(true);
    try {
      // Get current month start and end dates
      const now = new Date();
      const monthStart = startOfMonth(now);
      const monthEnd = endOfMonth(now);

      const { data: ordersData, error } = await supabase
        .from('orders')
        .select('*')
        .eq('company_id', selectedCompanyId)
        .gte('created_at', monthStart.toISOString())
        .lte('created_at', monthEnd.toISOString())
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Get company names
      const ordersWithCompanies = await Promise.all(
        (ordersData || []).map(async (order) => {
          const company = companies.find(c => c.id === order.company_id);
          const companyName = company?.name || 'Unknown Company';
          return {
            ...order,
            company_name: companyName,
            companyName: companyName
          };
        })
      );

      setOrders(ordersWithCompanies);
    } catch (error) {
      console.error('Error fetching orders:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCompanySelect = (companyId: string) => {
    setSelectedCompanyId(companyId);
  };

  const filteredOrders = orders.filter(order =>
    order.order_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
    order.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    order.company_name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const selectedCompany = companies.find(c => c.id === selectedCompanyId);

  if (!user || userRole === null) {
    return <div>Loading...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Orders List</h1>
          <p className="text-muted-foreground">
            {format(new Date(), "MMMM yyyy")} - Current Month Orders
            {userRole === 'user' && selectedCompany && (
              <span className="ml-2">• {selectedCompany.name}</span>
            )}
          </p>
        </div>

        {/* Company Selector for Admin Only */}
        {userRole === 'admin' && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="flex items-center gap-2">
                <List size={16} />
                {selectedCompany ? selectedCompany.name : 'Select Company'}
                <ChevronDown size={16} />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-56 bg-background border shadow-lg z-50">
              {companies.map((company) => (
                <DropdownMenuItem
                  key={company.id}
                  onClick={() => handleCompanySelect(company.id)}
                  className="cursor-pointer hover:bg-muted"
                >
                  {company.name}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      {selectedCompanyId ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>
                {userRole === 'admin' ? selectedCompany?.name || 'Company' : 'Your'} Orders
              </span>
              <span className="text-sm font-normal text-muted-foreground">
                {filteredOrders.length} order{filteredOrders.length !== 1 ? 's' : ''}
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <OrdersHeader 
                searchTerm={searchTerm} 
                onSearchChange={setSearchTerm}
              />
              
              {loading ? (
                <div className="text-center py-8">Loading orders...</div>
              ) : (
                <OrderTable
                  orders={filteredOrders}
                  isAdmin={userRole === 'admin'}
                  onReceiveOrder={() => {}}
                  onDeleteOrder={() => {}}
                />
              )}
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="py-8">
            <div className="text-center text-muted-foreground">
              {userRole === 'admin' 
                ? 'Please select a company to view their orders.' 
                : 'No company associated with your account. Please contact your administrator.'}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};