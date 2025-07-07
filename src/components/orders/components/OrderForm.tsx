
import { useState, useEffect } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Trash2, Plus, RefreshCw } from "lucide-react";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useCompanyData } from "@/components/admin/hooks/useCompanyData";
import { getUserProfile, getUserRole } from "@/utils/authService";
import { useAuth } from "@/contexts/AuthContext";
import { generateOrderNumber } from "../utils/orderUtils";

export interface OrderItem {
  id: string;
  name: string;
  quantity: number;
  unit?: string;
  notes?: string;
}

interface OrderFormData {
  orderNumber: string;
  description: string;
  companyId: string;
  totalAmount: number;
  items: OrderItem[];
}

interface OrderFormProps {
  onSubmit: (orderData: {
    orderNumber: string;
    description: string;
    companyId: string;
    totalAmount: number;
    items: OrderItem[];
  }) => void;
  loading?: boolean;
}

const OrderForm = ({ onSubmit, loading = false }: OrderFormProps) => {
  const { user } = useAuth();
  const { companies, loading: companiesLoading, userRole } = useCompanyData();
  const [userProfile, setUserProfile] = useState<any>(null);
  const [availableCompanies, setAvailableCompanies] = useState<any[]>([]);
  const [currentUserRole, setCurrentUserRole] = useState<string>('');

  const form = useForm<OrderFormData>({
    defaultValues: {
      orderNumber: "",
      description: "",
      companyId: "",
      totalAmount: 0,
      items: [{ id: crypto.randomUUID(), name: "", quantity: 1, unit: "", notes: "" }]
    }
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "items"
  });

  useEffect(() => {
    const fetchUserInfo = async () => {
      if (!user?.id) return;

      try {
        console.log("Fetching user info for:", user.id);
        const [role, profile] = await Promise.all([
          getUserRole(user.id),
          getUserProfile(user.id)
        ]);

        console.log("User role:", role);
        console.log("User profile:", profile);
        
        setCurrentUserRole(role);
        setUserProfile(profile);

        if (role === 'admin') {
          // Admins can see all companies
          console.log("Admin user - showing all companies:", companies.length);
          setAvailableCompanies(companies);
        } else if (role === 'user' && profile?.company_code) {
          // Users can only see companies that match their company code
          console.log("Regular user with company code:", profile.company_code);
          const matchingCompanies = companies.filter(company => 
            company.code === profile.company_code
          );
          console.log("Matching companies found:", matchingCompanies.length, matchingCompanies);
          setAvailableCompanies(matchingCompanies);
          
          // If user has only one matching company, auto-select it
          if (matchingCompanies.length === 1) {
            console.log("Auto-selecting single company:", matchingCompanies[0].name);
            form.setValue('companyId', matchingCompanies[0].id);
          }
        } else {
          console.log("User role or company code not found");
          setAvailableCompanies([]);
        }
      } catch (error) {
        console.error("Error fetching user info:", error);
        setAvailableCompanies([]);
      }
    };

    if (companies.length > 0) {
      fetchUserInfo();
    }
  }, [user?.id, companies, form]);

  // Generate a new order number
  const handleGenerateOrderNumber = () => {
    const newOrderNumber = generateOrderNumber();
    form.setValue('orderNumber', newOrderNumber);
  };

  // Generate order number on component mount if empty
  useEffect(() => {
    if (!form.getValues('orderNumber')) {
      handleGenerateOrderNumber();
    }
  }, []);

  const addItem = () => {
    append({ 
      id: crypto.randomUUID(), 
      name: "", 
      quantity: 1, 
      unit: "", 
      notes: "" 
    });
  };

  const removeItem = (index: number) => {
    if (fields.length > 1) {
      remove(index);
    }
  };

  const handleSubmit = (data: OrderFormData) => {
    const validItems = data.items.filter(item => item.name.trim() && item.quantity > 0);
    
    if (validItems.length === 0) {
      form.setError("items", { 
        type: "manual", 
        message: "Please add at least one valid item" 
      });
      return;
    }

    if (!data.orderNumber.trim()) {
      form.setError("orderNumber", { 
        type: "manual", 
        message: "Order number is required" 
      });
      return;
    }

    if (!data.companyId) {
      form.setError("companyId", { 
        type: "manual", 
        message: "Please select a company" 
      });
      return;
    }

    console.log("Submitting order with data:", data);
    onSubmit({
      orderNumber: data.orderNumber,
      description: data.description,
      companyId: data.companyId,
      totalAmount: data.totalAmount,
      items: validItems
    });
  };

  if (companiesLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="text-sm text-gray-600">Loading companies...</div>
      </div>
    );
  }

  console.log("Rendering form with:", {
    currentUserRole,
    availableCompanies: availableCompanies.length,
    userProfile: userProfile?.company_code
  });

  return (
    <div className="space-y-6">
      <Form {...form}>
        <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
          <FormField
            control={form.control}
            name="orderNumber"
            rules={{ required: "Order number is required" }}
            render={({ field }) => (
              <FormItem>
                <FormLabel>Order Number</FormLabel>
                <div className="flex gap-2">
                  <FormControl>
                    <Input
                      {...field}
                      placeholder="Enter order number or generate one"
                    />
                  </FormControl>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleGenerateOrderNumber}
                    className="shrink-0"
                  >
                    <RefreshCw className="w-4 h-4 mr-1" />
                    Generate
                  </Button>
                </div>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="description"
            rules={{ required: "Order description is required" }}
            render={({ field }) => (
              <FormItem>
                <FormLabel>Order Description</FormLabel>
                <FormControl>
                  <Textarea
                    {...field}
                    placeholder="Describe the order requirements..."
                    className="min-h-[100px]"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="companyId"
            rules={{ required: "Please select a company" }}
            render={({ field }) => (
              <FormItem>
                <FormLabel>Company</FormLabel>
                <Select value={field.value} onValueChange={field.onChange}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Select a company" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {availableCompanies.map((company) => (
                      <SelectItem key={company.id} value={company.id}>
                        {company.name} ({company.code})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
                {currentUserRole === 'user' && availableCompanies.length === 0 && (
                  <div className="text-sm text-red-600">
                    No companies found matching your company code. Please contact an administrator.
                  </div>
                )}
                {currentUserRole === 'user' && userProfile?.company_code && (
                  <div className="text-sm text-gray-600">
                    Showing companies for code: {userProfile.company_code}
                  </div>
                )}
                {availableCompanies.length > 0 && (
                  <div className="text-sm text-blue-600">
                    {availableCompanies.length} company(ies) available
                  </div>
                )}
              </FormItem>
            )}
          />

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                Order Items
                <Button type="button" onClick={addItem} size="sm" variant="outline">
                  <Plus className="w-4 h-4 mr-2" />
                  Add Item
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {fields.map((field, index) => (
                <div key={field.id} className="grid grid-cols-12 gap-3 items-end p-4 border rounded-lg">
                  <div className="col-span-4">
                    <FormField
                      control={form.control}
                      name={`items.${index}.name`}
                      rules={{ required: "Item name is required" }}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Item Name</FormLabel>
                          <FormControl>
                            <Input {...field} placeholder="Enter item name" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  <div className="col-span-2">
                    <FormField
                      control={form.control}
                      name={`items.${index}.quantity`}
                      rules={{ 
                        required: "Quantity is required",
                        min: { value: 1, message: "Quantity must be at least 1" }
                      }}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Quantity</FormLabel>
                          <FormControl>
                            <Input 
                              {...field} 
                              type="number" 
                              min="1"
                              onChange={(e) => field.onChange(parseInt(e.target.value) || 0)}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  <div className="col-span-2">
                    <FormField
                      control={form.control}
                      name={`items.${index}.unit`}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Unit</FormLabel>
                          <FormControl>
                            <Input {...field} placeholder="e.g., kg, pcs" />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                  </div>
                  <div className="col-span-3">
                    <FormField
                      control={form.control}
                      name={`items.${index}.notes`}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Notes</FormLabel>
                          <FormControl>
                            <Input {...field} placeholder="Additional notes" />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                  </div>
                  <div className="col-span-1">
                    <Button
                      type="button"
                      onClick={() => removeItem(index)}
                      size="sm"
                      variant="outline"
                      disabled={fields.length === 1}
                      className="w-full"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              ))}
              <FormMessage>{form.formState.errors.items?.message}</FormMessage>
            </CardContent>
          </Card>

          <FormField
            control={form.control}
            name="totalAmount"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Total Amount (Optional)</FormLabel>
                <FormControl>
                  <Input
                    {...field}
                    type="number"
                    placeholder="0.00"
                    step="0.01"
                    min="0"
                    onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <Button 
            type="submit" 
            className="w-full" 
            disabled={loading || companiesLoading}
          >
            {loading ? "Creating Order..." : "Create Order"}
          </Button>
        </form>
      </Form>
    </div>
  );
};

export default OrderForm;
