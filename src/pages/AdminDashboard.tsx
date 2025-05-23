
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
import { Home, FileText, ListOrdered, BarChart2, Settings, Files, Building2, Users } from "lucide-react";
import OrdersPage from "@/components/orders/OrdersPage";
import ProgressPage from "@/components/orders/ProgressPage";
import ProcessingPage from "@/components/orders/ProcessingPage";
import CompletedPage from "@/components/orders/CompletedPage";
import FilesPage from "@/components/orders/FilesPage";
import ClientCompaniesPage from "@/components/admin/ClientCompaniesPage";

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
      <div className="min-h-screen w-full flex bg-slate-50">
        {/* Sidebar */}
        <Sidebar>
          <SidebarContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton 
                  tooltip="Home" 
                  onClick={() => handleMenuClick("home")}
                  className={activeView === "home" ? "bg-slate-200" : ""}
                >
                  <Home />
                  <span>Home</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton 
                  tooltip="Orders"
                  onClick={() => handleMenuClick("orders")}
                  className={activeView === "orders" ? "bg-slate-200" : ""}
                >
                  <ListOrdered />
                  <span>Orders</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton 
                  tooltip="Progress"
                  onClick={() => handleMenuClick("progress")}
                  className={activeView === "progress" ? "bg-slate-200" : ""}
                >
                  <BarChart2 />
                  <span>Progress</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton 
                  tooltip="Processing"
                  onClick={() => handleMenuClick("processing")}
                  className={activeView === "processing" ? "bg-slate-200" : ""}
                >
                  <FileText />
                  <span>Processing</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton 
                  tooltip="Invoicing"
                  onClick={() => handleMenuClick("invoicing")}
                  className={activeView === "invoicing" ? "bg-slate-200" : ""}
                >
                  <FileText />
                  <span>Invoicing</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton 
                  tooltip="Completed"
                  onClick={() => handleMenuClick("completed")}
                  className={activeView === "completed" ? "bg-slate-200" : ""}
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
                  className={activeView === "files" ? "bg-slate-200" : ""}
                >
                  <Files />
                  <span>Files</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton 
                  tooltip="Companies"
                  onClick={() => handleMenuClick("companies")}
                  className={activeView === "companies" ? "bg-slate-200" : ""}
                >
                  <Building2 />
                  <span>Companies</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton 
                  tooltip="Users"
                  onClick={() => handleMenuClick("users")}
                  className={activeView === "users" ? "bg-slate-200" : ""}
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
          <header className="bg-white shadow-sm p-4">
            <div className="max-w-7xl mx-auto flex justify-between items-center">
              <div className="flex items-center">
                <h1 className="text-2xl font-bold text-company-blue">Aleph Engineering and Supplies - Admin</h1>
              </div>
              <div className="flex items-center gap-4">
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="rounded-full"
                  onClick={() => navigate("/account-settings")}
                >
                  <Settings className="h-5 w-5" />
                  <span className="sr-only">Account settings</span>
                </Button>
                <Button 
                  variant="outline" 
                  onClick={handleLogout}
                  className="border-company-blue text-company-blue hover:bg-company-blue hover:text-white"
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
                    backgroundImage: 'url("/lovable-uploads/favicon.png")',
                    backgroundSize: '50%',
                    zIndex: 0
                  }}
                ></div>
                <div className="text-center relative z-10">
                  <h1 className="text-4xl md:text-6xl font-bold text-company-blue mb-4">Admin Dashboard</h1>
                  <p className="text-xl text-gray-600">Welcome to Aleph Engineering and Supplies Admin Portal</p>
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
                <h2 className="text-2xl font-bold mb-4">Invoicing</h2>
                <p>Invoicing functionality will be implemented here.</p>
              </div>
            ) : activeView === "completed" ? (
              <CompletedPage isAdmin={true} />
            ) : activeView === "files" ? (
              <FilesPage isAdmin={true} />
            ) : activeView === "companies" ? (
              <ClientCompaniesPage />
            ) : activeView === "users" ? (
              <div className="text-center p-8">
                <h2 className="text-2xl font-bold mb-4">User Management</h2>
                <p>User management functionality will be implemented here.</p>
              </div>
            ) : (
              <div className="text-center p-8">
                <h2 className="text-2xl font-bold mb-4">Page Not Found</h2>
                <p>The requested page could not be found.</p>
              </div>
            )}
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
};

export default AdminDashboard;
