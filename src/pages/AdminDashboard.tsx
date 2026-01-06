import { useNavigate } from "react-router-dom";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Package, History, BarChart3, Settings, LogOut, Building2, Home, Search, Box, Menu } from "lucide-react";
import { Input } from "@/components/ui/input";
import OrdersPage from "@/components/orders/OrdersPage";
import CompletedPage from "@/components/orders/CompletedPage";
import ClientCompaniesPage from "@/components/admin/ClientCompaniesPage";
import StatsPage from "@/components/admin/StatsPage";
import ItemsPage from "@/components/admin/ItemsPage";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";

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
    { id: "history", label: "History", icon: History },
    { id: "clients", label: "Clients", icon: Building2 },
    { id: "items", label: "Items", icon: Box },
    { id: "stats", label: "Stats", icon: BarChart3 },
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
                    "flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-t-xl transition-all duration-200 whitespace-nowrap",
                    "border-b-2 -mb-[2px]",
                    isActive
                      ? "bg-background border-primary text-foreground"
                      : "border-transparent text-muted-foreground hover:text-foreground hover:bg-secondary/50"
                  )}
                >
                  <item.icon className="h-4 w-4" />
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
            {activeView === "stats" && <StatsPage />}
          </div>
        </div>
      </main>
    </div>
  );
};

export default AdminDashboard;
