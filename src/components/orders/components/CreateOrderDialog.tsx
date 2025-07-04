import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { PlusCircle } from "lucide-react";
import { v4 as uuidv4 } from 'uuid';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { sendOrderNotification } from "@/utils/emailNotifications";

const itemSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(2, {
    message: "Item name must be at least 2 characters.",
  }),
  quantity: z.coerce.number().min(1, {
    message: "Quantity must be at least 1.",
  }),
});

const formSchema = z.object({
  orderNumber: z.string().min(3, {
    message: "Order number must be at least 3 characters.",
  }),
  companyId: z.string().optional(),
  companyName: z.string().optional(),
  totalAmount: z.number().optional(),
  items: z.array(itemSchema).min(1, {
    message: "You must add at least one item.",
  }),
});

interface CreateOrderDialogProps {
  isAdmin: boolean;
  companies: any[];
  profiles: any[];
  userProfile: any;
  onOrderCreated?: () => void;
}

const CreateOrderDialog: React.FC<CreateOrderDialogProps> = ({
  isAdmin,
  companies,
  profiles,
  userProfile,
  onOrderCreated,
}) => {
  const { toast } = useToast();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      orderNumber: "",
      companyId: userProfile?.company_id || "",
      totalAmount: 0,
      items: [{ id: uuidv4(), name: "", quantity: 1 }],
    },
  });

  const handleAddItem = () => {
    form.setValue("items", [...form.getValues().items, { id: uuidv4(), name: "", quantity: 1 }]);
  };

  const handleRemoveItem = (id: string) => {
    form.setValue(
      "items",
      form.getValues().items.filter((item) => item.id !== id)
    );
  };

  const handleSubmit = async (values: z.infer<typeof formSchema>) => {
    if (!user?.id) {
      toast({
        title: "Error",
        description: "You must be logged in to create an order.",
        variant: "destructive",
      });
      return;
    }

    try {
      setIsSubmitting(true);
      
      // Format items for description
      const itemsDescription = values.items
        .map(item => `${item.name} (Qty: ${item.quantity})`)
        .join('\n');

      // Create the order
      const { data: newOrder, error } = await supabase
        .from('orders')
        .insert([
          {
            order_number: values.orderNumber,
            description: itemsDescription,
            status: 'pending',
            company_id: values.companyId || null,
            user_id: user.id,
            total_amount: values.totalAmount || null,
          }
        ])
        .select('*, companies(name)')
        .single();

      if (error) throw error;

      // Send email notification for new order
      try {
        await sendOrderNotification({
          orderId: newOrder.id,
          orderNumber: newOrder.order_number,
          companyName: newOrder.companies?.name || values.companyName || 'Unknown Company',
          changeType: 'created',
          newStatus: 'pending',
          description: itemsDescription
        });
      } catch (emailError) {
        console.error('Failed to send email notification:', emailError);
        // Don't fail the entire operation if email fails
      }

      toast({
        title: "Success",
        description: "Order created successfully!",
      });

      form.reset();
      setOpen(false);
      onOrderCreated?.();
    } catch (error: any) {
      console.error('Error creating order:', error);
      toast({
        title: "Error",
        description: "Failed to create order. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <PlusCircle className="mr-2 h-4 w-4" />
          Create Order
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[625px]">
        <DialogHeader>
          <DialogTitle>Create New Order</DialogTitle>
          <DialogDescription>
            Create a new order in the system.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="orderNumber"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Order Number</FormLabel>
                  <FormControl>
                    <Input placeholder="Order Number" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            {isAdmin && (
              <FormField
                control={form.control}
                name="companyId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Company</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select a company" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {companies.map((company) => (
                          <SelectItem key={company.id} value={company.id}>
                            {company.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}
            {!isAdmin && (
              <FormField
                control={form.control}
                name="companyName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Company Name</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="Company Name"
                        {...field}
                        disabled={true}
                        defaultValue={userProfile?.company?.name || "N/A"}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}
            <FormField
              control={form.control}
              name="totalAmount"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Total Amount</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="Total Amount"
                      type="number"
                      {...field}
                      onChange={(e) => field.onChange(Number(e.target.value))}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div>
              <FormLabel>Items</FormLabel>
              {form.getValues().items.map((item, index) => (
                <div key={item.id} className="flex space-x-2 mb-2">
                  <FormField
                    control={form.control}
                    name={`items.${index}.name`}
                    render={({ field }) => (
                      <FormItem className="w-1/2">
                        <FormLabel>Item Name</FormLabel>
                        <FormControl>
                          <Input placeholder="Item Name" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name={`items.${index}.quantity`}
                    render={({ field }) => (
                      <FormItem className="w-1/4">
                        <FormLabel>Quantity</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            placeholder="Quantity"
                            {...field}
                            onChange={(e) => field.onChange(Number(e.target.value))}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    onClick={() => handleRemoveItem(item.id || '')}
                  >
                    Remove
                  </Button>
                </div>
              ))}
              <Button type="button" variant="secondary" size="sm" onClick={handleAddItem}>
                Add Item
              </Button>
            </div>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Creating..." : "Create Order"}
            </Button>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};

export default CreateOrderDialog;
