import { useNavigate } from "react-router-dom";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { SidebarProvider, Sidebar, SidebarContent, SidebarMenu, SidebarMenuItem, SidebarMenuButton, SidebarFooter, SidebarTrigger } from "@/components/ui/sidebar";
import { Home, FileText, ListOrdered, BarChart2, Settings, Files, List, Menu } from "lucide-react";
import OrdersPage from "@/components/orders/OrdersPage";
import ProgressPage from "@/components/orders/ProgressPage";
import ProcessingPage from "@/components/orders/ProcessingPage";
import CompletedPage from "@/components/orders/CompletedPage";
import FilesPage from "@/components/orders/FilesPage";
import { OrdersListPage } from "@/components/orders/OrdersListPage";
import { useIsMobile } from "@/hooks/use-mobile";

const ClientDashboard = () => {
  const navigate = useNavigate();
  const {
    toast
  } = useToast();
  const {
    user,
    signOut
  } = useAuth();
  const [activeView, setActiveView] = useState("home");
  const [userProfile, setUserProfile] = useState<any>(null);
  const [userCompany, setUserCompany] = useState<any>(null);
  const isMobile = useIsMobile();
  useEffect(() => {
    if (user) {
      fetchUserProfile();
    }
  }, [user]);
  const fetchUserProfile = async () => {
    if (!user) return;
    const {
      data
    } = await supabase.from('profiles').select('*').eq('id', user.id).single();
    setUserProfile(data);

    // Fetch company information if user has a company_code or company_id
    if (data?.company_code) {
      const {
        data: companyData
      } = await supabase.from('companies').select('*').eq('code', data.company_code).single();
      setUserCompany(companyData);
    } else if (data?.company_id) {
      const {
        data: companyData
      } = await supabase.from('companies').select('*').eq('id', data.company_id).single();
      setUserCompany(companyData);
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
  const handleMenuClick = (view: string) => {
    setActiveView(view);
  };
  return <SidebarProvider>
      <div className="min-h-screen w-full flex bg-black dark:bg-black">
        {/* Sidebar */}
        <Sidebar className={`dark:bg-black bg-white ${isMobile ? 'data-[state=collapsed]:w-0' : ''}`}>
          <SidebarContent className="relative bg-[#162014] overflow-hidden rounded-none">
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
          <SidebarFooter className="bg-[#162014]">
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton tooltip="Files" onClick={() => handleMenuClick("files")} className={`sidebar-hover ${activeView === "files" ? "sidebar-active" : ""}`}>
                  <Files />
                  <span>Files</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarFooter>
        </Sidebar>

        {/* Main content */}
        <div className="flex-1 flex flex-col">
          {/* Header - light grey in light mode */}
          <header className="toolbar-aleph p-3 md:p-4">
            <div className="max-w-7xl mx-auto flex justify-between items-center">
              <div className="flex items-center gap-2 md:gap-0">
                {isMobile && <SidebarTrigger className="text-aleph-green hover:bg-aleph-green/10 p-2" />}
                <h1 className="text-lg md:text-2xl font-bold text-aleph-green dark:text-white truncate">
                  {userCompany?.name || 'Company Dashboard'}
                </h1>
              </div>
              <div className="flex items-center gap-2 md:gap-4">
                {/* Real-time Status Indicator - Hidden on mobile */}
                {!isMobile && (
                  <div className="flex items-center gap-2 text-sm text-green-600">
                    <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                    <span>Real-time Sync Active</span>
                  </div>
                )}
                <Button variant="ghost" size="icon" className="rounded-full sidebar-hover" onClick={() => navigate("/settings")}>
                  <Settings className="h-4 w-4 md:h-5 md:w-5" />
                  <span className="sr-only">Account settings</span>
                </Button>
                <Button 
                  variant="outline" 
                  onClick={handleLogout} 
                  className={`border-aleph-green text-aleph-green hover:bg-aleph-green hover:text-white dark:border-aleph-green dark:text-aleph-green sidebar-hover ${isMobile ? 'text-xs px-2 py-1' : ''}`}
                >
                  {isMobile ? 'Logout' : 'Logout'}
                </Button>
              </div>
            </div>
          </header>

          {/* Dashboard content - White in light mode, slightly lighter grey than toolbar in dark mode */}
          <main className="flex-1 p-2 md:p-4 lg:p-8 bg-background overflow-x-hidden">
            {activeView === "home" ? <div className="flex items-center justify-center h-full relative bg-background">
                <div className="text-center relative z-10">
                  <h1 className="text-4xl font-bold mb-4 text-emerald-950 dark:text-white md:text-6xl">
                    Welcome{userProfile?.full_name ? `, ${userProfile.full_name}` : ''}
                  </h1>
                  <p className="text-xl text-gray-600 dark:text-gray-300">Client Dashboard - Aleph Engineering and Supplies</p>
                  
                </div>
              </div> : activeView === "orders" ? <div className="bg-background min-h-full">
                <OrdersPage />
              </div> : activeView === "progress" ? <div className="bg-background min-h-full">
                <ProgressPage isAdmin={false} />
              </div> : activeView === "processing" ? <div className="bg-background min-h-full">  
                <ProcessingPage isAdmin={false} />
              </div> : activeView === "completed" ? <div className="bg-background min-h-full">
                <CompletedPage isAdmin={false} />
              </div> : activeView === "files" ? <div className="bg-background min-h-full">
                <FilesPage isAdmin={false} />
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
export default ClientDashboard;