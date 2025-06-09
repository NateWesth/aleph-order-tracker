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
    userType: "user",
    adminCode: ""
  });

  const validateAdminCode = async (adminCode: string): Promise<boolean> => {
    try {
      const { data, error } = await supabase.functions.invoke('validate-admin-code', {
        body: { adminCode }
      });

      if (error) {
        console.error('Admin validation error:', error);
        return false;
      }

      return data?.isValid || false;
    } catch (error) {
      console.error('Error validating admin code:', error);
      return false;
    }
  };

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

      const isValidAdmin = await validateAdminCode(formData.adminCode);
      if (!isValidAdmin) {
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

      const { data: company, error: companyError } = await supabase
        .from('companies')
        .select('id, code')
        .eq('code', formData.companyCode)
        .single();

      if (companyError || !company) {
        toast({
          title: "Error",
          description: "Invalid company code. Please check with your company administrator.",
          variant: "destructive",
        });
        return;
      }
    }

    setLoading(true);

    try {
      const { error } = await supabase.auth.signUp({
        email: formData.email,
        password: formData.password,
        options: {
          data: {
            full_name: formData.fullName,
            company_code: formData.userType === "user" ? formData.companyCode : null,
            phone: formData.phone,
            position: formData.position,
            user_type: formData.userType
          }
        }
      });

      if (error) throw error;

      toast({
        title: "Success",
        description: "Account created successfully! Please check your email to confirm your account.",
      });
      
      navigate("/auth");
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
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
            placeholder="Enter your company code"
            required
            className="dark:bg-gray-700 dark:border-gray-600"
          />
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
