import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import ForgotPasswordForm from "./ForgotPasswordForm";

const LoginForm = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    email: "",
    password: "",
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
        return;
      }

      if (!profile?.approved) {
        await supabase.auth.signOut();
        toast({
          title: "Pending Approval",
          description: "Your account is pending approval by an administrator. Please check back later.",
          variant: "destructive",
        });
        return;
      }

      toast({
        title: "Success",
        description: `Welcome back${profile.full_name ? `, ${profile.full_name}` : ''}!`,
      });

      navigate("/admin-dashboard");
      
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
