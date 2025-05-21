
import { useState } from "react";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { Mail } from "lucide-react";

const forgotPasswordSchema = z.object({
  email: z.string().email({ message: "Please enter a valid email address" }),
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
    },
  });

  const onSubmit = async (values: ForgotPasswordValues) => {
    setIsLoading(true);
    
    try {
      // This is where you would integrate with your authentication service
      console.log("Password reset email requested for:", values.email);
      
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
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Email</FormLabel>
              <FormControl>
                <div className="flex items-center border rounded-md focus-within:ring-2 focus-within:ring-ring focus-within:border-input">
                  <Mail className="w-4 h-4 ml-3 text-gray-500" />
                  <Input placeholder="your@email.com" className="border-0 focus-visible:ring-0" {...field} />
                </div>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        
        <Button type="submit" className="w-full bg-company-blue hover:bg-company-darkblue" disabled={isLoading}>
          {isLoading ? "Sending..." : "Send Reset Link"}
        </Button>
      </form>
    </Form>
  );
};

export default ForgotPasswordForm;
