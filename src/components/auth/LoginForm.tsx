import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { getUserRole } from "@/utils/authService";
import ForgotPasswordForm from "./ForgotPasswordForm";

const LoginForm = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    email: "",
    password: "",
    userType: "user",
    accessCode: ""
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.email.trim()) {
      toast({
        title: "Error",
        description: "Email is required",
        variant: "destructive",
      });
      return;
    }

    if (!formData.password.trim()) {
      toast({
        title: "Error",
        description: "Password is required",
        variant: "destructive",
      });
      return;
    }

    if (!formData.accessCode.trim()) {
      toast({
        title: "Error",
        description: formData.userType === "admin" ? "Admin access code is required" : "Company code is required",
        variant: "destructive",
      });
      return;
    }

    // Validate access code before attempting login
    if (formData.userType === "admin") {
      if (formData.accessCode !== "ALEPH7901") {
        toast({
          title: "Error",
          description: "Invalid admin access code.",
          variant: "destructive",
        });
        return;
      }
    } else {
      // Validate company code exists using the secure function
      try {
        const { data: isValidCode, error: companyError } = await supabase
          .rpc('validate_company_code', { company_code: formData.accessCode });

        if (companyError) {
          console.error('Company validation error:', companyError);
          toast({
            title: "Error",
            description: "Unable to validate company code. Please try again.",
            variant: "destructive",
          });
          return;
        }

        if (!isValidCode) {
          toast({
            title: "Error",
            description: "Invalid company code. Please check with your company administrator.",
            variant: "destructive",
          });
          return;
        }
      } catch (error) {
        console.error("Network error during company validation:", error);
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
        console.error("Sign in error:", error);
        throw error;
      }

      if (!data.user) {
        throw new Error("No user data returned from sign in");
      }

      console.log("User signed in successfully:", data.user.id);

      // Get user role to validate access
      const userRole = await getUserRole(data.user.id);
      console.log("User role:", userRole);

      // Validate that the user's role matches their selected user type
      if (formData.userType === "admin" && userRole !== "admin") {
        await supabase.auth.signOut();
        toast({
          title: "Access Denied",
          description: "Admin privileges required. Please contact your administrator.",
          variant: "destructive",
        });
        return;
      }

      if (formData.userType === "user" && userRole === "admin") {
        await supabase.auth.signOut();
        toast({
          title: "Access Denied",
          description: "Admin users cannot log in as clients. Please use the admin login.",
          variant: "destructive",
        });
        return;
      }

      // For client users, validate company association
      if (formData.userType === "user") {
        const { data: profile, error: profileError } = await supabase
          .from('profiles')
          .select('company_code, company_id')
          .eq('id', data.user.id)
          .maybeSingle();

        if (profileError) {
          console.error("Profile fetch error:", profileError);
          await supabase.auth.signOut();
          toast({
            title: "Error",
            description: "Unable to verify user profile. Please try again.",
            variant: "destructive",
          });
          return;
        }

        if (!profile) {
          await supabase.auth.signOut();
          toast({
            title: "Access Denied",
            description: "User profile not found. Please contact your administrator.",
            variant: "destructive",
          });
          return;
        }

        // Check if the provided company code matches any company that this user should have access to
        const { data: validCompany, error: companyCheckError } = await supabase
          .from('companies')
          .select('id, code')
          .or(`code.ilike.${formData.accessCode.trim()},id.eq.${profile.company_id}`)
          .maybeSingle();

        if (companyCheckError || !validCompany) {
          console.error("Company check error:", companyCheckError);
          await supabase.auth.signOut();
          toast({
            title: "Access Denied",
            description: "Your account is not associated with the provided company code. Please contact your administrator.",
            variant: "destructive",
          });
          return;
        }

        // Normalize codes for comparison
        const normalizedAccessCode = formData.accessCode.trim().toUpperCase();
        const normalizedCompanyCode = validCompany.code.trim().toUpperCase();
        const normalizedProfileCode = profile.company_code?.trim().toUpperCase();

        // User can access if either:
        // 1. Their profile company_code matches the entered code, OR
        // 2. Their company_id matches a company with the entered code
        const hasAccess = normalizedProfileCode === normalizedAccessCode || 
                         normalizedCompanyCode === normalizedAccessCode;

        if (!hasAccess) {
          await supabase.auth.signOut();
          toast({
            title: "Access Denied",
            description: "Your account is not associated with the provided company code. Please contact your administrator.",
            variant: "destructive",
          });
          return;
        }
      }

      toast({
        title: "Success",
        description: `Welcome back! You are logged in as ${formData.userType === "admin" ? "Admin" : "Client"}.`,
      });

      // Navigate based on user type
      if (userRole === "admin") {
        navigate("/admin-dashboard");
      } else {
        navigate("/client-dashboard");
      }
      
    } catch (error: any) {
      console.error("Login error:", error);
      
      let errorMessage = "An unexpected error occurred. Please try again.";
      
      if (error.message) {
        if (error.message.includes('Invalid login credentials')) {
          errorMessage = 'Invalid email or password. Please check your credentials and try again.';
        } else if (error.message.includes('Email not confirmed')) {
          errorMessage = 'Please check your email and click the confirmation link before signing in.';
        } else if (error.message.includes('Too many requests')) {
          errorMessage = 'Too many login attempts. Please wait a moment and try again.';
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
        <Label>Login as</Label>
        <RadioGroup 
          value={formData.userType} 
          onValueChange={(value) => setFormData({...formData, userType: value, accessCode: ""})}
          className="flex flex-col space-y-2"
        >
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="user" id="user" />
            <Label htmlFor="user" className="cursor-pointer">Client User</Label>
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
        {loading ? "Signing In..." : "Sign In"}
      </Button>
      
      <div className="text-center">
        <Dialog>
          <DialogTrigger asChild>
            <Button variant="link" className="text-sm text-muted-foreground hover:text-primary">
              Forgot your password?
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Reset Password</DialogTitle>
            </DialogHeader>
            <ForgotPasswordForm onSuccess={() => {
              // Dialog will close automatically when successful
            }} />
          </DialogContent>
        </Dialog>
      </div>
    </form>
  );
};

export default LoginForm;
