import { useNavigate } from "react-router-dom";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Package, History, BarChart3, Settings, LogOut, Building2, Home, Search, Box, Users, Menu } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import OrdersPage from "@/components/orders/OrdersPage";
import CompletedPage from "@/components/orders/CompletedPage";
import ClientCompaniesPage from "@/components/admin/ClientCompaniesPage";
import StatsPage from "@/components/admin/StatsPage";
import ItemsPage from "@/components/admin/ItemsPage";
import UsersManagementPage from "@/components/admin/UsersManagementPage";
import { useIsMobile } from "@/hooks/use-mobile";
import { useGlobalUnreadCount } from "@/hooks/useGlobalUnreadCount";
import { cn } from "@/lib/utils";

const AdminDashboard = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user, signOut } = useAuth();
  const [activeView, setActiveView] = useState("orders");
  const [searchTerm, setSearchTerm] = useState("");
  const [userProfile, setUserProfile] = useState<any>(null);
  const [userRole, setUserRole] = useState<'admin' | 'user'>('user');
  const [loading, setLoading] = useState(true);
  const isMobile = useIsMobile();
  const { unreadOrderUpdates, pendingOrdersCount } = useGlobalUnreadCount();
  useEffect(() => {
    if (user) {
      fetchUserProfile();
      fetchUserRole();
    }
  }, [user]);

  const fetchUserProfile = async () => {
    if (!user) return;
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .maybeSingle();
      if (error) {
        console.error('Error fetching profile:', error);
        return;
      }
      setUserProfile(data);
    } catch (error) {
      console.error('Unexpected error fetching profile:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchUserRole = async () => {
    if (!user) return;
    try {
      const { data, error } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id)
        .maybeSingle();
      
      if (error) {
        console.error('Error fetching user role:', error);
        return;
      }
      
      if (data) {
        setUserRole(data.role);
      }
    } catch (error) {
      console.error('Unexpected error fetching user role:', error);
    }
  };

  const handleLogout = async () => {
    await signOut();
    toast({
      title: "Logged out",
      description: "You have been successfully logged out."
    });
    navigate("/auth");
  };

  const isAdmin = userRole === 'admin';

  const navItems = [
    { id: "orders", label: "Orders", icon: Package, badge: pendingOrdersCount },
    { id: "history", label: "History", icon: History, badge: unreadOrderUpdates },
    { id: "clients", label: "Clients", icon: Building2, badge: 0 },
    { id: "items", label: "Items", icon: Box, badge: 0 },
    ...(isAdmin ? [{ id: "users", label: "Users", icon: Users, badge: 0 }] : []),
    { id: "stats", label: "Stats", icon: BarChart3, badge: 0 },
  ];

  if (loading) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          <p className="text-muted-foreground text-sm font-medium">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen w-full flex flex-col bg-background">
      {/* Modern Top Navigation Bar */}
      <header className="sticky top-0 z-50 bg-card/80 backdrop-blur-xl border-b border-border">
        <div className="w-full px-2 sm:px-3 py-3">
          {/* Top row: Logo/Home, Search, Actions */}
          <div className="flex items-center gap-4">
            {/* Home/Brand */}
            <Button
              variant={activeView === "home" ? "secondary" : "ghost"}
              size="icon"
              onClick={() => setActiveView("home")}
              className="shrink-0 rounded-xl"
            >
              <Home className="h-5 w-5" />
            </Button>

            {/* Search bar - grows to fill space */}
            <div className="flex-1 max-w-lg">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                <Input
                  placeholder="Search orders..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10 h-10 bg-secondary/50 border-0 focus-visible:ring-1 focus-visible:ring-primary/50 rounded-xl"
                />
              </div>
            </div>

            {/* Right side actions */}
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => navigate("/settings")}
                className="rounded-xl text-muted-foreground hover:text-foreground"
              >
                <Settings className="h-[18px] w-[18px]" />
              </Button>
              <Button
                variant="ghost"
                size={isMobile ? "icon" : "default"}
                onClick={handleLogout}
                className="rounded-xl text-muted-foreground hover:text-foreground"
              >
                <LogOut className="h-[18px] w-[18px]" />
                {!isMobile && <span className="ml-2 text-sm">Logout</span>}
              </Button>
            </div>
          </div>

          {/* Navigation Tabs */}
          <nav className="flex items-center gap-1 mt-3 -mb-3 overflow-x-auto scrollbar-none">
            {navItems.map((item) => {
              const isActive = activeView === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveView(item.id)}
                  className={cn(
                    "relative flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-t-xl transition-all duration-200 whitespace-nowrap",
                    "border-b-2 -mb-[2px]",
                    isActive
                      ? "bg-primary/10 border-primary text-primary"
                      : "border-transparent text-muted-foreground hover:text-foreground hover:bg-secondary/50"
                  )}
                >
                  <div className="relative">
                    <item.icon className="h-4 w-4" />
                    {item.badge > 0 && (
                      <span className="absolute -top-2 -right-2 min-w-[18px] h-[18px] flex items-center justify-center text-[10px] font-bold bg-primary text-primary-foreground rounded-full px-1">
                        {item.badge > 99 ? '99+' : item.badge}
                      </span>
                    )}
                  </div>
                  <span className={cn(isMobile && "hidden sm:inline")}>{item.label}</span>
                </button>
              );
            })}
          </nav>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 overflow-x-hidden">
        <div
          className={cn(
            "w-full px-2 sm:px-3 py-3",
            activeView === "orders" || activeView === "history" ? "max-w-none" : "max-w-7xl mx-auto"
          )}
        >
          {activeView === "home" && (
            <div className="flex items-center justify-center min-h-[60vh]">
              <div className="text-center space-y-4 animate-fade-in">
                <div className="inline-flex items-center justify-center h-16 w-16 rounded-2xl bg-primary/10 mb-2">
                  <Package className="h-8 w-8 text-primary" />
                </div>
                <h1 className="text-3xl font-bold tracking-tight">
                  Welcome{userProfile?.full_name ? `, ${userProfile.full_name}` : ''}
                </h1>
                <p className="text-muted-foreground text-lg">
                  Aleph Engineering and Supplies
                </p>
                <div className="pt-4">
                  <Button 
                    onClick={() => setActiveView("orders")}
                    className="rounded-xl h-11 px-6"
                  >
                    <Package className="h-4 w-4 mr-2" />
                    View Orders
                  </Button>
                </div>
              </div>
            </div>
          )}
          
          <div className={cn(activeView !== "home" && "animate-fade-in")}>
            {activeView === "orders" && <OrdersPage isAdmin={true} searchTerm={searchTerm} />}
            {activeView === "history" && <CompletedPage isAdmin={true} searchTerm={searchTerm} />}
            {activeView === "clients" && <ClientCompaniesPage />}
            {activeView === "items" && <ItemsPage />}
            {activeView === "users" && isAdmin && <UsersManagementPage />}
            {activeView === "stats" && <StatsPage />}
          </div>
        </div>
      </main>
    </div>
  );
};

export default AdminDashboard;
