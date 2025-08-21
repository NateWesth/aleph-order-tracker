import { useNavigate } from "react-router-dom";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/contexts/ThemeContext";
import { ProcessedLogo } from "@/components/ui/ProcessedLogo";
import { supabase } from "@/integrations/supabase/client";
import { SidebarProvider, Sidebar, SidebarContent, SidebarMenu, SidebarMenuItem, SidebarMenuButton, SidebarFooter, SidebarTrigger } from "@/components/ui/sidebar";
import { Home, FileText, ListOrdered, BarChart2, Settings, Files, Building2, Users, List, Menu } from "lucide-react";
import OrdersPage from "@/components/orders/OrdersPage";
import ProgressPage from "@/components/orders/ProgressPage";
import ProcessingPage from "@/components/orders/ProcessingPage";
import CompletedPage from "@/components/orders/CompletedPage";
import FilesPage from "@/components/orders/FilesPage";
import { OrdersListPage } from "@/components/orders/OrdersListPage";
import ClientCompaniesPage from "@/components/admin/ClientCompaniesPage";
import UsersManagementPage from "@/components/admin/UsersManagementPage";
import TodoList from "@/components/admin/TodoList";
import { useIsMobile } from "@/hooks/use-mobile";

const AdminDashboard = () => {
  const navigate = useNavigate();
  const {
    toast
  } = useToast();
  const {
    user,
    signOut
  } = useAuth();
  const {
    theme
  } = useTheme();
  const [activeView, setActiveView] = useState("home");
  const [userProfile, setUserProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const isMobile = useIsMobile();
  useEffect(() => {
    if (user) {
      fetchUserProfile();
    }
  }, [user]);
  useEffect(() => {
    // Listen for custom events to change active view
    const handleSetActiveView = (event: CustomEvent) => {
      setActiveView(event.detail);
    };
    window.addEventListener('setActiveView', handleSetActiveView as EventListener);
    return () => {
      window.removeEventListener('setActiveView', handleSetActiveView as EventListener);
    };
  }, []);
  const fetchUserProfile = async () => {
    if (!user) return;
    try {
      console.log("Fetching user profile for:", user.id);
      const {
        data,
        error
      } = await supabase.from('profiles').select('*').eq('id', user.id).maybeSingle();
      if (error) {
        console.error('Error fetching profile:', error);
        // Don't show error to user for profile fetch, just log it
        return;
      }
      console.log("Profile fetched successfully:", data);
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
      description: "You have been successfully logged out as admin."
    });
    navigate("/auth");
  };
  const handleMenuClick = (view: string) => {
    setActiveView(view);
  };
  if (loading) {
    return <div className="min-h-screen w-full flex items-center justify-center bg-black">
        <div className="text-aleph-green text-lg">Loading dashboard...</div>
      </div>;
  }
  return <SidebarProvider>
      <div className="min-h-screen w-full flex bg-black dark:bg-black">
        {/* Sidebar */}
        <Sidebar className={`dark:bg-black bg-white ${isMobile ? 'data-[state=collapsed]:w-0' : ''}`}>
          <SidebarContent className="relative bg-[#162014] overflow-hidden">
            {/* Watermark background */}
            <div className="absolute inset-0 opacity-15 bg-no-repeat bg-center pointer-events-none" style={{
            backgroundImage: 'url("/lovable-uploads/60acfbdb-e784-45e3-ad7d-af256b7060cb.png")',
            backgroundSize: '250%',
            transform: 'rotate(-15deg)'
          }}>
            </div>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton tooltip="Home" onClick={() => handleMenuClick("home")} className={`sidebar-hover ${activeView === "home" ? "sidebar-active" : ""}`}>
                  <Home />
                  <span>Home</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton tooltip="Orders" onClick={() => handleMenuClick("orders")} className={`sidebar-hover ${activeView === "orders" ? "sidebar-active" : ""}`}>
                  <ListOrdered />
                  <span>Orders</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton tooltip="Progress" onClick={() => handleMenuClick("progress")} className={`sidebar-hover ${activeView === "progress" ? "sidebar-active" : ""}`}>
                  <BarChart2 />
                  <span>Progress</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton tooltip="Processing" onClick={() => handleMenuClick("processing")} className={`sidebar-hover ${activeView === "processing" ? "sidebar-active" : ""}`}>
                  <FileText />
                  <span>Processing</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton tooltip="Completed" onClick={() => handleMenuClick("completed")} className={`sidebar-hover ${activeView === "completed" ? "sidebar-active" : ""}`}>
                  <FileText />
                  <span>Completed</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton tooltip="Orders List" onClick={() => handleMenuClick("orders-list")} className={`sidebar-hover ${activeView === "orders-list" ? "sidebar-active" : ""}`}>
                  <List />
                  <span>Orders List</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarContent>
          <SidebarFooter className="bg-[#162014] rounded-none">
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton tooltip="Files" onClick={() => handleMenuClick("files")} className={`sidebar-hover btn-hover ${activeView === "files" ? "sidebar-active" : ""}`}>
                  <Files />
                  <span>Files</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton tooltip="Companies" onClick={() => handleMenuClick("companies")} className={`sidebar-hover btn-hover ${activeView === "companies" ? "sidebar-active" : ""}`}>
                  <Building2 />
                  <span>Companies</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton tooltip="Users" onClick={() => handleMenuClick("users")} className={`sidebar-hover btn-hover ${activeView === "users" ? "sidebar-active" : ""}`}>
                  <Users />
                  <span>Users</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarFooter>
        </Sidebar>

        {/* Main content */}
        <div className="flex-1 flex flex-col">
          {/* Header - light grey in light mode */}
          <header className="toolbar-aleph p-2 md:p-4">
            <div className="max-w-7xl mx-auto flex justify-between items-center">
              <div className="flex items-center gap-1 md:gap-0">
                {isMobile && <SidebarTrigger className="text-aleph-green hover:bg-aleph-green/10 p-1" />}
                <h1 className={`font-bold text-aleph-green dark:text-white truncate ${isMobile ? 'text-sm' : 'text-lg md:text-2xl'}`}>
                  {isMobile ? 'Admin' : 'Admin Dashboard'}
                </h1>
              </div>
              <div className="flex items-center gap-1 md:gap-4">
                <Button variant="ghost" size="icon" className={`rounded-full sidebar-hover ${isMobile ? 'h-8 w-8' : ''}`} onClick={() => navigate("/settings")}>
                  <Settings className={`${isMobile ? 'h-3 w-3' : 'h-4 w-4 md:h-5 md:w-5'}`} />
                  <span className="sr-only">Account settings</span>
                </Button>
                <Button 
                  variant="outline" 
                  onClick={handleLogout} 
                  className={`border-aleph-green text-aleph-green hover:bg-aleph-green hover:text-white dark:border-aleph-green dark:text-aleph-green sidebar-hover ${isMobile ? 'text-xs px-2 py-1 h-8' : ''}`}
                >
                  Logout
                </Button>
              </div>
            </div>
          </header>

          {/* Dashboard content - White in light mode, slightly lighter grey than toolbar in dark mode */}
          <main className={`flex-1 bg-background dark:bg-background overflow-x-hidden min-w-0 ${isMobile ? 'p-1' : 'p-2 md:p-4 lg:p-6'}`}>
            {activeView === "home" ? <div className="space-y-6">
                {/* Welcome Section */}
                <div className="flex items-center justify-center h-64 relative bg-background px-4">
                   <div className="text-center relative z-10 max-w-4xl mx-auto">
                    <h1 className="text-2xl md:text-4xl lg:text-6xl font-bold mb-4 text-emerald-950">
                      Welcome{userProfile?.full_name ? `, ${userProfile.full_name}` : ''}
                    </h1>
                    <p className="text-base md:text-xl text-gray-600 dark:text-gray-300">Admin Dashboard - Aleph Engineering and Supplies</p>
                  </div>
                </div>

                {/* Todo List Section */}
                <div className="max-w-4xl mx-auto">
                  <TodoList />
                </div>
              </div> : activeView === "orders" ? <div className="bg-background min-h-full">
                <OrdersPage isAdmin={true} />
              </div> : activeView === "progress" ? <div className="bg-background min-h-full">
                <ProgressPage isAdmin={true} />
              </div> : activeView === "processing" ? <div className="bg-background min-h-full">
                <ProcessingPage isAdmin={true} />
              </div> : activeView === "completed" ? <div className="bg-background min-h-full">
                <CompletedPage isAdmin={true} />
              </div> : activeView === "files" ? <div className="bg-background min-h-full">
                <FilesPage isAdmin={true} />
              </div> : activeView === "companies" ? <div className="bg-background min-h-full">
                <ClientCompaniesPage />
              </div> : activeView === "users" ? <div className="bg-background min-h-full">
                <UsersManagementPage />
              </div> : activeView === "orders-list" ? <div className="bg-background min-h-full">
                <OrdersListPage />
              </div> : <div className="text-center p-8 bg-background min-h-full">
                <h2 className="text-2xl font-bold mb-4 text-aleph-green">Page Not Found</h2>
                <p className="text-gray-600 dark:text-gray-300">The requested page could not be found.</p>
              </div>}
          </main>
        </div>
      </div>
    </SidebarProvider>;
};
export default AdminDashboard;