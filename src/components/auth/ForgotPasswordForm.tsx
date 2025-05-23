
import { useState } from "react";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { Mail } from "lucide-react";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

const forgotPasswordSchema = z.object({
  email: z.string().email({ message: "Please enter a valid email address" }),
  userType: z.enum(["client", "admin"], {
    required_error: "Please select a user type",
  })
});

type ForgotPasswordValues = z.infer<typeof forgotPasswordSchema>;

interface ForgotPasswordFormProps {
  onSuccess?: () => void;
}

const ForgotPasswordForm = ({ onSuccess }: ForgotPasswordFormProps) => {
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();
  
  const form = useForm<ForgotPasswordValues>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: {
      email: "",
      userType: "client"
    },
  });

  const onSubmit = async (values: ForgotPasswordValues) => {
    setIsLoading(true);
    
    try {
      // This is where you would integrate with your authentication service
      console.log("Password reset email requested for:", values.email, "User type:", values.userType);
      
      // Simulating a successful password reset email
      setTimeout(() => {
        toast({
          title: "Reset link sent",
          description: `Password reset instructions have been sent to ${values.email}`,
        });
        
        if (onSuccess) {
          onSuccess();
        }
        
        setIsLoading(false);
      }, 1000);
      
    } catch (error) {
      console.error("Password reset error:", error);
      toast({
        title: "Failed to send reset link",
        description: "Please try again later",
        variant: "destructive",
      });
      setIsLoading(false);
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <p className="text-sm text-gray-600 mb-4">
          Enter your email address and we'll send you a link to reset your password.
        </p>
        
        <FormField
          control={form.control}
          name="userType"
          render={({ field }) => (
            <FormItem className="space-y-3">
              <FormLabel>Account type</FormLabel>
              <FormControl>
                <RadioGroup
                  onValueChange={field.onChange}
                  value={field.value}
                  className="flex space-x-4"
                >
                  <FormItem className="flex items-center space-x-2">
                    <FormControl>
                      <RadioGroupItem value="client" className="text-aleph-blue border-aleph-blue" />
                    </FormControl>
                    <FormLabel className="font-normal cursor-pointer">Client</FormLabel>
                  </FormItem>
                  <FormItem className="flex items-center space-x-2">
                    <FormControl>
                      <RadioGroupItem value="admin" className="text-aleph-magenta border-aleph-magenta" />
                    </FormControl>
                    <FormLabel className="font-normal cursor-pointer">Admin</FormLabel>
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
              <FormLabel>Email</FormLabel>
              <FormControl>
                <div className="flex items-center border rounded-md focus-within:ring-2 focus-within:ring-aleph-blue">
                  <Mail className="w-4 h-4 ml-3 text-aleph-blue" />
                  <Input placeholder="your@email.com" className="border-0 focus-visible:ring-0" {...field} />
                </div>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        
        <Button type="submit" className="w-full" disabled={isLoading}>
          {isLoading ? "Sending..." : "Send Reset Link"}
        </Button>
      </form>
    </Form>
  );
};

export default ForgotPasswordForm;
