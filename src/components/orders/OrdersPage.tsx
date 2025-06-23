import { useState, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import OrdersHeader from "./components/OrdersHeader";
import OrderTable from "./components/OrderTable";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface OrdersPageProps {
  isAdmin?: boolean;
}

interface Order {
  id: string;
  order_number: string;
  description: string | null;
  status: string | null;
  total_amount: number | null;
  created_at: string;
  company_id: string | null;
  user_id: string | null;
}

interface Company {
  id: string;
  name: string;
  code: string;
}

interface Profile {
  id: string;
  full_name: string;
  email: string;
  company_id: string;
}

export default function OrdersPage({ isAdmin = false }: OrdersPageProps) {
  const { toast } = useToast();
  const { user } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [newOrder, setNewOrder] = useState({
    order_number: '',
    description: '',
    total_amount: '',
    company_id: '',
    user_id: ''
  });

  useEffect(() => {
    fetchOrders();
    if (isAdmin) {
      fetchCompanies();
      fetchProfiles();
    }
  }, [isAdmin]);

  const fetchOrders = async () => {
    try {
      const { data, error } = await supabase
        .from('orders')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setOrders(data || []);
    } catch (error: any) {
      toast({
        title: "Error",
        description: "Failed to fetch orders: " + error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchCompanies = async () => {
    try {
      const { data, error } = await supabase
        .from('companies')
        .select('id, name, code')
        .order('name');

      if (error) throw error;
      setCompanies(data || []);
    } catch (error: any) {
      console.error('Error fetching companies:', error);
    }
  };

  const fetchProfiles = async () => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, email, company_id')
        .order('full_name');

      if (error) throw error;
      setProfiles(data || []);
    } catch (error: any) {
      console.error('Error fetching profiles:', error);
    }
  };

  const generateOrderNumber = () => {
    const date = new Date();
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
    return `ORD-${year}${month}${day}-${random}`;
  };

  const createOrder = async () => {
    if (!newOrder.order_number || !newOrder.description) {
      toast({
        title: "Error",
        description: "Please fill in all required fields.",
        variant: "destructive",
      });
      return;
    }

    try {
      const orderData = {
        order_number: newOrder.order_number,
        description: newOrder.description,
        total_amount: newOrder.total_amount ? parseFloat(newOrder.total_amount) : null,
        status: 'pending',
        company_id: newOrder.company_id || null,
        user_id: isAdmin ? (newOrder.user_id || null) : user?.id
      };

      const { error } = await supabase
        .from('orders')
        .insert([orderData]);

      if (error) throw error;

      toast({
        title: "Order Created",
        description: `Order ${newOrder.order_number} has been created successfully.`,
      });

      setShowCreateDialog(false);
      setNewOrder({
        order_number: '',
        description: '',
        total_amount: '',
        company_id: '',
        user_id: ''
      });
      fetchOrders();
    } catch (error: any) {
      toast({
        title: "Error",
        description: "Failed to create order: " + error.message,
        variant: "destructive",
      });
    }
  };

  const deleteOrder = async (orderId: string, orderNumber: string) => {
    try {
      const { error } = await supabase
        .from('orders')
        .delete()
        .eq('id', orderId);

      if (error) throw error;

      setOrders(orders.filter(order => order.id !== orderId));

      toast({
        title: "Order Deleted",
        description: `Order ${orderNumber} has been successfully deleted.`,
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: "Failed to delete order: " + error.message,
        variant: "destructive",
      });
    }
  };

  const receiveOrder = async (order: Order) => {
    try {
      const { error } = await supabase
        .from('orders')
        .update({ status: 'received' })
        .eq('id', order.id);

      if (error) throw error;

      const progressOrder = {
        id: order.id,
        orderNumber: order.order_number,
        companyName: "Company Name",
        orderDate: new Date(order.created_at),
        dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        status: 'received' as const,
        progress: 0,
        progressStage: 'awaiting-stock' as const,
        items: [
          {
            id: "1",
            name: order.description || "Order items",
            quantity: 1,
            delivered: 0,
            completed: false
          }
        ]
      };

      const existingProgressOrders = JSON.parse(localStorage.getItem('progressOrders') || '[]');
      const updatedProgressOrders = [...existingProgressOrders, progressOrder];
      localStorage.setItem('progressOrders', JSON.stringify(updatedProgressOrders));

      const existingDeliveryOrders = JSON.parse(localStorage.getItem('deliveryOrders') || '[]');
      const updatedDeliveryOrders = [...existingDeliveryOrders, progressOrder];
      localStorage.setItem('deliveryOrders', JSON.stringify(updatedDeliveryOrders));

      setOrders(orders.map(o => o.id === order.id ? { ...o, status: 'received' } : o));

      toast({
        title: "Order Received",
        description: `Order ${order.order_number} has been moved to progress tracking.`,
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: "Failed to receive order: " + error.message,
        variant: "destructive",
      });
    }
  };

  const filteredOrders = orders.filter(order =>
    order.order_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
    order.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    order.status?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getCompanyProfiles = (companyId: string) => {
    return profiles.filter(profile => profile.company_id === companyId);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-lg">Loading orders...</div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6">
      <div className="flex justify-between items-center mb-6">
        <OrdersHeader searchTerm={searchTerm} onSearchChange={setSearchTerm} />
        {isAdmin && (
          <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Create Order
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Create New Order</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label htmlFor="order_number">Order Number</Label>
                  <div className="flex gap-2">
                    <Input
                      id="order_number"
                      value={newOrder.order_number}
                      onChange={(e) => setNewOrder({ ...newOrder, order_number: e.target.value })}
                      placeholder="Enter order number"
                    />
                    <Button 
                      type="button" 
                      variant="outline"
                      onClick={() => setNewOrder({ ...newOrder, order_number: generateOrderNumber() })}
                    >
                      Generate
                    </Button>
                  </div>
                </div>

                <div>
                  <Label htmlFor="description">Description *</Label>
                  <Textarea
                    id="description"
                    value={newOrder.description}
                    onChange={(e) => setNewOrder({ ...newOrder, description: e.target.value })}
                    placeholder="Enter order description"
                    required
                  />
                </div>

                <div>
                  <Label htmlFor="total_amount">Total Amount</Label>
                  <Input
                    id="total_amount"
                    type="number"
                    step="0.01"
                    value={newOrder.total_amount}
                    onChange={(e) => setNewOrder({ ...newOrder, total_amount: e.target.value })}
                    placeholder="Enter total amount"
                  />
                </div>

                <div>
                  <Label htmlFor="company">Company</Label>
                  <Select
                    value={newOrder.company_id}
                    onValueChange={(value) => setNewOrder({ ...newOrder, company_id: value, user_id: '' })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select company (optional)" />
                    </SelectTrigger>
                    <SelectContent>
                      {companies.map((company) => (
                        <SelectItem key={company.id} value={company.id}>
                          {company.name} ({company.code})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {newOrder.company_id && (
                  <div>
                    <Label htmlFor="user">Client User</Label>
                    <Select
                      value={newOrder.user_id}
                      onValueChange={(value) => setNewOrder({ ...newOrder, user_id: value })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select client user (optional)" />
                      </SelectTrigger>
                      <SelectContent>
                        {getCompanyProfiles(newOrder.company_id).map((profile) => (
                          <SelectItem key={profile.id} value={profile.id}>
                            {profile.full_name} ({profile.email})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
                    Cancel
                  </Button>
                  <Button onClick={createOrder}>
                    Create Order
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        )}
      </div>
      
      <OrderTable 
        orders={filteredOrders}
        isAdmin={isAdmin}
        onReceiveOrder={receiveOrder}
        onDeleteOrder={deleteOrder}
      />
      <div className="mt-4 text-sm text-gray-600 dark:text-gray-400">
        Total orders: {filteredOrders.length}
      </div>
    </div>
  );
}
