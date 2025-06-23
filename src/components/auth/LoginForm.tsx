import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

const LoginForm = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    email: "",
    password: "",
    userType: "client",
    accessCode: ""
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validate access code based on user type
    if (formData.userType === "admin") {
      if (!formData.accessCode.trim()) {
        toast({
          title: "Error",
          description: "Admin access code is required.",
          variant: "destructive",
        });
        return;
      }
      
      if (formData.accessCode !== "ALEPH7901") {
        toast({
          title: "Error",
          description: "Invalid admin access code.",
          variant: "destructive",
        });
        return;
      }
    } else {
      if (!formData.accessCode.trim()) {
        toast({
          title: "Error",
          description: "Company code is required.",
          variant: "destructive",
        });
        return;
      }
      
      // Validate company code exists
      try {
        const { data: company, error: companyError } = await supabase
          .from('companies')
          .select('id, code')
          .eq('code', formData.accessCode)
          .maybeSingle();

        if (companyError) {
          console.error('Company validation error:', companyError);
          toast({
            title: "Error",
            description: "Unable to validate company code. Please try again.",
            variant: "destructive",
          });
          return;
        }

        if (!company) {
          toast({
            title: "Error",
            description: "Invalid company code. Please check with your company administrator.",
            variant: "destructive",
          });
          return;
        }
      } catch (error) {
        console.error('Network error during company validation:', error);
        toast({
          title: "Error",
          description: "Network error. Please check your connection and try again.",
          variant: "destructive",
        });
        return;
      }
    }

    setLoading(true);

    try {
      console.log("Attempting to sign in user with email:", formData.email);
      
      const { data, error } = await supabase.auth.signInWithPassword({
        email: formData.email,
        password: formData.password,
      });

      if (error) {
        console.error('Auth sign in error:', error);
        throw error;
      }

      console.log("User signed in successfully, checking role...");

      // Use the new security definer function to get user role
      const { data: roleData, error: roleError } = await supabase
        .rpc('get_user_role', { user_uuid: data.user.id });

      console.log("User role function result:", { roleData, roleError });

      if (roleError) {
        console.error('Error fetching user role:', roleError);
        toast({
          title: "Error",
          description: "Unable to verify user role. Please contact support.",
          variant: "destructive",
        });
        setLoading(false);
        return;
      }

      if (!roleData) {
        console.error('No role found for user:', data.user.id);
        toast({
          title: "Error",
          description: "No role assigned to this user. Please contact support.",
          variant: "destructive",
        });
        setLoading(false);
        return;
      }

      // Verify the selected role matches the user's actual role
      const actualRole = roleData;
      const selectedRole = formData.userType === "admin" ? "admin" : "user";
      
      console.log("Role verification:", { actualRole, selectedRole });
      
      if (actualRole !== selectedRole) {
        toast({
          title: "Error",
          description: `You are registered as a ${actualRole} user but trying to login as ${formData.userType}. Please select the correct user type.`,
          variant: "destructive",
        });
        setLoading(false);
        return;
      }

      // If user is a client, verify they belong to the company they provided the code for
      if (formData.userType === "client") {
        const { data: profile, error: profileError } = await supabase
          .from('profiles')
          .select('company_code')
          .eq('id', data.user.id)
          .maybeSingle();

        console.log("Profile query result:", { profile, profileError });

        if (profileError) {
          console.error('Error fetching user profile:', profileError);
          toast({
            title: "Error",
            description: "Unable to verify company association. Please contact support.",
            variant: "destructive",
          });
          setLoading(false);
          return;
        }

        if (!profile || profile.company_code !== formData.accessCode) {
          toast({
            title: "Error",
            description: "You don't belong to the company associated with this code.",
            variant: "destructive",
          });
          setLoading(false);
          return;
        }
      }

      toast({
        title: "Success",
        description: "Logged in successfully!",
      });

      // Navigate based on verified role
      if (actualRole === 'admin') {
        navigate("/admin-dashboard");
      } else {
        navigate("/client-dashboard");
      }
    } catch (error: any) {
      console.error('Login error:', error);
      
      let errorMessage = "An unexpected error occurred. Please try again.";
      
      if (error.message) {
        if (error.message.includes("Invalid login credentials")) {
          errorMessage = "Invalid email or password. Please check your credentials and try again.";
        } else if (error.message.includes("Email not confirmed")) {
          errorMessage = "Please check your email and confirm your account before logging in.";
        } else {
          errorMessage = error.message;
        }
      }
      
      toast({
        title: "Login Failed",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          type="email"
          value={formData.email}
          onChange={(e) => setFormData({...formData, email: e.target.value})}
          required
          className="dark:bg-gray-700 dark:border-gray-600"
        />
      </div>
      
      <div className="space-y-2">
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          type="password"
          value={formData.password}
          onChange={(e) => setFormData({...formData, password: e.target.value})}
          required
          className="dark:bg-gray-700 dark:border-gray-600"
        />
      </div>

      <div className="space-y-3">
        <Label>Login As</Label>
        <RadioGroup 
          value={formData.userType} 
          onValueChange={(value) => setFormData({...formData, userType: value, accessCode: ""})}
          className="flex flex-col space-y-2"
        >
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="client" id="client" />
            <Label htmlFor="client" className="cursor-pointer">Client User</Label>
          </div>
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="admin" id="admin" />
            <Label htmlFor="admin" className="cursor-pointer">Admin User (Aleph Engineering & Supplies)</Label>
          </div>
        </RadioGroup>
      </div>

      <div className="space-y-2">
        <Label htmlFor="accessCode">
          {formData.userType === "admin" ? "Admin Access Code" : "Company Code"}
        </Label>
        <Input
          id="accessCode"
          type={formData.userType === "admin" ? "password" : "text"}
          value={formData.accessCode}
          onChange={(e) => setFormData({...formData, accessCode: e.target.value})}
          placeholder={formData.userType === "admin" ? "Enter admin access code" : "Enter your company code"}
          required
          className="dark:bg-gray-700 dark:border-gray-600"
        />
        {formData.userType === "admin" && (
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Contact Aleph Engineering and Supplies for the admin access code
          </p>
        )}
      </div>
      
      <Button 
        type="submit" 
        className="w-full bg-aleph-green hover:bg-green-500"
        disabled={loading}
      >
        {loading ? "Signing in..." : "Sign In"}
      </Button>
    </form>
  );
};

export default LoginForm;
