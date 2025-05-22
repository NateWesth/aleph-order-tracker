
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
import { Home, FileText, ListOrdered, BarChart2, Settings, Files } from "lucide-react";

const ClientDashboard = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [activeView, setActiveView] = useState("home");
  // In a real app, this would come from an authentication context or API
  const clientName = "John Doe";
  
  const handleLogout = () => {
    // In a real app, we would clear auth tokens/state here
    toast({
      title: "Logged out",
      description: "You have been successfully logged out.",
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
            </SidebarMenu>
          </SidebarFooter>
        </Sidebar>

        {/* Main content */}
        <div className="flex-1 flex flex-col">
          {/* Header */}
          <header className="bg-white shadow-sm p-4">
            <div className="max-w-7xl mx-auto flex justify-between items-center">
              <div className="flex items-center">
                <h1 className="text-2xl font-bold text-company-blue">Aleph Engineering and Supplies</h1>
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
                    backgroundImage: 'url("/favicon.ico")',
                    backgroundSize: '50%',
                    zIndex: 0
                  }}
                ></div>
                <div className="text-center relative z-10">
                  <h1 className="text-4xl md:text-6xl font-bold text-company-blue mb-4">Welcome, {clientName}</h1>
                  <p className="text-xl text-gray-600">Thank you for choosing Aleph Engineering and Supplies</p>
                </div>
              </div>
            ) : (
              <div className="max-w-6xl mx-auto">
                <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                  <div className="bg-white p-6 rounded-lg shadow-md">
                    <h2 className="text-xl font-semibold mb-4">My Projects</h2>
                    <p className="text-gray-600 mb-4">View and manage your active projects</p>
                    <Button className="w-full bg-company-blue hover:bg-company-darkblue">View Projects</Button>
                  </div>
                  
                  <div className="bg-white p-6 rounded-lg shadow-md">
                    <h2 className="text-xl font-semibold mb-4">Support Tickets</h2>
                    <p className="text-gray-600 mb-4">Check the status of your support requests</p>
                    <Button className="w-full bg-company-blue hover:bg-company-darkblue">View Tickets</Button>
                  </div>
                  
                  <div className="bg-white p-6 rounded-lg shadow-md">
                    <h2 className="text-xl font-semibold mb-4">My Account</h2>
                    <p className="text-gray-600 mb-4">Update your profile and preferences</p>
                    <Button className="w-full bg-company-blue hover:bg-company-darkblue">Account Settings</Button>
                  </div>
                </div>
                
                <div className="mt-8 bg-white p-6 rounded-lg shadow-md">
                  <h2 className="text-xl font-semibold mb-4">Recent Activity</h2>
                  <div className="space-y-4">
                    <div className="pb-4 border-b">
                      <p className="font-medium">Project proposal approved</p>
                      <p className="text-sm text-gray-500">Yesterday, 2:30 PM</p>
                    </div>
                    <div className="pb-4 border-b">
                      <p className="font-medium">Support ticket #1234 updated</p>
                      <p className="text-sm text-gray-500">May 19, 10:15 AM</p>
                    </div>
                    <div className="pb-4 border-b">
                      <p className="font-medium">New message from support team</p>
                      <p className="text-sm text-gray-500">May 18, 9:45 AM</p>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
};

export default ClientDashboard;
