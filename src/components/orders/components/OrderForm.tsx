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
  const { companies, loading: companiesLoading } = useCompanyData();
  const [userProfile, setUserProfile] = useState<any>(null);
  const [availableCompanies, setAvailableCompanies] = useState<any[]>([]);
  const [currentUserRole, setCurrentUserRole] = useState<string>('');
  const [isLoadingUserInfo, setIsLoadingUserInfo] = useState(false);

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
      if (!user?.id || companies.length === 0) {
        console.log("🔍 OrderForm: Skipping fetchUserInfo - userId:", user?.id, "companies:", companies.length);
        return;
      }

      setIsLoadingUserInfo(true);
      try {
        console.log("🔍 OrderForm: Starting user info fetch for:", user.id);
        console.log("🔍 OrderForm: Available companies count:", companies.length);
        console.log("🔍 OrderForm: All companies:", companies.map(c => ({ id: c.id, name: c.name, code: c.code })));
        
        const [role, profile] = await Promise.all([
          getUserRole(user.id),
          getUserProfile(user.id)
        ]);

        console.log("🔍 OrderForm: User role:", role);
        console.log("🔍 OrderForm: User profile:", profile);
        console.log("🔍 OrderForm: Profile company_id:", profile?.company_id);
        console.log("🔍 OrderForm: Profile company_code:", profile?.company_code);
        
        setCurrentUserRole(role);
        setUserProfile(profile);

        if (role === 'admin') {
          console.log("👑 OrderForm: Admin user - showing all companies:", companies.length);
          setAvailableCompanies(companies);
        } else if (role === 'user') {
          console.log("👤 OrderForm: Regular user - filtering companies");
          let matchingCompanies = [];
          
          // First, try to match by company_id (more reliable)
          if (profile?.company_id) {
            console.log("🔍 OrderForm: Filtering by company_id:", profile.company_id);
            matchingCompanies = companies.filter(company => {
              const match = company.id === profile.company_id;
              console.log(`🏢 OrderForm: Checking company ${company.name} (${company.id}) against ${profile.company_id}: ${match}`);
              return match;
            });
            console.log("🏢 OrderForm: Companies matching by ID:", matchingCompanies.length, matchingCompanies.map(c => c.name));
          }
          
          // If no matches by ID and we have a company_code, try that
          if (matchingCompanies.length === 0 && profile?.company_code) {
            console.log("🔍 OrderForm: No ID matches, filtering by company_code:", profile.company_code);
            matchingCompanies = companies.filter(company => {
              const match = company.code === profile.company_code;
              console.log(`🏢 OrderForm: Checking company ${company.name} (${company.code}) against ${profile.company_code}: ${match}`);
              return match;
            });
            console.log("🏢 OrderForm: Companies matching by code:", matchingCompanies.length, matchingCompanies.map(c => c.name));
          }
          
          setAvailableCompanies(matchingCompanies);
          console.log("✅ OrderForm: Final available companies:", matchingCompanies.length, matchingCompanies.map(c => ({ id: c.id, name: c.name, code: c.code })));
          
          if (matchingCompanies.length === 1) {
            const companyId = matchingCompanies[0].id;
            console.log("✅ OrderForm: Auto-selecting single company:", matchingCompanies[0].name, "ID:", companyId);
            form.setValue('companyId', companyId, { shouldValidate: true, shouldDirty: true });
          } else if (matchingCompanies.length === 0) {
            console.error("❌ OrderForm: No matching companies found for user");
            console.error("❌ OrderForm: User profile details:");
            console.error("   - company_id:", profile?.company_id);
            console.error("   - company_code:", profile?.company_code);
            console.error("❌ OrderForm: Available companies details:");
            companies.forEach(company => {
              console.error(`   - ${company.name}: ID=${company.id}, Code=${company.code}`);
            });
          } else {
            console.log("🎯 OrderForm: Multiple companies available, user needs to select");
          }
        } else {
          console.log("❌ OrderForm: Unknown user role:", role);
          setAvailableCompanies([]);
        }
      } catch (error) {
        console.error("❌ OrderForm: Error fetching user info:", error);
        setAvailableCompanies([]);
      } finally {
        setIsLoadingUserInfo(false);
      }
    };

    fetchUserInfo();
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
    console.log("📝 OrderForm: Starting handleSubmit with data:", data);
    console.log("📝 OrderForm: Current user role:", currentUserRole);
    console.log("📝 OrderForm: Available companies:", availableCompanies);
    console.log("📝 OrderForm: Form companyId value:", data.companyId);
    console.log("📝 OrderForm: User profile:", userProfile);
    
    const validItems = data.items.filter(item => item.name.trim() && item.quantity > 0);
    
    if (validItems.length === 0) {
      console.log("❌ OrderForm: No valid items found");
      form.setError("items", { 
        type: "manual", 
        message: "Please add at least one valid item" 
      });
      return;
    }

    if (!data.orderNumber.trim()) {
      console.log("❌ OrderForm: Order number is missing");
      form.setError("orderNumber", { 
        type: "manual", 
        message: "Order number is required" 
      });
      return;
    }

    // Determine the final company ID to use
    let finalCompanyId = data.companyId;
    console.log("🏢 OrderForm: Initial companyId from form:", finalCompanyId);
    
    // For client users with single company, ensure company ID is set
    if (currentUserRole === 'user' && availableCompanies.length === 1) {
      if (!finalCompanyId) {
        finalCompanyId = availableCompanies[0].id;
        console.log("🔄 OrderForm: Auto-setting companyId for single company user:", finalCompanyId);
      }
    }

    if (!finalCompanyId) {
      console.log("❌ OrderForm: Final companyId is missing");
      console.log("❌ OrderForm: Debug info - role:", currentUserRole, "companies:", availableCompanies.length);
      form.setError("companyId", { 
        type: "manual", 
        message: "Please select a company" 
      });
      return;
    }

    const finalOrderData = {
      orderNumber: data.orderNumber,
      description: data.description,
      companyId: finalCompanyId,
      totalAmount: data.totalAmount,
      items: validItems
    };

    console.log("🚀 OrderForm: Submitting order with final data:", finalOrderData);
    console.log("🔍 OrderForm: Company details:", availableCompanies.find(c => c.id === finalCompanyId));
    console.log("🎯 OrderForm: Final companyId being passed:", finalOrderData.companyId);
    
    onSubmit(finalOrderData);
  };

  if (companiesLoading || isLoadingUserInfo) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="text-sm text-gray-600">Loading...</div>
      </div>
    );
  }

  console.log("🎨 OrderForm: Rendering form with:", {
    currentUserRole,
    availableCompanies: availableCompanies.length,
    userProfile: userProfile?.company_code,
    selectedCompanyId: form.watch('companyId'),
    allCompanies: companies.length,
    userCompanyId: userProfile?.company_id
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
                {/* Debug info display */}
                <div className="text-xs text-blue-600 bg-blue-50 p-2 rounded mb-2">
                  <div>Role: {currentUserRole}</div>
                  <div>Available companies: {availableCompanies.length}</div>
                  <div>Total companies: {companies.length}</div>
                  <div>User company_id: {userProfile?.company_id}</div>
                  <div>User company_code: {userProfile?.company_code}</div>
                </div>
                
                {currentUserRole === 'user' && availableCompanies.length === 1 ? (
                  // For client users with only one company, show it as confirmed
                  <div className="space-y-2">
                    <div className="p-4 bg-green-50 border border-green-200 rounded-md">
                      <div className="font-medium text-green-900">
                        ✅ {availableCompanies[0].name} ({availableCompanies[0].code})
                      </div>
                      <div className="text-sm text-green-700">
                        🔗 This order will be automatically linked to your company
                      </div>
                    </div>
                    <FormControl>
                      <Input 
                        type="hidden" 
                        {...field} 
                        value={availableCompanies[0].id}
                      />
                    </FormControl>
                  </div>
                ) : (
                  <Select 
                    value={field.value} 
                    onValueChange={field.onChange}
                  >
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
                )}
                <FormMessage />
                {currentUserRole === 'user' && availableCompanies.length === 0 && (
                  <div className="text-sm text-red-600 bg-red-50 p-3 rounded">
                    <div className="font-medium">No companies found matching your profile.</div>
                    <div className="text-xs mt-1">
                      Profile company_id: {userProfile?.company_id || 'None'}<br/>
                      Profile company_code: {userProfile?.company_code || 'None'}<br/>
                      Please contact an administrator to link your profile to a company.
                    </div>
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
            disabled={loading || companiesLoading || isLoadingUserInfo}
          >
            {loading ? "Creating Order..." : "Create Order"}
          </Button>
        </form>
      </Form>
    </div>
  );
};

export default OrderForm;
