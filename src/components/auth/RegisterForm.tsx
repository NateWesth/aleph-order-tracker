
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
    userType: "client",
    adminCode: ""
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (formData.password !== formData.confirmPassword) {
      toast({
        title: "Error",
        description: "Passwords do not match",
        variant: "destructive",
      });
      return;
    }

    // Validate admin code if user selected admin
    if (formData.userType === "admin" && formData.adminCode !== "ALEPH7901") {
      toast({
        title: "Error",
        description: "Invalid admin code. Please contact Aleph Engineering and Supplies for the correct code.",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);

    try {
      const { error } = await supabase.auth.signUp({
        email: formData.email,
        password: formData.password,
        options: {
          data: {
            full_name: formData.fullName,
            company_code: formData.companyCode,
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
          onValueChange={(value) => setFormData({...formData, userType: value, adminCode: ""})}
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

      {formData.userType === "admin" && (
        <div className="space-y-2">
          <Label htmlFor="adminCode">Admin Access Code</Label>
          <Input
            id="adminCode"
            type="text"
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
