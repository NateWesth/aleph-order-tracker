
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { Settings } from "lucide-react";

export default function AdminHeader() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { signOut } = useAuth();

  const handleLogout = async () => {
    await signOut();
    toast({
      title: "Logged out",
      description: "You have been successfully logged out as admin.",
    });
    navigate("/auth");
  };

  return (
    <header className="toolbar-aleph p-4">
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
            className="border-aleph-green text-aleph-green hover:bg-aleph-green hover:text-white dark:border-aleph-green dark:text-aleph-green sidebar-hover"
          >
            Logout
          </Button>
        </div>
      </div>
    </header>
  );
}
