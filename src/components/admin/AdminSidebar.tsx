
import { 
  SidebarProvider, 
  Sidebar, 
  SidebarContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarFooter
} from "@/components/ui/sidebar";
import { Home, FileText, ListOrdered, BarChart2, Files, Building2, Users, Truck } from "lucide-react";

interface AdminSidebarProps {
  activeView: string;
  onMenuClick: (view: string) => void;
}

export default function AdminSidebar({ activeView, onMenuClick }: AdminSidebarProps) {
  return (
    <Sidebar className="dark:bg-black bg-white">
      <SidebarContent>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton 
              tooltip="Home" 
              onClick={() => onMenuClick("home")}
              className={`sidebar-hover ${activeView === "home" ? "sidebar-active" : ""}`}
            >
              <Home />
              <span>Home</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton 
              tooltip="Orders"
              onClick={() => onMenuClick("orders")}
              className={`sidebar-hover ${activeView === "orders" ? "sidebar-active" : ""}`}
            >
              <ListOrdered />
              <span>Orders</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton 
              tooltip="Progress"
              onClick={() => onMenuClick("progress")}
              className={`sidebar-hover ${activeView === "progress" ? "sidebar-active" : ""}`}
            >
              <BarChart2 />
              <span>Progress</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton 
              tooltip="Processing"
              onClick={() => onMenuClick("processing")}
              className={`sidebar-hover ${activeView === "processing" ? "sidebar-active" : ""}`}
            >
              <FileText />
              <span>Processing</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton 
              tooltip="Delivery Notes"
              onClick={() => onMenuClick("delivery-notes")}
              className={`sidebar-hover ${activeView === "delivery-notes" ? "sidebar-active" : ""}`}
            >
              <Truck />
              <span>Delivery Notes</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton 
              tooltip="Completed"
              onClick={() => onMenuClick("completed")}
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
              onClick={() => onMenuClick("files")}
              className={`sidebar-hover ${activeView === "files" ? "sidebar-active" : ""}`}
            >
              <Files />
              <span>Files</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton 
              tooltip="Companies"
              onClick={() => onMenuClick("companies")}
              className={`sidebar-hover ${activeView === "companies" ? "sidebar-active" : ""}`}
            >
              <Building2 />
              <span>Companies</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton 
              tooltip="Users"
              onClick={() => onMenuClick("users")}
              className={`sidebar-hover ${activeView === "users" ? "sidebar-active" : ""}`}
            >
              <Users />
              <span>Users</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
