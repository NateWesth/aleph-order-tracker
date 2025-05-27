
import { useState } from "react";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { Mail, Lock } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import ForgotPasswordForm from "./ForgotPasswordForm";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

const loginFormSchema = z.object({
  email: z.string().email({ message: "Please enter a valid email address" }),
  password: z.string().min(8, { message: "Password must be at least 8 characters" }),
  userType: z.enum(["client", "admin"], {
    required_error: "Please select a user type",
  })
});

type LoginFormValues = z.infer<typeof loginFormSchema>;

const LoginForm = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [forgotPasswordOpen, setForgotPasswordOpen] = useState(false);
  const { toast } = useToast();
  const navigate = useNavigate();
  
  const form = useForm<LoginFormValues>({
    resolver: zodResolver(loginFormSchema),
    defaultValues: {
      email: "",
      password: "",
      userType: "client"
    },
  });

  const onSubmit = async (values: LoginFormValues) => {
    setIsLoading(true);
    
    try {
      // This is where you would integrate with your authentication service
      console.log("Login attempt:", values);
      
      // Simulating a successful login for now
      setTimeout(() => {
        toast({
          title: "Login successful",
          description: `Welcome back! You're logged in as a ${values.userType}.`,
        });
        
        // Redirect to appropriate dashboard based on user type
        if (values.userType === "admin") {
          navigate("/admin-dashboard");
        } else {
          navigate("/client-dashboard");
        }
        
        setIsLoading(false);
      }, 1000);
      
    } catch (error) {
      console.error("Login error:", error);
      toast({
        title: "Login failed",
        description: "Invalid email or password",
        variant: "destructive",
      });
      setIsLoading(false);
    }
  };

  const handleForgotPasswordSuccess = () => {
    setForgotPasswordOpen(false);
  };

  return (
    <>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <FormField
            control={form.control}
            name="userType"
            render={({ field }) => (
              <FormItem className="space-y-3">
                <FormLabel className="dark:text-gray-200">Login as</FormLabel>
                <FormControl>
                  <RadioGroup
                    onValueChange={field.onChange}
                    value={field.value}
                    className="flex space-x-4"
                  >
                    <FormItem className="flex items-center space-x-2">
                      <FormControl>
                        <RadioGroupItem value="client" />
                      </FormControl>
                      <FormLabel className="font-normal cursor-pointer dark:text-gray-200">Client</FormLabel>
                    </FormItem>
                    <FormItem className="flex items-center space-x-2">
                      <FormControl>
                        <RadioGroupItem value="admin" />
                      </FormControl>
                      <FormLabel className="font-normal cursor-pointer dark:text-gray-200">Admin</FormLabel>
                    </FormItem>
                  </RadioGroup>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          
          <FormField
            control={form.control}
            name="email"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="dark:text-gray-200">Email</FormLabel>
                <FormControl>
                  <div className="flex items-center border rounded-md focus-within:ring-2 focus-within:ring-ring focus-within:border-input dark:border-gray-600">
                    <Mail className="w-4 h-4 ml-3 text-gray-500 dark:text-gray-400" />
                    <Input placeholder="your@email.com" className="border-0 focus-visible:ring-0 dark:bg-gray-800 dark:text-gray-200" {...field} />
                  </div>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          
          <FormField
            control={form.control}
            name="password"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="dark:text-gray-200">Password</FormLabel>
                <FormControl>
                  <div className="flex items-center border rounded-md focus-within:ring-2 focus-within:ring-ring focus-within:border-input dark:border-gray-600">
                    <Lock className="w-4 h-4 ml-3 text-gray-500 dark:text-gray-400" />
                    <Input type="password" placeholder="••••••••" className="border-0 focus-visible:ring-0 dark:bg-gray-800 dark:text-gray-200" {...field} />
                  </div>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => setForgotPasswordOpen(true)}
              className="text-sm text-aleph-green hover:text-green-500 hover:underline"
            >
              Forgot password?
            </button>
          </div>
          
          <Button 
            type="submit" 
            className="w-full bg-aleph-green hover:bg-green-500 border border-gray-400 dark:border-gray-400" 
            disabled={isLoading}
          >
            {isLoading ? "Logging in..." : "Login"}
          </Button>
        </form>
      </Form>

      <Dialog open={forgotPasswordOpen} onOpenChange={setForgotPasswordOpen}>
        <DialogContent className="sm:max-w-md dark:bg-gray-800 dark:border-gray-700">
          <DialogHeader>
            <DialogTitle className="dark:text-gray-200">Reset your password</DialogTitle>
            <DialogDescription className="dark:text-gray-400">
              We'll send you instructions to reset your password
            </DialogDescription>
          </DialogHeader>
          <ForgotPasswordForm onSuccess={handleForgotPasswordSuccess} />
        </DialogContent>
      </Dialog>
    </>
  );
};

export default LoginForm;
