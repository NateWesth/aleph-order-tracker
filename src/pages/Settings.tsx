import { useNavigate } from "react-router-dom";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/contexts/ThemeContext";
import { supabase } from "@/integrations/supabase/client";
import { ArrowLeft, User, Building2, Moon, Sun } from "lucide-react";

const Settings = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [userProfile, setUserProfile] = useState<any>(null);
  const [companyInfo, setCompanyInfo] = useState<any>(null);
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
      const { data: profileData } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();
      
      setUserProfile(profileData);

      // Fetch company information based on user's company code
      if (profileData?.company_code) {
        const { data: companyData } = await supabase
          .from('companies')
          .select('*')
          .eq('code', profileData.company_code)
          .single();
        
        setCompanyInfo(companyData);
      }
    } catch (error) {
      console.error('Error fetching user data:', error);
      toast({
        title: "Error",
        description: "Failed to load user information",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="text-lg">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <header className="bg-white dark:bg-gray-800 shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-6">
            <div className="flex items-center">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => navigate(-1)}
                className="mr-4"
              >
                <ArrowLeft className="h-5 w-5" />
              </Button>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Settings</h1>
            </div>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <div className="px-4 py-6 sm:px-0">
          <div className="grid gap-6 md:grid-cols-2">
            {/* Theme Settings */}
            <Card>
              <CardHeader>
                <div className="flex items-center space-x-2">
                  {theme === 'dark' ? (
                    <Moon className="h-5 w-5 text-aleph-green" />
                  ) : (
                    <Sun className="h-5 w-5 text-aleph-green" />
                  )}
                  <CardTitle>Appearance</CardTitle>
                </div>
                <CardDescription>
                  Customize your viewing experience
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="theme-toggle">Dark Mode</Label>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      Switch between light and dark themes
                    </p>
                  </div>
                  <Switch
                    id="theme-toggle"
                    checked={theme === 'dark'}
                    onCheckedChange={toggleTheme}
                  />
                </div>
              </CardContent>
            </Card>

            {/* Profile Information */}
            <Card>
              <CardHeader>
                <div className="flex items-center space-x-2">
                  <User className="h-5 w-5 text-aleph-green" />
                  <CardTitle>Profile Information</CardTitle>
                </div>
                <CardDescription>
                  Your personal account information
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="fullName">Full Name</Label>
                  <Input
                    id="fullName"
                    value={userProfile?.full_name || ''}
                    readOnly
                    className="bg-gray-50 dark:bg-gray-700"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    value={userProfile?.email || user?.email || ''}
                    readOnly
                    className="bg-gray-50 dark:bg-gray-700"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="phone">Phone</Label>
                  <Input
                    id="phone"
                    value={userProfile?.phone || 'Not provided'}
                    readOnly
                    className="bg-gray-50 dark:bg-gray-700"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="position">Position</Label>
                  <Input
                    id="position"
                    value={userProfile?.position || 'Not provided'}
                    readOnly
                    className="bg-gray-50 dark:bg-gray-700"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="companyCode">Company Code</Label>
                  <Input
                    id="companyCode"
                    value={userProfile?.company_code || 'Not provided'}
                    readOnly
                    className="bg-gray-50 dark:bg-gray-700"
                  />
                </div>
              </CardContent>
            </Card>

            {/* Company Information */}
            <Card className="md:col-span-2">
              <CardHeader>
                <div className="flex items-center space-x-2">
                  <Building2 className="h-5 w-5 text-aleph-green" />
                  <CardTitle>Company Information</CardTitle>
                </div>
                <CardDescription>
                  Information about your company
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {companyInfo ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="companyName">Company Name</Label>
                      <Input
                        id="companyName"
                        value={companyInfo.name}
                        readOnly
                        className="bg-gray-50 dark:bg-gray-700"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="contactPerson">Contact Person</Label>
                      <Input
                        id="contactPerson"
                        value={companyInfo.contact_person || 'Not provided'}
                        readOnly
                        className="bg-gray-50 dark:bg-gray-700"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="companyEmail">Company Email</Label>
                      <Input
                        id="companyEmail"
                        value={companyInfo.email || 'Not provided'}
                        readOnly
                        className="bg-gray-50 dark:bg-gray-700"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="companyPhone">Company Phone</Label>
                      <Input
                        id="companyPhone"
                        value={companyInfo.phone || 'Not provided'}
                        readOnly
                        className="bg-gray-50 dark:bg-gray-700"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="companyAddress">Address</Label>
                      <Input
                        id="companyAddress"
                        value={companyInfo.address || 'Not provided'}
                        readOnly
                        className="bg-gray-50 dark:bg-gray-700"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="vatNumber">VAT Number</Label>
                      <Input
                        id="vatNumber"
                        value={companyInfo.vat_number || 'Not provided'}
                        readOnly
                        className="bg-gray-50 dark:bg-gray-700"
                      />
                    </div>
                    <div className="space-y-2 md:col-span-2">
                      <Label htmlFor="accountManager">Account Manager</Label>
                      <Input
                        id="accountManager"
                        value={companyInfo.account_manager || 'Not provided'}
                        readOnly
                        className="bg-gray-50 dark:bg-gray-700"
                      />
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <Building2 className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                    <p className="text-gray-500">No company information available</p>
                    <p className="text-sm text-gray-400 mt-2">
                      Company details will appear here once linked to a company code
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
};

export default Settings;
