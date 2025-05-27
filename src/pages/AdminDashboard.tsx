
import { useNavigate } from "react-router-dom";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { 
  SidebarProvider, 
  Sidebar, 
  SidebarContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarFooter
} from "@/components/ui/sidebar";
import { Home, FileText, ListOrdered, BarChart2, Settings, Files, Building2, Users, Truck } from "lucide-react";
import OrdersPage from "@/components/orders/OrdersPage";
import ProgressPage from "@/components/orders/ProgressPage";
import ProcessingPage from "@/components/orders/ProcessingPage";
import CompletedPage from "@/components/orders/CompletedPage";
import FilesPage from "@/components/orders/FilesPage";
import ClientCompaniesPage from "@/components/admin/ClientCompaniesPage";
import DeliveryNotePage from "@/components/admin/DeliveryNotePage";

const AdminDashboard = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [activeView, setActiveView] = useState("home");
  
  const handleLogout = () => {
    // In a real app, we would clear auth tokens/state here
    toast({
      title: "Logged out",
      description: "You have been successfully logged out as admin.",
    });
    navigate("/auth");
  };

  const handleMenuClick = (view) => {
    setActiveView(view);
  };
  
  return (
    <SidebarProvider>
      <div className="min-h-screen w-full flex bg-slate-50 dark:bg-gray-900">
        {/* Sidebar */}
        <Sidebar className="dark:bg-gray-800">
          <SidebarContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton 
                  tooltip="Home" 
                  onClick={() => handleMenuClick("home")}
                  className={`sidebar-hover ${activeView === "home" ? "sidebar-active" : ""}`}
                >
                  <Home />
                  <span>Home</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton 
                  tooltip="Orders"
                  onClick={() => handleMenuClick("orders")}
                  className={`sidebar-hover ${activeView === "orders" ? "sidebar-active" : ""}`}
                >
                  <ListOrdered />
                  <span>Orders</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton 
                  tooltip="Progress"
                  onClick={() => handleMenuClick("progress")}
                  className={`sidebar-hover ${activeView === "progress" ? "sidebar-active" : ""}`}
                >
                  <BarChart2 />
                  <span>Progress</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton 
                  tooltip="Processing"
                  onClick={() => handleMenuClick("processing")}
                  className={`sidebar-hover ${activeView === "processing" ? "sidebar-active" : ""}`}
                >
                  <FileText />
                  <span>Processing</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton 
                  tooltip="Invoicing"
                  onClick={() => handleMenuClick("invoicing")}
                  className={`sidebar-hover ${activeView === "invoicing" ? "sidebar-active" : ""}`}
                >
                  <FileText />
                  <span>Invoicing</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton 
                  tooltip="Delivery Notes"
                  onClick={() => handleMenuClick("delivery-notes")}
                  className={`sidebar-hover ${activeView === "delivery-notes" ? "sidebar-active" : ""}`}
                >
                  <Truck />
                  <span>Delivery Notes</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton 
                  tooltip="Completed"
                  onClick={() => handleMenuClick("completed")}
                  className={`sidebar-hover ${activeView === "completed" ? "sidebar-active" : ""}`}
                >
                  <FileText />
                  <span>Completed</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarContent>
          <SidebarFooter>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton 
                  tooltip="Files"
                  onClick={() => handleMenuClick("files")}
                  className={`sidebar-hover ${activeView === "files" ? "sidebar-active" : ""}`}
                >
                  <Files />
                  <span>Files</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton 
                  tooltip="Companies"
                  onClick={() => handleMenuClick("companies")}
                  className={`sidebar-hover ${activeView === "companies" ? "sidebar-active" : ""}`}
                >
                  <Building2 />
                  <span>Companies</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton 
                  tooltip="Users"
                  onClick={() => handleMenuClick("users")}
                  className={`sidebar-hover ${activeView === "users" ? "sidebar-active" : ""}`}
                >
                  <Users />
                  <span>Users</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarFooter>
        </Sidebar>

        {/* Main content */}
        <div className="flex-1 flex flex-col">
          {/* Header */}
          <header className="bg-white dark:bg-gray-800 shadow-sm p-4">
            <div className="max-w-7xl mx-auto flex justify-between items-center">
              <div className="flex items-center">
                <h1 className="text-2xl font-bold text-aleph-green">Aleph Engineering and Supplies - Admin</h1>
              </div>
              <div className="flex items-center gap-4">
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="rounded-full sidebar-hover"
                  onClick={() => navigate("/settings")}
                >
                  <Settings className="h-5 w-5" />
                  <span className="sr-only">Account settings</span>
                </Button>
                <Button 
                  variant="outline" 
                  onClick={handleLogout}
                  className="border-aleph-green text-aleph-green hover:bg-aleph-green hover:text-white dark:border-aleph-green dark:text-aleph-green"
                >
                  Logout
                </Button>
              </div>
            </div>
          </header>

          {/* Dashboard content */}
          <main className="flex-1 p-4 md:p-8">
            {activeView === "home" ? (
              <div className="flex items-center justify-center h-full relative">
                {/* Faded background logo */}
                <div 
                  className="absolute inset-0 opacity-5 bg-no-repeat bg-center"
                  style={{
                    backgroundImage: 'url("/lovable-uploads/e1088147-889e-43f6-bdf0-271189b88913.png")',
                    backgroundSize: '50%',
                    zIndex: 0
                  }}
                ></div>
                <div className="text-center relative z-10">
                  <h1 className="text-4xl md:text-6xl font-bold text-aleph-green mb-4">Admin Dashboard</h1>
                  <p className="text-xl text-gray-600 dark:text-gray-400">Welcome to Aleph Engineering and Supplies Admin Portal</p>
                </div>
              </div>
            ) : activeView === "orders" ? (
              <OrdersPage isAdmin={true} />
            ) : activeView === "progress" ? (
              <ProgressPage isAdmin={true} />
            ) : activeView === "processing" ? (
              <ProcessingPage isAdmin={true} />
            ) : activeView === "invoicing" ? (
              <div className="text-center p-8">
                <h2 className="text-2xl font-bold mb-4 text-aleph-green">Invoicing</h2>
                <p className="dark:text-gray-400">Invoicing functionality will be implemented here.</p>
              </div>
            ) : activeView === "delivery-notes" ? (
              <DeliveryNotePage />
            ) : activeView === "completed" ? (
              <CompletedPage isAdmin={true} />
            ) : activeView === "files" ? (
              <FilesPage isAdmin={true} />
            ) : activeView === "companies" ? (
              <ClientCompaniesPage />
            ) : activeView === "users" ? (
              <div className="text-center p-8">
                <h2 className="text-2xl font-bold mb-4 text-aleph-green">User Management</h2>
                <p className="dark:text-gray-400">User management functionality will be implemented here.</p>
              </div>
            ) : (
              <div className="text-center p-8">
                <h2 className="text-2xl font-bold mb-4 text-aleph-green">Page Not Found</h2>
                <p className="dark:text-gray-400">The requested page could not be found.</p>
              </div>
            )}
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
};

export default AdminDashboard;
