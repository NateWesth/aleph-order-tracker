
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Building2, User, Mail, Phone, MapPin } from "lucide-react";
import { useState } from "react";

const Settings = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  
  // Mock user data - in a real app, this would come from authentication context
  const [userInfo, setUserInfo] = useState({
    name: "John Doe",
    email: "john.doe@example.com",
    phone: "+1 (555) 123-4567",
    position: "Project Manager"
  });

  // Mock company data - in a real app, this would come from API
  const companyInfo = {
    name: "Acme Construction Corp",
    address: "123 Main Street, City, State 12345",
    phone: "+1 (555) 987-6543",
    email: "contact@acmeconstruction.com",
    accountManager: "Sarah Johnson"
  };

  const handleSaveProfile = () => {
    // In a real app, this would make an API call to update user info
    toast({
      title: "Profile Updated",
      description: "Your profile information has been saved successfully.",
    });
  };

  const handleChangePassword = () => {
    // In a real app, this would handle password change
    toast({
      title: "Password Change",
      description: "Password change functionality would be implemented here.",
    });
  };

  const goBack = () => {
    // Determine which dashboard to return to based on current user role
    // In a real app, this would be determined by user permissions/role
    const isAdmin = window.location.pathname.includes('admin');
    navigate(isAdmin ? '/admin-dashboard' : '/client-dashboard');
  };

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="bg-white shadow-sm p-4">
        <div className="max-w-7xl mx-auto flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={goBack}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-2xl font-bold text-aleph-blue">Account Settings</h1>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-4xl mx-auto p-6 space-y-6">
        {/* Profile Settings */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="h-5 w-5" />
              Profile Information
            </CardTitle>
            <CardDescription>
              Update your personal information and contact details.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="name">Full Name</Label>
                <Input
                  id="name"
                  value={userInfo.name}
                  onChange={(e) => setUserInfo({...userInfo, name: e.target.value})}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={userInfo.email}
                  onChange={(e) => setUserInfo({...userInfo, email: e.target.value})}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone">Phone</Label>
                <Input
                  id="phone"
                  value={userInfo.phone}
                  onChange={(e) => setUserInfo({...userInfo, phone: e.target.value})}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="position">Position</Label>
                <Input
                  id="position"
                  value={userInfo.position}
                  onChange={(e) => setUserInfo({...userInfo, position: e.target.value})}
                />
              </div>
            </div>
            <Button onClick={handleSaveProfile} className="bg-aleph-blue hover:bg-blue-500">
              Save Changes
            </Button>
          </CardContent>
        </Card>

        {/* Security Settings */}
        <Card>
          <CardHeader>
            <CardTitle>Security</CardTitle>
            <CardDescription>
              Manage your password and security preferences.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline" onClick={handleChangePassword}>
              Change Password
            </Button>
          </CardContent>
        </Card>

        <Separator />

        {/* Company Information */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5" />
              Company Information
            </CardTitle>
            <CardDescription>
              View details about your linked company.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Building2 className="h-4 w-4 text-gray-500" />
                  <span className="font-medium">Company Name:</span>
                </div>
                <p className="text-gray-700 ml-6">{companyInfo.name}</p>
              </div>
              
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Mail className="h-4 w-4 text-gray-500" />
                  <span className="font-medium">Company Email:</span>
                </div>
                <p className="text-gray-700 ml-6">{companyInfo.email}</p>
              </div>
              
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-gray-500" />
                  <span className="font-medium">Address:</span>
                </div>
                <p className="text-gray-700 ml-6">{companyInfo.address}</p>
              </div>
              
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Phone className="h-4 w-4 text-gray-500" />
                  <span className="font-medium">Phone:</span>
                </div>
                <p className="text-gray-700 ml-6">{companyInfo.phone}</p>
              </div>
              
              <div className="space-y-3 md:col-span-2">
                <div className="flex items-center gap-2">
                  <User className="h-4 w-4 text-gray-500" />
                  <span className="font-medium">Account Manager:</span>
                </div>
                <p className="text-gray-700 ml-6">{companyInfo.accountManager}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
};

export default Settings;
