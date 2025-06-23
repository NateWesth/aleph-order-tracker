
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
    userType: "client",
    accessCode: ""
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      // Validate access code based on user type
      await validateAccessCode(formData);
    } catch (error: any) {
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
      const authData = await signInUser(formData.email, formData.password);
      
      console.log("User signed in successfully, checking role...");

      // Get and validate user role
      const actualRole = await getUserRole(authData.user.id);
      validateUserRole(actualRole, formData.userType);

      // Validate company association for client users
      await validateCompanyAssociation(authData.user.id, formData.accessCode, formData.userType);

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
