import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Lock, Eye, EyeOff } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

const resetPasswordSchema = z.object({
  password: z.string().min(6, { message: "Password must be at least 6 characters" }),
  confirmPassword: z.string().min(6, { message: "Password must be at least 6 characters" }),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"],
});

type ResetPasswordValues = z.infer<typeof resetPasswordSchema>;

const ResetPassword = () => {
  console.log('ResetPassword component loaded');
  
  // Parse the original URL from the browser's location
  const originalUrl = window.location.href;
  console.log('Original URL from href:', originalUrl);
  
  // Extract hash parameters from the original URL
  const hashMatch = originalUrl.match(/#(.+)$/);
  const hashString = hashMatch ? hashMatch[1] : '';
  console.log('Extracted hash string:', hashString);
  
  const hashParams = new URLSearchParams(hashString);
  console.log('Parsed hash params:', Object.fromEntries(hashParams.entries()));
  
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [validToken, setValidToken] = useState(false);
  const { toast } = useToast();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const form = useForm<ResetPasswordValues>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: {
      password: "",
      confirmPassword: "",
    },
  });

  useEffect(() => {
    // Use the captured hash parameters from component mount
    const accessToken = hashParams.get('access_token');
    const refreshToken = hashParams.get('refresh_token');
    const type = hashParams.get('type');
    
    console.log('Hash parameters from captured state:', { accessToken, refreshToken, type });
    
    // Also check query parameters as fallback
    const queryAccessToken = searchParams.get('access_token');
    const queryRefreshToken = searchParams.get('refresh_token');
    const queryType = searchParams.get('type');
    
    console.log('Query parameters:', { queryAccessToken, queryRefreshToken, queryType });
    
    const finalAccessToken = accessToken || queryAccessToken;
    const finalRefreshToken = refreshToken || queryRefreshToken;
    const finalType = type || queryType;
    
    if (!finalAccessToken || !finalRefreshToken || finalType !== 'recovery') {
      console.error('Missing required parameters for password reset');
      toast({
        title: "Invalid reset link",
        description: "This reset link is invalid or has expired. Please request a new one.",
        variant: "destructive",
      });
      navigate("/");
      return;
    }

    // Set the session with the tokens
    supabase.auth.setSession({
      access_token: finalAccessToken,
      refresh_token: finalRefreshToken,
    }).then(({ error }) => {
      if (error) {
        console.error('Error setting session:', error);
        toast({
          title: "Session error",
          description: "Unable to verify reset link. Please try again.",
          variant: "destructive",
        });
        navigate("/");
      } else {
        console.log('Session set successfully for password reset');
        // Successfully authenticated for password reset
        setValidToken(true);
      }
    });
  }, [hashParams, searchParams, navigate, toast]);

  // Prevent automatic redirects when authenticated during password reset
  useEffect(() => {
    if (validToken) {
      // Clear any potential redirects by updating browser history
      const currentPath = window.location.pathname;
      if (currentPath !== '/reset-password') {
        window.history.replaceState(null, '', '/reset-password');
      }
    }
  }, [validToken]);

  const onSubmit = async (values: ResetPasswordValues) => {
    setIsLoading(true);
    
    try {
      const { error } = await supabase.auth.updateUser({
        password: values.password
      });

      if (error) {
        throw error;
      }

      toast({
        title: "Password updated",
        description: "Your password has been successfully updated. You can now log in with your new password.",
      });

      // Sign out and redirect to login
      await supabase.auth.signOut();
      navigate("/");
      
    } catch (error: any) {
      console.error("Password update error:", error);
      toast({
        title: "Failed to update password",
        description: error.message || "Please try again later",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Don't render the form until we have a valid token
  if (!validToken) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background to-muted flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="space-y-1">
            <CardTitle className="text-2xl font-bold text-center">Verifying Reset Link</CardTitle>
            <CardDescription className="text-center">
              Please wait while we verify your password reset link...
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-muted flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl font-bold text-center">Reset Password</CardTitle>
          <CardDescription className="text-center">
            Enter your new password below
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>New Password</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <div className="flex items-center border rounded-md focus-within:ring-2 focus-within:ring-primary">
                          <Lock className="w-4 h-4 ml-3 text-muted-foreground" />
                          <Input
                            type={showPassword ? "text" : "password"}
                            placeholder="Enter new password"
                            className="border-0 focus-visible:ring-0 pr-10"
                            {...field}
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="absolute right-0 px-3 py-2 h-full"
                            onClick={() => setShowPassword(!showPassword)}
                          >
                            {showPassword ? (
                              <EyeOff className="h-4 w-4" />
                            ) : (
                              <Eye className="h-4 w-4" />
                            )}
                          </Button>
                        </div>
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={form.control}
                name="confirmPassword"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Confirm New Password</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <div className="flex items-center border rounded-md focus-within:ring-2 focus-within:ring-primary">
                          <Lock className="w-4 h-4 ml-3 text-muted-foreground" />
                          <Input
                            type={showConfirmPassword ? "text" : "password"}
                            placeholder="Confirm new password"
                            className="border-0 focus-visible:ring-0 pr-10"
                            {...field}
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="absolute right-0 px-3 py-2 h-full"
                            onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                          >
                            {showConfirmPassword ? (
                              <EyeOff className="h-4 w-4" />
                            ) : (
                              <Eye className="h-4 w-4" />
                            )}
                          </Button>
                        </div>
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading ? "Updating..." : "Update Password"}
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
};

export default ResetPassword;