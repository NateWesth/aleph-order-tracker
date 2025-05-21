
import { useState } from "react";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useToast } from "@/hooks/use-toast";
import { Mail, User, Phone, Building, Lock } from "lucide-react";

const registerFormSchema = z.object({
  userType: z.enum(["client", "supplier"], {
    required_error: "Please select an account type",
  }),
  email: z.string().email({ message: "Please enter a valid email address" }),
  firstName: z.string().min(2, { message: "First name must be at least 2 characters" }),
  lastName: z.string().min(2, { message: "Last name must be at least 2 characters" }),
  companyName: z.string().min(2, { message: "Company name must be at least 2 characters" }),
  phoneNumber: z
    .string()
    .min(10, { message: "Phone number must be at least 10 digits" })
    .regex(/^\d+$/, { message: "Phone number must contain only digits" }),
  password: z.string().min(8, { message: "Password must be at least 8 characters" }),
  confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords do not match",
  path: ["confirmPassword"],
});

type RegisterFormValues = z.infer<typeof registerFormSchema>;

const RegisterForm = () => {
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();
  const navigate = useNavigate();
  
  const form = useForm<RegisterFormValues>({
    resolver: zodResolver(registerFormSchema),
    defaultValues: {
      userType: "client",
      email: "",
      firstName: "",
      lastName: "",
      companyName: "",
      phoneNumber: "",
      password: "",
      confirmPassword: "",
    },
  });

  const onSubmit = async (values: RegisterFormValues) => {
    setIsLoading(true);
    
    try {
      // This is where you would integrate with your authentication service
      console.log("Registration data:", values);
      
      // Simulating a successful registration for now
      setTimeout(() => {
        toast({
          title: "Registration successful",
          description: `Your ${values.userType} account has been created!`,
        });
        navigate("/");
        setIsLoading(false);
      }, 1000);
      
    } catch (error) {
      console.error("Registration error:", error);
      toast({
        title: "Registration failed",
        description: "There was an error creating your account",
        variant: "destructive",
      });
      setIsLoading(false);
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="userType"
          render={({ field }) => (
            <FormItem className="space-y-2">
              <FormLabel>Account Type</FormLabel>
              <FormControl>
                <RadioGroup
                  onValueChange={field.onChange}
                  defaultValue={field.value}
                  className="flex gap-6"
                >
                  <FormItem className="flex items-center space-x-2 space-y-0">
                    <FormControl>
                      <RadioGroupItem value="client" />
                    </FormControl>
                    <FormLabel className="font-normal cursor-pointer">Client</FormLabel>
                  </FormItem>
                  <FormItem className="flex items-center space-x-2 space-y-0">
                    <FormControl>
                      <RadioGroupItem value="supplier" />
                    </FormControl>
                    <FormLabel className="font-normal cursor-pointer">Supplier</FormLabel>
                  </FormItem>
                </RadioGroup>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="firstName"
            render={({ field }) => (
              <FormItem>
                <FormLabel>First Name</FormLabel>
                <FormControl>
                  <div className="flex items-center border rounded-md focus-within:ring-2 focus-within:ring-ring focus-within:border-input">
                    <User className="w-4 h-4 ml-3 text-gray-500" />
                    <Input placeholder="John" className="border-0 focus-visible:ring-0" {...field} />
                  </div>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          
          <FormField
            control={form.control}
            name="lastName"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Last Name</FormLabel>
                <FormControl>
                  <div className="flex items-center border rounded-md focus-within:ring-2 focus-within:ring-ring focus-within:border-input">
                    <User className="w-4 h-4 ml-3 text-gray-500" />
                    <Input placeholder="Doe" className="border-0 focus-visible:ring-0" {...field} />
                  </div>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
        
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
        
        <FormField
          control={form.control}
          name="companyName"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Company Name</FormLabel>
              <FormControl>
                <div className="flex items-center border rounded-md focus-within:ring-2 focus-within:ring-ring focus-within:border-input">
                  <Building className="w-4 h-4 ml-3 text-gray-500" />
                  <Input placeholder="Acme Inc." className="border-0 focus-visible:ring-0" {...field} />
                </div>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        
        <FormField
          control={form.control}
          name="phoneNumber"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Phone Number</FormLabel>
              <FormControl>
                <div className="flex items-center border rounded-md focus-within:ring-2 focus-within:ring-ring focus-within:border-input">
                  <Phone className="w-4 h-4 ml-3 text-gray-500" />
                  <Input placeholder="1234567890" className="border-0 focus-visible:ring-0" {...field} />
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
              <FormLabel>Password</FormLabel>
              <FormControl>
                <div className="flex items-center border rounded-md focus-within:ring-2 focus-within:ring-ring focus-within:border-input">
                  <Lock className="w-4 h-4 ml-3 text-gray-500" />
                  <Input type="password" placeholder="••••••••" className="border-0 focus-visible:ring-0" {...field} />
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
              <FormLabel>Confirm Password</FormLabel>
              <FormControl>
                <div className="flex items-center border rounded-md focus-within:ring-2 focus-within:ring-ring focus-within:border-input">
                  <Lock className="w-4 h-4 ml-3 text-gray-500" />
                  <Input type="password" placeholder="••••••••" className="border-0 focus-visible:ring-0" {...field} />
                </div>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        
        <Button type="submit" className="w-full bg-company-blue hover:bg-company-darkblue" disabled={isLoading}>
          {isLoading ? "Creating Account..." : "Register"}
        </Button>
      </form>
    </Form>
  );
};

export default RegisterForm;
