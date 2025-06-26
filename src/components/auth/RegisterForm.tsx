
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

const RegisterForm = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    fullName: "",
    email: "",
    password: "",
    confirmPassword: "",
    companyCode: "",
    phone: "",
    position: "",
    userType: "user", // This maps to "user" role in database
    adminCode: ""
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Input validation
    if (!formData.fullName.trim()) {
      toast({
        title: "Error",
        description: "Full name is required",
        variant: "destructive",
      });
      return;
    }

    if (!formData.email.trim()) {
      toast({
        title: "Error",
        description: "Email is required",
        variant: "destructive",
      });
      return;
    }

    if (formData.password.length < 6) {
      toast({
        title: "Error",
        description: "Password must be at least 6 characters long",
        variant: "destructive",
      });
      return;
    }
    
    if (formData.password !== formData.confirmPassword) {
      toast({
        title: "Error",
        description: "Passwords do not match",
        variant: "destructive",
      });
      return;
    }

    // Validate admin code if user selected admin
    if (formData.userType === "admin") {
      if (!formData.adminCode.trim()) {
        toast({
          title: "Error",
          description: "Admin access code is required for admin users.",
          variant: "destructive",
        });
        return;
      }

      // Hardcoded admin code validation
      if (formData.adminCode !== "ALEPH7901") {
        toast({
          title: "Error",
          description: "Invalid admin code. Please contact Aleph Engineering and Supplies for the correct code.",
          variant: "destructive",
        });
        return;
      }
    }

    // Validate company code exists only for regular users
    if (formData.userType === "user") {
      if (!formData.companyCode.trim()) {
        toast({
          title: "Error",
          description: "Company code is required for client users.",
          variant: "destructive",
        });
        return;
      }

      try {
        console.log("Validating company code:", formData.companyCode);
        
        // Normalize the company code for comparison
        const normalizedCode = formData.companyCode.trim().toUpperCase();
        
        // Use exact match instead of ilike to be more precise
        const { data: company, error: companyError } = await supabase
          .from('companies')
          .select('id, code, name')
          .eq('code', normalizedCode)
          .maybeSingle();

        console.log("Company validation result:", { company, companyError });

        if (companyError) {
          console.error("Company validation error:", companyError);
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

        console.log("Company found:", company.name, "with code:", company.code);
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
      console.log("Attempting to sign up user with email:", formData.email);
      console.log("User type selected:", formData.userType);
      
      const { data, error } = await supabase.auth.signUp({
        email: formData.email,
        password: formData.password,
        options: {
          emailRedirectTo: `${window.location.origin}/auth`,
          data: {
            full_name: formData.fullName,
            company_code: formData.userType === "user" ? formData.companyCode.trim().toUpperCase() : null,
            phone: formData.phone,
            position: formData.position,
            user_type: formData.userType // This will be "admin" or "user" - matches our trigger expectations
          }
        }
      });

      if (error) {
        console.error("Supabase auth error:", error);
        throw error;
      }

      console.log("User signed up successfully with user_type:", formData.userType);
      console.log("Sign up response:", data);
      
      toast({
        title: "Success",
        description: "Account created successfully! Please check your email to confirm your account.",
      });
      
      navigate("/auth");
    } catch (error: any) {
      console.error("Registration error:", error);
      
      let errorMessage = "An unexpected error occurred. Please try again.";
      
      if (error.message) {
        // Handle specific Supabase auth errors
        if (error.message.includes("User already registered")) {
          errorMessage = "An account with this email already exists. Please try logging in instead.";
        } else if (error.message.includes("Invalid email")) {
          errorMessage = "Please enter a valid email address.";
        } else if (error.message.includes("Password")) {
          errorMessage = "Password does not meet requirements. Please try a stronger password.";
        } else {
          errorMessage = error.message;
        }
      }
      
      toast({
        title: "Registration Failed",
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
        <Label htmlFor="fullName">Full Name</Label>
        <Input
          id="fullName"
          type="text"
          value={formData.fullName}
          onChange={(e) => setFormData({...formData, fullName: e.target.value})}
          required
          className="dark:bg-gray-700 dark:border-gray-600"
        />
      </div>
      
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

      <div className="space-y-3">
        <Label>Account Type</Label>
        <RadioGroup 
          value={formData.userType} 
          onValueChange={(value) => setFormData({...formData, userType: value, adminCode: "", companyCode: ""})}
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

      {formData.userType === "admin" && (
        <div className="space-y-2">
          <Label htmlFor="adminCode">Admin Access Code</Label>
          <Input
            id="adminCode"
            type="password"
            value={formData.adminCode}
            onChange={(e) => setFormData({...formData, adminCode: e.target.value})}
            placeholder="Enter admin access code"
            required
            className="dark:bg-gray-700 dark:border-gray-600"
          />
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Contact Aleph Engineering and Supplies for the admin access code
          </p>
        </div>
      )}

      {formData.userType === "user" && (
        <div className="space-y-2">
          <Label htmlFor="companyCode">Company Code</Label>
          <Input
            id="companyCode"
            type="text"
            value={formData.companyCode}
            onChange={(e) => setFormData({...formData, companyCode: e.target.value})}
            placeholder="Enter your company code (e.g., TR1BET)"
            required
            className="dark:bg-gray-700 dark:border-gray-600"
          />
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Enter the company code provided by your administrator
          </p>
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="phone">Phone (Optional)</Label>
        <Input
          id="phone"
          type="tel"
          value={formData.phone}
          onChange={(e) => setFormData({...formData, phone: e.target.value})}
          className="dark:bg-gray-700 dark:border-gray-600"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="position">Position (Optional)</Label>
        <Input
          id="position"
          type="text"
          value={formData.position}
          onChange={(e) => setFormData({...formData, position: e.target.value})}
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
      
      <div className="space-y-2">
        <Label htmlFor="confirmPassword">Confirm Password</Label>
        <Input
          id="confirmPassword"
          type="password"
          value={formData.confirmPassword}
          onChange={(e) => setFormData({...formData, confirmPassword: e.target.value})}
          required
          className="dark:bg-gray-700 dark:border-gray-600"
        />
      </div>
      
      <Button 
        type="submit" 
        className="w-full bg-aleph-green hover:bg-green-500"
        disabled={loading}
      >
        {loading ? "Creating Account..." : "Create Account"}
      </Button>
    </form>
  );
};

export default RegisterForm;
