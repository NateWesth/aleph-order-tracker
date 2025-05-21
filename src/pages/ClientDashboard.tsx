
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

const ClientDashboard = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  
  const handleLogout = () => {
    // In a real app, we would clear auth tokens/state here
    toast({
      title: "Logged out",
      description: "You have been successfully logged out.",
    });
    navigate("/auth");
  };
  
  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-8">
      <div className="max-w-6xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold text-company-blue">Client Dashboard</h1>
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
    </div>
  );
};

export default ClientDashboard;
