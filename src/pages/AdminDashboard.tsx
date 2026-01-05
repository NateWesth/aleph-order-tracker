import { useNavigate } from "react-router-dom";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Package, History, BarChart3, Settings, LogOut, Building2, Home, Search, Box } from "lucide-react";
import { Input } from "@/components/ui/input";
import OrdersPage from "@/components/orders/OrdersPage";
import CompletedPage from "@/components/orders/CompletedPage";
import ClientCompaniesPage from "@/components/admin/ClientCompaniesPage";
import StatsPage from "@/components/admin/StatsPage";
import ItemsPage from "@/components/admin/ItemsPage";
import { useIsMobile } from "@/hooks/use-mobile";

const AdminDashboard = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user, signOut } = useAuth();
  const [activeView, setActiveView] = useState("orders");
  const [searchTerm, setSearchTerm] = useState("");
  const [userProfile, setUserProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const isMobile = useIsMobile();

  useEffect(() => {
    if (user) {
      fetchUserProfile();
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

  const handleLogout = async () => {
    await signOut();
    toast({
      title: "Logged out",
      description: "You have been successfully logged out."
    });
    navigate("/auth");
  };

  const navItems = [
    { id: "orders", label: "Orders", icon: Package },
    { id: "history", label: "Order History", icon: History },
    { id: "clients", label: "Clients", icon: Building2 },
    { id: "items", label: "Items", icon: Box },
    { id: "stats", label: "Stats", icon: BarChart3 },
  ];

  if (loading) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center bg-background">
        <div className="text-primary text-lg">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen w-full flex flex-col bg-background">
      {/* Top Toolbar */}
      <header className="bg-card border-b border-border px-4 py-3">
        <div className="max-w-7xl mx-auto">
          {/* Top row: Home button left, Search center, Actions right */}
          <div className="flex items-center justify-between mb-3">
            {/* Home button - icon only */}
            <Button
              variant={activeView === "home" ? "default" : "ghost"}
              size="icon"
              onClick={() => setActiveView("home")}
            >
              <Home className="h-5 w-5" />
            </Button>

            {/* Search bar */}
            <div className="flex-1 max-w-md mx-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search order number..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>

            {/* Right side actions */}
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => navigate("/settings")}
              >
                <Settings className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size={isMobile ? "sm" : "default"}
                onClick={handleLogout}
              >
                <LogOut className="h-4 w-4" />
                {!isMobile && <span className="ml-2">Logout</span>}
              </Button>
            </div>
          </div>

          {/* Navigation Buttons - centered */}
          <nav className="flex items-center justify-center gap-2">
            {navItems.map((item) => (
              <Button
                key={item.id}
                variant={activeView === item.id ? "default" : "ghost"}
                size={isMobile ? "sm" : "default"}
                onClick={() => setActiveView(item.id)}
                className="gap-2"
              >
                <item.icon className="h-4 w-4" />
                {!isMobile && <span>{item.label}</span>}
              </Button>
            ))}
          </nav>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 p-4 md:p-6 overflow-x-hidden">
        {activeView === "home" && (
          <div className="flex items-center justify-center h-64">
            <div className="text-center">
              <h1 className="text-2xl font-bold text-foreground mb-2">
                Welcome{userProfile?.full_name ? `, ${userProfile.full_name}` : ''}
              </h1>
              <p className="text-muted-foreground">Aleph Engineering and Supplies</p>
            </div>
          </div>
        )}
        {activeView === "orders" && <OrdersPage isAdmin={true} searchTerm={searchTerm} />}
        {activeView === "history" && <CompletedPage isAdmin={true} searchTerm={searchTerm} />}
        {activeView === "clients" && <ClientCompaniesPage />}
        {activeView === "items" && <ItemsPage />}
        {activeView === "stats" && <StatsPage />}
      </main>
    </div>
  );
};

export default AdminDashboard;