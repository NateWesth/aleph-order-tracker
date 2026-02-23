import { useNavigate } from "react-router-dom";
import { PageTransition } from "@/components/ui/PageTransition";
import AuroraBackground from "@/components/ui/AuroraBackground";
import OnboardingTour from "@/components/ui/OnboardingTour";
import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Package, History, BarChart3, Settings, LogOut, Building2, Home, Box, Users, Truck, FileText, Command } from "lucide-react";
import NotificationCenter from "@/components/NotificationCenter";
import FloatingAIChat from "@/components/admin/FloatingAIChat";
import CommandPalette from "@/components/admin/CommandPalette";
import VoiceCommandButton from "@/components/admin/VoiceCommandButton";
import SmartSearch from "@/components/admin/SmartSearch";
import ActivityFeedSidebar from "@/components/admin/ActivityFeedSidebar";
import { Badge } from "@/components/ui/badge";
import OrdersPage from "@/components/orders/OrdersPage";
import CompletedPage from "@/components/orders/CompletedPage";
import ClientCompaniesPage from "@/components/admin/ClientCompaniesPage";
import StatsPage from "@/components/admin/StatsPage";
import ItemsPage from "@/components/admin/ItemsPage";
import DashboardHome from "@/components/admin/DashboardHome";
import UsersManagementPage from "@/components/admin/UsersManagementPage";
import SuppliersPage from "@/components/admin/SuppliersPage";
import POTrackingPage from "@/components/admin/POTrackingPage";
import { useIsMobile } from "@/hooks/use-mobile";
import { useGlobalUnreadCount } from "@/hooks/useGlobalUnreadCount";
import { cn } from "@/lib/utils";
import { triggerHapticFeedback } from "@/utils/haptics";

const AdminDashboard = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user, signOut } = useAuth();
  const [activeView, setActiveView] = useState("orders");
  const [searchTerm] = useState("");
  const [userProfile, setUserProfile] = useState<any>(null);
  const [userRole, setUserRole] = useState<'admin' | 'user'>('user');
  const [loading, setLoading] = useState(true);
  const [commandOpen, setCommandOpen] = useState(false);
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

  // Keyboard shortcut for Cmd+K
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setCommandOpen(prev => !prev);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const handleCommandAction = useCallback((action: string) => {
    switch (action) {
      case "create-order":
        setActiveView("orders");
        break;
      case "settings":
        navigate("/settings");
        break;
      case "logout":
        handleLogout();
        break;
      case "toggle-voice":
        // Voice toggle handled by the button itself
        break;
    }
  }, [navigate]);

  const handleVoiceCommand = useCallback((command: string) => {
    const [type, target] = command.split(":");
    if (type === "navigate") {
      setActiveView(target);
    } else if (type === "action") {
      handleCommandAction(target);
    }
  }, [handleCommandAction]);

  const isAdmin = userRole === 'admin';

  const navItems = [
    { id: "orders", label: "Orders", icon: Package, badge: pendingOrdersCount },
    { id: "history", label: "History", icon: History, badge: unreadOrderUpdates },
    { id: "clients", label: "Clients", icon: Building2, badge: 0 },
    { id: "suppliers", label: "Suppliers", icon: Truck, badge: 0 },
    { id: "po-tracking", label: "PO Tracking", icon: FileText, badge: 0 },
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
    <div className="min-h-screen w-full flex flex-col bg-background overflow-x-hidden relative">
      <AuroraBackground />
      {/* Modern Top Navigation Bar */}
      <header className="sticky top-0 z-50 bg-card/80 backdrop-blur-xl border-b border-border w-full">
        <div className="w-full px-2 sm:px-3 py-2 sm:py-3">
          {/* Top row: Logo/Home, Search, Actions */}
          <div className="flex items-center gap-2 sm:gap-4">
            {/* Home/Brand */}
            <Button
              variant={activeView === "home" ? "secondary" : "ghost"}
              size="icon"
              onClick={() => setActiveView("home")}
              className="shrink-0 rounded-xl h-9 w-9 sm:h-10 sm:w-10"
              data-tour="home"
            >
              <Home className="h-4 w-4 sm:h-5 sm:w-5" />
            </Button>

            {/* Smart Search bar - grows to fill space */}
            <div className="flex-1 min-w-0" data-tour="search">
              <SmartSearch
                onNavigate={(view) => setActiveView(view)}
              />
            </div>

            {/* Right side actions */}
            <div className="flex items-center gap-1">
              <VoiceCommandButton onCommand={handleVoiceCommand} />
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setCommandOpen(true)}
                className="hidden sm:flex rounded-xl text-muted-foreground hover:text-foreground"
                title="Command Palette (⌘K)"
              >
                <Command className="h-[18px] w-[18px]" />
              </Button>
              <NotificationCenter
                onNavigateToOrder={(orderId) => {
                  setActiveView("orders");
                }}
                data-tour="notifications"
              />
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

          {/* Navigation Tabs - Hidden on mobile, shown on tablet+ */}
          <nav className="hidden sm:flex items-center gap-0.5 sm:gap-1 mt-2 sm:mt-3 -mb-3 overflow-x-auto scrollbar-none pb-px" style={{ WebkitOverflowScrolling: 'touch' }}>
            {navItems.map((item) => {
              const isActive = activeView === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveView(item.id)}
                  data-tour={`nav-${item.id}`}
                  className={cn(
                    "relative flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-4 py-2 sm:py-2.5 text-xs sm:text-sm font-medium rounded-t-xl transition-all duration-200 whitespace-nowrap",
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
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>
        </div>
      </header>

      {/* Main content area with activity sidebar */}
      <div className="flex-1 flex overflow-hidden">
        {/* Main content - Add bottom padding on mobile for bottom nav */}
        <main className="flex-1 overflow-x-hidden overflow-y-auto w-full pb-16 sm:pb-0">
          <div
            className={cn(
              "w-full px-1.5 sm:px-3 py-2 sm:py-3",
              activeView === "orders" || activeView === "history" ? "max-w-none" : "max-w-7xl mx-auto"
            )}
          >
            <PageTransition viewKey={activeView}>
              {activeView === "home" && (
                <DashboardHome
                  userName={userProfile?.full_name}
                  onNavigate={(view) => setActiveView(view)}
                />
              )}
              {activeView === "orders" && <OrdersPage isAdmin={true} searchTerm={searchTerm} />}
              {activeView === "history" && <CompletedPage isAdmin={true} searchTerm={searchTerm} />}
              {activeView === "clients" && <ClientCompaniesPage />}
              {activeView === "suppliers" && <SuppliersPage />}
              {activeView === "po-tracking" && <POTrackingPage />}
              {activeView === "items" && <ItemsPage />}
              {activeView === "users" && isAdmin && <UsersManagementPage />}
              {activeView === "stats" && <StatsPage />}
            </PageTransition>
          </div>
        </main>

        {/* Activity Feed Sidebar - desktop only */}
        <ActivityFeedSidebar />
      </div>

      {/* Mobile Bottom Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 bg-card/95 backdrop-blur-xl border-t border-border sm:hidden safe-area-bottom">
        <div className="flex items-center justify-around px-1 py-1">
          {navItems.slice(0, 5).map((item) => {
            const isActive = activeView === item.id;
            return (
              <button
                key={item.id}
                onClick={() => {
                  triggerHapticFeedback('light');
                  setActiveView(item.id);
                }}
                className={cn(
                  "flex flex-col items-center justify-center gap-0.5 py-2 px-3 rounded-xl transition-all duration-200 min-w-[56px]",
                  isActive
                    ? "text-primary bg-primary/10"
                    : "text-muted-foreground active:bg-muted active:scale-95"
                )}
              >
                <div className="relative">
                  <item.icon className={cn("h-5 w-5", isActive && "stroke-[2.5]")} />
                  {item.badge > 0 && (
                    <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-[16px] flex items-center justify-center text-[9px] font-bold bg-primary text-primary-foreground rounded-full px-1">
                      {item.badge > 99 ? '99+' : item.badge}
                    </span>
                  )}
                </div>
                <span className={cn(
                  "text-[10px] font-medium",
                  isActive && "font-semibold"
                )}>
                  {item.label}
                </span>
              </button>
            );
          })}
        </div>
      </nav>

      {/* Command Palette */}
      <CommandPalette
        open={commandOpen}
        onOpenChange={setCommandOpen}
        onNavigate={(view) => setActiveView(view)}
        onAction={handleCommandAction}
        isAdmin={isAdmin}
      />

      {/* Floating AI Chat */}
      <FloatingAIChat />

      {/* Onboarding Tour */}
      <OnboardingTour />
    </div>
  );
};

export default AdminDashboard;
