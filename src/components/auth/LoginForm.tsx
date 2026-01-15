import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Fingerprint, ScanFace } from "lucide-react";
import ForgotPasswordForm from "./ForgotPasswordForm";
import { 
  isBiometricAvailable, 
  getBiometricTypeName, 
  authenticateWithBiometric, 
  getCredentials, 
  saveCredentials,
  hasStoredCredentials,
  BiometryType
} from "@/utils/biometricAuth";

const LoginForm = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [biometricLoading, setBiometricLoading] = useState(false);
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [biometricType, setBiometricType] = useState<BiometryType>(BiometryType.NONE);
  const [hasSavedCredentials, setHasSavedCredentials] = useState(false);
  const [formData, setFormData] = useState({
    email: "",
    password: "",
  });

  // Check biometric availability on mount
  useEffect(() => {
    checkBiometricAvailability();
  }, []);

  const checkBiometricAvailability = async () => {
    const result = await isBiometricAvailable();
    setBiometricAvailable(result.isAvailable);
    setBiometricType(result.biometryType);
    
    if (result.isAvailable) {
      const hasCredentials = await hasStoredCredentials();
      setHasSavedCredentials(hasCredentials);
    }
  };

  const performLogin = async (email: string, password: string, saveForBiometric: boolean = false) => {
    try {
      console.log("Attempting to sign in user with email:", email);
      
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email,
        password: password,
      });

      if (error) {
        console.error("Sign in error:", error);
        throw error;
      }

      if (!data.user) {
        throw new Error("No user data returned from sign in");
      }

      console.log("User signed in successfully:", data.user.id);

      // Check if user is approved
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('approved, full_name')
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
        return false;
      }

      if (!profile?.approved) {
        await supabase.auth.signOut();
        toast({
          title: "Pending Approval",
          description: "Your account is pending approval by an administrator. Please check back later.",
          variant: "destructive",
        });
        return false;
      }

      // Save credentials for biometric login if available and requested
      if (saveForBiometric && biometricAvailable) {
        const saved = await saveCredentials(email, password);
        if (saved) {
          setHasSavedCredentials(true);
          console.log("Credentials saved for future biometric login");
        }
      }

      toast({
        title: "Success",
        description: `Welcome back${profile.full_name ? `, ${profile.full_name}` : ''}!`,
      });

      navigate("/admin-dashboard");
      return true;
      
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
      return false;
    }
  };

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

    setLoading(true);
    await performLogin(formData.email, formData.password, true);
    setLoading(false);
  };

  const handleBiometricLogin = async () => {
    setBiometricLoading(true);
    
    try {
      // First authenticate with biometric
      const biometricName = getBiometricTypeName(biometricType);
      const authenticated = await authenticateWithBiometric(`Use ${biometricName} to log in`);
      
      if (!authenticated) {
        toast({
          title: "Authentication Failed",
          description: `${biometricName} authentication was cancelled or failed.`,
          variant: "destructive",
        });
        return;
      }

      // Get stored credentials
      const credentials = await getCredentials();
      
      if (!credentials) {
        toast({
          title: "No Saved Credentials",
          description: "Please log in with your email and password first to enable biometric login.",
          variant: "destructive",
        });
        setHasSavedCredentials(false);
        return;
      }

      // Perform login with stored credentials
      await performLogin(credentials.email, credentials.password, false);
      
    } catch (error) {
      console.error("Biometric login error:", error);
      toast({
        title: "Biometric Login Failed",
        description: "An error occurred during biometric authentication.",
        variant: "destructive",
      });
    } finally {
      setBiometricLoading(false);
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
      
      <Button 
        type="submit" 
        className="w-full bg-aleph-green hover:bg-green-500"
        disabled={loading || biometricLoading}
      >
        {loading ? "Signing In..." : "Sign In"}
      </Button>

      {/* Biometric Login Button - Only show on native platforms with saved credentials */}
      {biometricAvailable && hasSavedCredentials && (
        <Button 
          type="button"
          variant="outline"
          className="w-full flex items-center justify-center gap-2"
          onClick={handleBiometricLogin}
          disabled={loading || biometricLoading}
        >
          {biometricType === BiometryType.FACE_ID || biometricType === BiometryType.FACE_AUTHENTICATION ? (
            <ScanFace className="h-5 w-5" />
          ) : (
            <Fingerprint className="h-5 w-5" />
          )}
          {biometricLoading 
            ? "Authenticating..." 
            : `Sign in with ${getBiometricTypeName(biometricType)}`}
        </Button>
      )}

      {/* Show hint for biometric setup if available but no saved credentials */}
      {biometricAvailable && !hasSavedCredentials && (
        <p className="text-xs text-center text-muted-foreground">
          Sign in once to enable {getBiometricTypeName(biometricType)} login
        </p>
      )}
      
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
