
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Users, Settings, FileText } from "lucide-react";

const AdminDashboard = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  
  const handleLogout = () => {
    // In a real app, we would clear auth tokens/state here
    toast({
      title: "Logged out",
      description: "You have been successfully logged out as admin.",
    });
    navigate("/auth");
  };
  
  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-8">
      <div className="max-w-6xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold text-company-blue">Admin Dashboard</h1>
          <Button 
            variant="outline" 
            onClick={handleLogout}
            className="border-company-blue text-company-blue hover:bg-company-blue hover:text-white"
          >
            Logout
          </Button>
        </div>
        
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          <div className="bg-white p-6 rounded-lg shadow-md">
            <div className="flex items-center mb-4">
              <Users className="w-5 h-5 mr-2 text-company-blue" />
              <h2 className="text-xl font-semibold">User Management</h2>
            </div>
            <p className="text-gray-600 mb-4">Manage user accounts and permissions</p>
            <Button className="w-full bg-company-blue hover:bg-company-darkblue">Manage Users</Button>
          </div>
          
          <div className="bg-white p-6 rounded-lg shadow-md">
            <div className="flex items-center mb-4">
              <FileText className="w-5 h-5 mr-2 text-company-blue" />
              <h2 className="text-xl font-semibold">Reports</h2>
            </div>
            <p className="text-gray-600 mb-4">View system reports and analytics</p>
            <Button className="w-full bg-company-blue hover:bg-company-darkblue">View Reports</Button>
          </div>
          
          <div className="bg-white p-6 rounded-lg shadow-md">
            <div className="flex items-center mb-4">
              <Settings className="w-5 h-5 mr-2 text-company-blue" />
              <h2 className="text-xl font-semibold">System Settings</h2>
            </div>
            <p className="text-gray-600 mb-4">Configure system parameters</p>
            <Button className="w-full bg-company-blue hover:bg-company-darkblue">System Settings</Button>
          </div>
        </div>
        
        <div className="mt-8 grid gap-6 md:grid-cols-2">
          <div className="bg-white p-6 rounded-lg shadow-md">
            <h2 className="text-xl font-semibold mb-4">Recent User Activity</h2>
            <div className="space-y-4">
              <div className="pb-4 border-b">
                <p className="font-medium">User john@example.com logged in</p>
                <p className="text-sm text-gray-500">Today, 11:30 AM</p>
              </div>
              <div className="pb-4 border-b">
                <p className="font-medium">New user registered: alice@example.com</p>
                <p className="text-sm text-gray-500">Today, 10:15 AM</p>
              </div>
              <div className="pb-4 border-b">
                <p className="font-medium">Password reset requested by mark@example.com</p>
                <p className="text-sm text-gray-500">Yesterday, 3:45 PM</p>
              </div>
            </div>
          </div>
          
          <div className="bg-white p-6 rounded-lg shadow-md">
            <h2 className="text-xl font-semibold mb-4">System Notifications</h2>
            <div className="space-y-4">
              <div className="pb-4 border-b">
                <p className="font-medium text-amber-600">Storage usage at 75%</p>
                <p className="text-sm text-gray-500">Today, 8:00 AM</p>
              </div>
              <div className="pb-4 border-b">
                <p className="font-medium text-green-600">System backup completed successfully</p>
                <p className="text-sm text-gray-500">Today, 4:00 AM</p>
              </div>
              <div className="pb-4 border-b">
                <p className="font-medium text-blue-600">New feature update available</p>
                <p className="text-sm text-gray-500">Yesterday, 1:30 PM</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminDashboard;
