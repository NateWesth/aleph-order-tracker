import React, { useState, useEffect } from 'react';
import { ChevronDown, List } from 'lucide-react';
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useCompanyData } from "@/components/admin/hooks/useCompanyData";
import { getUserRole } from "@/utils/auth";
import { OrdersListDialog } from "./OrdersListDialog";

interface Company {
  id: string;
  name: string;
  code: string;
}

export const OrdersListButton: React.FC = () => {
  const { user } = useAuth();
  const { companies } = useCompanyData();
  const [userRole, setUserRole] = useState<'admin' | 'user' | null>(null);
  const [userCompanyId, setUserCompanyId] = useState<string | null>(null);
  const [selectedCompanyId, setSelectedCompanyId] = useState<string | null>(null);
  const [showOrdersList, setShowOrdersList] = useState(false);

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

  const handleCompanySelect = (companyId: string) => {
    setSelectedCompanyId(companyId);
    setShowOrdersList(true);
  };

  const handleDirectAccess = () => {
    if (userRole === 'user' && userCompanyId) {
      setSelectedCompanyId(userCompanyId);
      setShowOrdersList(true);
    }
  };

  if (!user || userRole === null) {
    return null;
  }

  // For client users - direct button
  if (userRole === 'user') {
    return (
      <>
        <Button
          variant="outline"
          onClick={handleDirectAccess}
          className="flex items-center gap-2"
        >
          <List size={16} />
          Orders List
        </Button>
        {showOrdersList && selectedCompanyId && (
          <OrdersListDialog
            isOpen={showOrdersList}
            onClose={() => setShowOrdersList(false)}
            companyId={selectedCompanyId}
            isAdmin={false}
          />
        )}
      </>
    );
  }

  // For admin users - dropdown
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" className="flex items-center gap-2">
            <List size={16} />
            Orders List
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
      {showOrdersList && selectedCompanyId && (
        <OrdersListDialog
          isOpen={showOrdersList}
          onClose={() => setShowOrdersList(false)}
          companyId={selectedCompanyId}
          isAdmin={true}
        />
      )}
    </>
  );
};