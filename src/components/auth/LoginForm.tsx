
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { validateAccessCode, FormData } from "@/utils/authValidation";
import { 
  signInUser, 
  getUserRole, 
  validateUserRole, 
  validateCompanyAssociation, 
  getErrorMessage 
} from "@/utils/authService";
import LoginFormFields from "./LoginFormFields";

const LoginForm = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState<FormData>({
    email: "",
    password: "",
    userType: "client", // Default to client
    accessCode: ""
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    console.log("=== LOGIN ATTEMPT ===");
    console.log("Form data:", {
      email: formData.email,
      userType: formData.userType,
      accessCode: formData.accessCode ? "PROVIDED" : "EMPTY"
    });

    try {
      // Validate access code based on user type
      console.log("Validating access code...");
      await validateAccessCode(formData);
      console.log("Access code validation passed");
    } catch (error: any) {
      console.error("Access code validation failed:", error.message);
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
      return;
    }

    setLoading(true);

    try {
      // Sign in user
      console.log("Signing in user...");
      const authData = await signInUser(formData.email, formData.password);
      console.log("User signed in successfully, user ID:", authData.user.id);

      // Get and validate user role
      console.log("Fetching user role...");
      const actualRole = await getUserRole(authData.user.id);
      console.log("User role retrieved:", actualRole);

      console.log("Validating user role...");
      validateUserRole(actualRole, formData.userType);
      console.log("Role validation passed");

      // Validate company association for client users
      if (formData.userType === "client") {
        console.log("Validating company association...");
        await validateCompanyAssociation(authData.user.id, formData.accessCode, formData.userType);
        console.log("Company association validated");
      }

      toast({
        title: "Success",
        description: "Logged in successfully!",
      });

      // Navigate based on verified role
      if (actualRole === 'admin') {
        console.log("Navigating to admin dashboard");
        navigate("/admin-dashboard");
      } else {
        console.log("Navigating to client dashboard");
        navigate("/client-dashboard");
      }
    } catch (error: any) {
      console.error('=== LOGIN ERROR ===', error);
      
      const errorMessage = getErrorMessage(error);
      
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
      <LoginFormFields formData={formData} setFormData={setFormData} />
      
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
