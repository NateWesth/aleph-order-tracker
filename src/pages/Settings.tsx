
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { useTheme } from "@/contexts/ThemeContext";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { ArrowLeft, Building2, User, Mail, Phone, MapPin, Moon, Sun } from "lucide-react";
import { useState, useEffect } from "react";

interface UserProfile {
  id: string;
  full_name: string;
  email: string;
  phone: string;
  position: string;
  company_code: string;
}

interface Company {
  id: string;
  name: string;
  code: string;
  contact_person: string;
  email: string;
  phone: string;
  address: string;
  account_manager: string;
}

const Settings = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { theme, toggleTheme } = useTheme();
  const { user } = useAuth();
  
  const [userInfo, setUserInfo] = useState<UserProfile | null>(null);
  const [companyInfo, setCompanyInfo] = useState<Company | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user) {
      fetchUserData();
    }
  }, [user]);

  const fetchUserData = async () => {
    if (!user) return;
    
    try {
      // Fetch user profile
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();

      if (profileError) throw profileError;
      setUserInfo(profile);

      // Fetch company information based on company code
      if (profile.company_code) {
        const { data: company, error: companyError } = await supabase
          .from('companies')
          .select('*')
          .eq('code', profile.company_code)
          .single();

        if (companyError) {
          console.error('Company not found:', companyError);
        } else {
          setCompanyInfo(company);
        }
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: "Failed to fetch user data: " + error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSaveProfile = async () => {
    if (!user || !userInfo) return;

    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          full_name: userInfo.full_name,
          phone: userInfo.phone,
          position: userInfo.position
        })
        .eq('id', user.id);

      if (error) throw error;

      toast({
        title: "Profile Updated",
        description: "Your profile information has been saved successfully.",
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: "Failed to update profile: " + error.message,
        variant: "destructive",
      });
    }
  };

  const handleChangePassword = () => {
    toast({
      title: "Password Change",
      description: "Password change functionality would be implemented here.",
    });
  };

  const goBack = () => {
    // Determine which dashboard to return to based on current user role
    const isAdmin = window.location.pathname.includes('admin');
    navigate(isAdmin ? '/admin-dashboard' : '/client-dashboard');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="text-lg">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-gray-900">
      {/* Header */}
      <header className="bg-white dark:bg-gray-800 shadow-sm p-4">
        <div className="max-w-7xl mx-auto flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={goBack} className="sidebar-hover">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-2xl font-bold text-aleph-green">Account Settings</h1>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-4xl mx-auto p-6 space-y-6">
        {/* Appearance Settings */}
        <Card className="dark:bg-gray-800 dark:border-gray-700">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-aleph-green">
              {theme === 'dark' ? <Moon className="h-5 w-5" /> : <Sun className="h-5 w-5" />}
              Appearance
            </CardTitle>
            <CardDescription className="dark:text-gray-400">
              Customize the appearance of the application.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="dark-mode" className="dark:text-gray-200">Dark Mode</Label>
                <p className="text-sm text-muted-foreground dark:text-gray-400">
                  Toggle between light and dark themes
                </p>
              </div>
              <Switch
                id="dark-mode"
                checked={theme === 'dark'}
                onCheckedChange={toggleTheme}
              />
            </div>
          </CardContent>
        </Card>

        {/* Profile Settings */}
        <Card className="dark:bg-gray-800 dark:border-gray-700">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-aleph-green">
              <User className="h-5 w-5" />
              Profile Information
            </CardTitle>
            <CardDescription className="dark:text-gray-400">
              Update your personal information and contact details.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {userInfo && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="name" className="dark:text-gray-200">Full Name</Label>
                  <Input
                    id="name"
                    value={userInfo.full_name || ''}
                    onChange={(e) => setUserInfo({...userInfo, full_name: e.target.value})}
                    className="dark:bg-gray-700 dark:border-gray-600 dark:text-gray-200"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email" className="dark:text-gray-200">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    value={userInfo.email || ''}
                    disabled
                    className="dark:bg-gray-700 dark:border-gray-600 dark:text-gray-200 opacity-50"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="phone" className="dark:text-gray-200">Phone</Label>
                  <Input
                    id="phone"
                    value={userInfo.phone || ''}
                    onChange={(e) => setUserInfo({...userInfo, phone: e.target.value})}
                    className="dark:bg-gray-700 dark:border-gray-600 dark:text-gray-200"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="position" className="dark:text-gray-200">Position</Label>
                  <Input
                    id="position"
                    value={userInfo.position || ''}
                    onChange={(e) => setUserInfo({...userInfo, position: e.target.value})}
                    className="dark:bg-gray-700 dark:border-gray-600 dark:text-gray-200"
                  />
                </div>
              </div>
            )}
            <Button onClick={handleSaveProfile} className="bg-aleph-green hover:bg-green-500">
              Save Changes
            </Button>
          </CardContent>
        </Card>

        {/* Security Settings */}
        <Card className="dark:bg-gray-800 dark:border-gray-700">
          <CardHeader>
            <CardTitle className="text-aleph-green">Security</CardTitle>
            <CardDescription className="dark:text-gray-400">
              Manage your password and security preferences.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline" onClick={handleChangePassword} className="dark:border-gray-600 dark:text-gray-200">
              Change Password
            </Button>
          </CardContent>
        </Card>

        <Separator className="dark:border-gray-700" />

        {/* Company Information */}
        <Card className="dark:bg-gray-800 dark:border-gray-700">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-aleph-green">
              <Building2 className="h-5 w-5" />
              Company Information
            </CardTitle>
            <CardDescription className="dark:text-gray-400">
              View details about your linked company.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {companyInfo ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Building2 className="h-4 w-4 text-gray-500 dark:text-gray-400" />
                    <span className="font-medium dark:text-gray-200">Company Name:</span>
                  </div>
                  <p className="text-gray-700 dark:text-gray-300 ml-6">{companyInfo.name}</p>
                </div>
                
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Mail className="h-4 w-4 text-gray-500 dark:text-gray-400" />
                    <span className="font-medium dark:text-gray-200">Company Email:</span>
                  </div>
                  <p className="text-gray-700 dark:text-gray-300 ml-6">{companyInfo.email}</p>
                </div>
                
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-gray-500 dark:text-gray-400" />
                    <span className="font-medium dark:text-gray-200">Address:</span>
                  </div>
                  <p className="text-gray-700 dark:text-gray-300 ml-6">{companyInfo.address}</p>
                </div>
                
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Phone className="h-4 w-4 text-gray-500 dark:text-gray-400" />
                    <span className="font-medium dark:text-gray-200">Phone:</span>
                  </div>
                  <p className="text-gray-700 dark:text-gray-300 ml-6">{companyInfo.phone}</p>
                </div>
                
                <div className="space-y-3 md:col-span-2">
                  <div className="flex items-center gap-2">
                    <User className="h-4 w-4 text-gray-500 dark:text-gray-400" />
                    <span className="font-medium dark:text-gray-200">Account Manager:</span>
                  </div>
                  <p className="text-gray-700 dark:text-gray-300 ml-6">{companyInfo.account_manager}</p>
                </div>
              </div>
            ) : (
              <div className="text-center py-8">
                <p className="text-gray-600 dark:text-gray-400">
                  {userInfo?.company_code ? 
                    `Company information not found for code: ${userInfo.company_code}` :
                    'No company code associated with your account'
                  }
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
};

export default Settings;
