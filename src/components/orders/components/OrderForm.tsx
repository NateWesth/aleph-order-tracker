
import { useState, useEffect } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Plus } from "lucide-react";
import { Form, FormMessage } from "@/components/ui/form";
import { generateOrderNumber } from "../utils/orderUtils";
import { useOrderFormData } from "../hooks/useOrderFormData";
import OrderFormHeader from "./OrderFormHeader";
import OrderFormDescription from "./OrderFormDescription";
import OrderFormCompanySelector from "./OrderFormCompanySelector";
import OrderFormTotalAmount from "./OrderFormTotalAmount";
import { OrderItemsForm } from "./OrderItemsForm";

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
  const {
    user,
    userProfile,
    availableCompanies,
    currentUserRole,
    isLoadingUserInfo,
    userCompany,
    companiesLoading
  } = useOrderFormData();

  const form = useForm<OrderFormData>({
    defaultValues: {
      orderNumber: "",
      description: "",
      companyId: "",
      totalAmount: 0,
      items: [{
        id: crypto.randomUUID(),
        name: "",
        quantity: 1,
        unit: "",
        notes: ""
      }]
    }
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "items"
  });

  // Auto-set company ID for client users
  useEffect(() => {
    if (currentUserRole === 'user' && userCompany) {
      form.setValue('companyId', userCompany.id, {
        shouldValidate: true,
        shouldDirty: true
      });
    }
  }, [currentUserRole, userCompany, form]);

  // Generate order number on component mount if empty
  useEffect(() => {
    if (!form.getValues('orderNumber')) {
      const newOrderNumber = generateOrderNumber();
      form.setValue('orderNumber', newOrderNumber);
    }
  }, [form]);

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
    console.log("📝 OrderForm: User company:", userCompany);
    console.log("📝 OrderForm: Selected companyId:", data.companyId);

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

    let finalCompanyId = data.companyId;

    // For admin users, ensure they selected a company
    if (currentUserRole === 'admin') {
      if (!finalCompanyId || finalCompanyId.trim() === '') {
        console.log("❌ OrderForm: Admin user must select a company");
        form.setError("companyId", {
          type: "manual",
          message: "Please select a company"
        });
        return;
      }
    }

    // For client users, auto-assign their company
    if (currentUserRole === 'user') {
      if (!finalCompanyId && userCompany) {
        finalCompanyId = userCompany.id;
      }
      if (!finalCompanyId) {
        console.log("❌ OrderForm: Client user has no associated company");
        form.setError("companyId", {
          type: "manual",
          message: "Your account is not linked to a company. Please contact an administrator."
        });
        return;
      }
    }

    if (!finalCompanyId) {
      console.log("❌ OrderForm: Final companyId is missing");
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
    onSubmit(finalOrderData);
  };

  if (companiesLoading || isLoadingUserInfo) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="text-sm text-gray-600">Loading...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Form {...form}>
        <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
          <OrderFormHeader 
            control={form.control} 
            setValue={form.setValue}
          />

          <OrderFormDescription control={form.control} />

          <OrderFormCompanySelector
            control={form.control}
            register={form.register}
            currentUserRole={currentUserRole}
            availableCompanies={availableCompanies}
            userCompany={userCompany}
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
                <OrderItemsForm
                  key={field.id}
                  control={form.control}
                  index={index}
                  onRemove={() => removeItem(index)}
                  canRemove={fields.length > 1}
                />
              ))}
              <FormMessage>{form.formState.errors.items?.message}</FormMessage>
            </CardContent>
          </Card>

          <OrderFormTotalAmount control={form.control} />

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
