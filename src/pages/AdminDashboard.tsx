import { useNavigate } from "react-router-dom";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/contexts/ThemeContext";
import { ProcessedLogo } from "@/components/ui/ProcessedLogo";
import { supabase } from "@/integrations/supabase/client";
import { SidebarProvider, Sidebar, SidebarContent, SidebarMenu, SidebarMenuItem, SidebarMenuButton, SidebarFooter } from "@/components/ui/sidebar";
import { Home, FileText, ListOrdered, BarChart2, Settings, Files, Building2, Users } from "lucide-react";
import OrdersPage from "@/components/orders/OrdersPage";
import ProgressPage from "@/components/orders/ProgressPage";
import ProcessingPage from "@/components/orders/ProcessingPage";
import CompletedPage from "@/components/orders/CompletedPage";
import FilesPage from "@/components/orders/FilesPage";
import ClientCompaniesPage from "@/components/admin/ClientCompaniesPage";
import UsersManagementPage from "@/components/admin/UsersManagementPage";
import TodoList from "@/components/admin/TodoList";
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
        <Sidebar className="dark:bg-black bg-white">
          <SidebarContent className="relative">
            {/* Watermark background */}
            <div className="absolute inset-0 opacity-10 bg-no-repeat bg-center bg-contain pointer-events-none" 
                 style={{
                   backgroundImage: 'url("/lovable-uploads/e1088147-889e-43f6-bdf0-271189b88913.png")'
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
            </SidebarMenu>
          </SidebarContent>
          <SidebarFooter>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton tooltip="Files" onClick={() => handleMenuClick("files")} className={`sidebar-hover ${activeView === "files" ? "sidebar-active" : ""}`}>
                  <Files />
                  <span>Files</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton tooltip="Companies" onClick={() => handleMenuClick("companies")} className={`sidebar-hover ${activeView === "companies" ? "sidebar-active" : ""}`}>
                  <Building2 />
                  <span>Companies</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton tooltip="Users" onClick={() => handleMenuClick("users")} className={`sidebar-hover ${activeView === "users" ? "sidebar-active" : ""}`}>
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
          <header className="toolbar-aleph py-2">{/* Reduced padding for smaller header */}
            <div className="max-w-7xl mx-auto flex justify-between items-center">
              <div className="flex items-center">
                
              </div>
              <div className="flex items-center gap-4">
                <Button variant="ghost" size="icon" className="rounded-full sidebar-hover" onClick={() => navigate("/settings")}>
                  <Settings className="h-5 w-5" />
                  <span className="sr-only">Account settings</span>
                </Button>
                <Button variant="outline" onClick={handleLogout} className="border-aleph-green text-aleph-green hover:bg-aleph-green hover:text-white dark:border-aleph-green dark:text-aleph-green sidebar-hover">
                  Logout
                </Button>
              </div>
            </div>
          </header>

          {/* Dashboard content - White in light mode, slightly lighter grey than toolbar in dark mode */}
          <main className="flex-1 p-4 md:p-8 bg-white dark:bg-gray-800">
            {activeView === "home" ? <div className="space-y-6">
                {/* Welcome Section */}
                <div className="flex items-center justify-center h-64 relative bg-white dark:bg-gray-800">
                  {/* Faded background logo */}
                  <div className="absolute inset-0 opacity-5 bg-no-repeat bg-center" style={{
                backgroundImage: 'url("/lovable-uploads/e1088147-889e-43f6-bdf0-271189b88913.png")',
                backgroundSize: '50%',
                zIndex: 0
              }}></div>
                  <div className="text-center relative z-10">
                    <h1 className="text-4xl md:text-6xl font-bold text-aleph-green mb-4">
                      Welcome{userProfile?.full_name ? `, ${userProfile.full_name}` : ''}
                    </h1>
                    <p className="text-xl text-gray-600 dark:text-gray-300">Admin Dashboard - Aleph Engineering and Supplies</p>
                  </div>
                </div>

                {/* Todo List Section */}
                <div className="max-w-4xl mx-auto">
                  <TodoList />
                </div>
              </div> : activeView === "orders" ? <div className="bg-white dark:bg-gray-800 min-h-full">
                <OrdersPage isAdmin={true} />
              </div> : activeView === "progress" ? <div className="bg-white dark:bg-gray-800 min-h-full">
                <ProgressPage isAdmin={true} />
              </div> : activeView === "processing" ? <div className="bg-white dark:bg-gray-800 min-h-full">
                <ProcessingPage isAdmin={true} />
              </div> : activeView === "completed" ? <div className="bg-white dark:bg-gray-800 min-h-full">
                <CompletedPage isAdmin={true} />
              </div> : activeView === "files" ? <div className="bg-white dark:bg-gray-800 min-h-full">
                <FilesPage isAdmin={true} />
              </div> : activeView === "companies" ? <div className="bg-white dark:bg-gray-800 min-h-full">
                <ClientCompaniesPage />
              </div> : activeView === "users" ? <div className="bg-white dark:bg-gray-800 min-h-full">
                <UsersManagementPage />
              </div> : <div className="text-center p-8 bg-white dark:bg-gray-800 min-h-full">
                <h2 className="text-2xl font-bold mb-4 text-aleph-green">Page Not Found</h2>
                <p className="text-gray-600 dark:text-gray-300">The requested page could not be found.</p>
              </div>}
          </main>
        </div>
      </div>
    </SidebarProvider>;
};
export default AdminDashboard;