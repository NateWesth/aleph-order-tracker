
import { useState } from "react";
import { SidebarProvider } from "@/components/ui/sidebar";
import AdminSidebar from "@/components/admin/AdminSidebar";
import AdminHeader from "@/components/admin/AdminHeader";
import AdminMainContent from "@/components/admin/AdminMainContent";

const AdminDashboard = () => {
  const [activeView, setActiveView] = useState("home");

  const handleMenuClick = (view: string) => {
    setActiveView(view);
  };
  
  return (
    <SidebarProvider>
      <div className="min-h-screen w-full flex bg-black dark:bg-black">
        <AdminSidebar activeView={activeView} onMenuClick={handleMenuClick} />
        <div className="flex-1 flex flex-col">
          <AdminHeader />
          <AdminMainContent activeView={activeView} />
        </div>
      </div>
    </SidebarProvider>
  );
};

export default AdminDashboard;
