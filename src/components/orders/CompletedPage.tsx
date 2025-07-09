import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { format, startOfMonth, endOfMonth, isSameMonth } from "date-fns";
import { Eye, ChevronDown, ChevronRight, FileText, Search, Trash2, Download } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useGlobalRealtimeOrders } from "./hooks/useGlobalRealtimeOrders";
import ProcessingOrderFilesDialog from "./components/ProcessingOrderFilesDialog";
import OrderDetailsDialog from "./components/OrderDetailsDialog";
import OrderExportActions from "./components/OrderExportActions";
import { getUserRole, getUserProfile } from "@/utils/authService";

interface OrderItem {
  id: string;
  name: string;
  quantity: number;
  delivered: number;
  completed: boolean;
}
interface Order {
  id: string;
  orderNumber: string;
  companyName: string;
  orderDate: Date;
  dueDate: Date;
  completedDate?: Date;
  items: OrderItem[];
  status: 'completed';
}
interface CompletedPageProps {
  isAdmin: boolean;
}
interface MonthGroup {
  month: string;
  orders: Order[];
  isOpen: boolean;
}
export default function CompletedPage({
  isAdmin
}: CompletedPageProps) {
  const {
    toast
  } = useToast();
  const {
    user
  } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [selectedOrder, setSelectedOrder] = useState<any>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [monthGroups, setMonthGroups] = useState<MonthGroup[]>([]);
  const [showFilesDialog, setShowFilesDialog] = useState(false);
  const [filesDialogOrder, setFilesDialogOrder] = useState<Order | null>(null);
  const [showOrderDetails, setShowOrderDetails] = useState(false);
  const [expandedOrders, setExpandedOrders] = useState<Set<string>>(new Set());
  const [userRole, setUserRole] = useState<'admin' | 'user'>('user');
  const [userCompanyId, setUserCompanyId] = useState<string | null>(null);

  // Parse order items from description - same logic as other components
  const parseOrderItems = (description: string | null): OrderItem[] => {
    if (!description) {
      return [];
    }
    const items = description.split('\n').map((line, index) => {
      const match = line.match(/^(.+?)\s*\(Qty:\s*(\d+)\)$/);
      if (match) {
        return {
          id: `item-${index}`,
          name: match[1].trim(),
          quantity: parseInt(match[2]),
          delivered: parseInt(match[2]),
          // Completed orders are fully delivered
          completed: true
        };
      }
      return {
        id: `item-${index}`,
        name: line.trim(),
        quantity: 1,
        delivered: 1,
        completed: true
      };
    }).filter(item => item.name);
    return items;
  };

  // Fetch user info to determine filtering
  const fetchUserInfo = async () => {
    if (!user?.id) return;

    try {
      const [role, profile] = await Promise.all([
        getUserRole(user.id),
        getUserProfile(user.id)
      ]);

      console.log('CompletedPage - User role:', role);
      console.log('CompletedPage - User profile:', profile);

      setUserRole(role);
      if (role === 'user' && profile?.company_id) {
        setUserCompanyId(profile.company_id);
        console.log('CompletedPage - User company ID:', profile.company_id);
      }
    } catch (error) {
      console.error("Error fetching user info:", error);
    }
  };

  // Fetch company details for orders
  const fetchCompanyDetails = async (companyId: string) => {
    try {
      const { data } = await supabase
        .from('companies')
        .select('name, address, phone, email, contact_person')
        .eq('id', companyId)
        .single();
      
      return data ? {
        name: data.name,
        address: data.address || '',
        phone: data.phone || '',
        email: data.email || '',
        contactPerson: data.contact_person || ''
      } : null;
    } catch (error) {
      console.error('Error fetching company details:', error);
      return null;
    }
  };

  // Toggle order expansion
  const toggleOrderExpansion = (orderId: string) => {
    setExpandedOrders(prev => {
      const newSet = new Set(prev);
      if (newSet.has(orderId)) {
        newSet.delete(orderId);
      } else {
        newSet.add(orderId);
      }
      return newSet;
    });
  };

  // Fetch completed orders from database with company information
  const fetchCompletedOrders = async () => {
    if (!user?.id) return;
    
    try {
      console.log('Fetching completed orders from Supabase...');
      console.log('User role:', userRole, 'Company ID:', userCompanyId);
      
      let query = supabase.from('orders').select(`
          *,
          companies (
            name,
            code
          )
        `).eq('status', 'completed').order('completed_date', {
        ascending: false
      });

      // Apply filtering based on user role
      if (userRole === 'user' && userCompanyId) {
        console.log('Filtering completed orders by company:', userCompanyId);
        query = query.eq('company_id', userCompanyId);
      } else if (userRole === 'user' && !userCompanyId) {
        // If user role but no company ID, filter by user_id as fallback
        console.log('Filtering completed orders by user_id as fallback');
        query = query.eq('user_id', user.id);
      }
      // For admin users, no additional filtering is needed

      const {
        data,
        error
      } = await query;
      
      if (error) {
        console.error("Error fetching completed orders:", error);
        return;
      }
      
      console.log('Fetched completed orders:', data?.length || 0);
      
      const transformedOrders = (data || []).map(order => ({
        id: order.id,
        orderNumber: order.order_number,
        companyName: order.companies?.name || "Unknown Company",
        orderDate: new Date(order.created_at),
        dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        completedDate: order.completed_date ? new Date(order.completed_date) : new Date(),
        status: 'completed' as const,
        items: parseOrderItems(order.description)
      }));
      
      setOrders(transformedOrders);
    } catch (error) {
      console.error("Failed to fetch completed orders:", error);
    }
  };

  // Add delete order functionality
  const handleDeleteOrder = async (orderId: string, orderNumber: string) => {
    if (!isAdmin) {
      toast({
        title: "Access Denied",
        description: "Only administrators can delete orders.",
        variant: "destructive",
      });
      return;
    }

    try {
      const { error } = await supabase
        .from('orders')
        .delete()
        .eq('id', orderId);

      if (error) throw error;

      // Remove from local state
      setOrders(prev => prev.filter(order => order.id !== orderId));

      toast({
        title: "Order Deleted",
        description: `Order ${orderNumber} has been successfully deleted.`,
      });
    } catch (error: any) {
      console.error("Error deleting order:", error);
      toast({
        title: "Error",
        description: "Failed to delete order: " + error.message,
        variant: "destructive",
      });
    }
  };

  // Set up real-time subscriptions
  useGlobalRealtimeOrders({
    onOrdersChange: () => {
      console.log('Real-time update detected, refreshing completed orders...');
      fetchCompletedOrders();
    },
    isAdmin,
    pageType: 'completed'
  });

  // Load user info first, then orders
  useEffect(() => {
    if (user?.id) {
      fetchUserInfo();
    }
  }, [user?.id]);

  // Load orders when user info is available
  useEffect(() => {
    if (user?.id && (userRole === 'admin' || userCompanyId !== null)) {
      console.log('Loading completed orders...');
      fetchCompletedOrders();
    }
  }, [user?.id, userRole, userCompanyId]);

  // Group orders by completion month
  useEffect(() => {
    const filteredOrders = orders.filter(order => order.orderNumber.toLowerCase().includes(searchTerm.toLowerCase()) || order.companyName.toLowerCase().includes(searchTerm.toLowerCase()));
    const monthMap = new Map<string, Order[]>();
    filteredOrders.forEach(order => {
      const completionDate = order.completedDate || order.orderDate;
      const monthKey = format(completionDate, 'MMMM yyyy');
      if (!monthMap.has(monthKey)) {
        monthMap.set(monthKey, []);
      }
      monthMap.get(monthKey)!.push(order);
    });
    const groups: MonthGroup[] = Array.from(monthMap.entries()).map(([month, orders]) => ({
      month,
      orders: orders.sort((a, b) => (b.completedDate || b.orderDate).getTime() - (a.completedDate || a.orderDate).getTime()),
      isOpen: true
    })).sort((a, b) => {
      const dateA = new Date(a.month);
      const dateB = new Date(b.month);
      return dateB.getTime() - dateA.getTime();
    });
    setMonthGroups(groups);
  }, [orders, searchTerm]);

  // Toggle month group
  const toggleMonthGroup = (monthIndex: number) => {
    setMonthGroups(prev => prev.map((group, index) => index === monthIndex ? {
      ...group,
      isOpen: !group.isOpen
    } : group));
  };

  // View order details - now properly parses items like other pages
  const viewOrderDetails = (order: Order) => {
    const fetchOrderForDetails = async () => {
      try {
        const {
          data
        } = await supabase.from('orders').select(`
            *,
            companies (
              name,
              code
            )
          `).eq('id', order.id).single();
        if (data) {
          const parsedItems = parseOrderItems(data.description);
          setSelectedOrder({
            ...data,
            companyName: data.companies?.name || "Unknown Company",
            items: parsedItems
          });
          setShowOrderDetails(true);
        }
      } catch (error) {
        console.error('Error fetching order details:', error);
      }
    };
    fetchOrderForDetails();
  };
  const closeOrderDetails = () => {
    setShowOrderDetails(false);
    setSelectedOrder(null);
  };
  const openFilesDialog = (order: Order) => {
    setFilesDialogOrder(order);
    setShowFilesDialog(true);
  };
  const closeFilesDialog = () => {
    setShowFilesDialog(false);
    setFilesDialogOrder(null);
  };
  return <div className="container mx-auto p-4 bg-background">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-foreground">Completed Orders</h1>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input type="text" placeholder="Search orders..." className="pl-10 pr-4 py-2 border border-border rounded-md bg-card text-card-foreground" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
        </div>
      </div>

      <div className="space-y-4">
        {monthGroups.length === 0 && <div className="bg-card rounded-lg shadow p-8 text-center text-muted-foreground">
            No completed orders found.
          </div>}

        {monthGroups.map((monthGroup, monthIndex) => <div key={monthGroup.month} className="bg-card rounded-lg shadow">
            <Collapsible open={monthGroup.isOpen} onOpenChange={() => toggleMonthGroup(monthIndex)}>
              <CollapsibleTrigger asChild>
                <div className="p-4 border-b border-border cursor-pointer hover:bg-accent flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    {monthGroup.isOpen ? <ChevronDown className="h-4 w-4 text-foreground" /> : <ChevronRight className="h-4 w-4 text-foreground" />}
                    <h2 className="text-lg font-semibold text-card-foreground">{monthGroup.month}</h2>
                    <Badge variant="outline">{monthGroup.orders.length} orders</Badge>
                  </div>
                </div>
              </CollapsibleTrigger>
              
              <CollapsibleContent>
                <div className="divide-y divide-border">
                  {monthGroup.orders.map(order => {
                const isExpanded = expandedOrders.has(order.id);
                return <div key={order.id} className="p-4">
                        <div className="flex justify-between items-center">
                          <div className="flex items-center gap-4">
                            <div>
                              <h3 className="font-medium text-card-foreground">Order #{order.orderNumber}</h3>
                              <p className="text-sm text-muted-foreground">{order.companyName}</p>
                              <p className="text-sm text-muted-foreground">
                                Completed: {format(order.completedDate || order.orderDate, 'MMM d, yyyy')}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center space-x-2">
                            <Button variant="ghost" size="sm" onClick={() => toggleOrderExpansion(order.id)}>
                              {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                              Items ({order.items.length})
                            </Button>
                            
                            <Badge variant="outline" className="bg-green-100 text-green-800">
                              Completed
                            </Badge>
                            
                            <OrderExportActions 
                              order={{
                                id: order.id,
                                order_number: order.orderNumber,
                                description: order.items.map(item => `${item.name} (Qty: ${item.quantity})`).join('\n'),
                                status: order.status,
                                total_amount: null,
                                created_at: order.orderDate.toISOString(),
                                updated_at: order.orderDate.toISOString(),
                                company_id: null,
                                companyName: order.companyName,
                                items: order.items.map(item => ({
                                  id: item.id,
                                  name: item.name,
                                  quantity: item.quantity,
                                  notes: undefined
                                }))
                              }}
                            />
                            
                            <Button variant="outline" size="sm" onClick={() => openFilesDialog(order)}>
                              <FileText className="h-4 w-4 mr-2" />
                              Files
                            </Button>
                            <Button variant="outline" size="sm" onClick={() => viewOrderDetails(order)}>
                              <Eye className="h-4 w-4 mr-2" />
                              View Details
                            </Button>
                            {isAdmin && (
                              <AlertDialog>
                                <AlertDialogTrigger asChild>
                                  <Button variant="outline" size="sm" className="text-red-600 hover:text-red-700">
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                  <AlertDialogHeader>
                                    <AlertDialogTitle>Delete Completed Order</AlertDialogTitle>
                                    <AlertDialogDescription>
                                      Are you sure you want to delete completed order #{order.orderNumber}? This action cannot be undone and will permanently remove the order from all systems.
                                    </AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                                    <AlertDialogAction 
                                      onClick={() => handleDeleteOrder(order.id, order.orderNumber)}
                                      className="bg-red-600 hover:bg-red-700"
                                    >
                                      Delete
                                    </AlertDialogAction>
                                  </AlertDialogFooter>
                                </AlertDialogContent>
                              </AlertDialog>
                            )}
                          </div>
                        </div>

                        {isExpanded && <div className="mt-4 border-t border-border pt-4">
                            <Table>
                              <TableHeader>
                                <TableRow>
                                  <TableHead className="text-card-foreground">Item</TableHead>
                                  <TableHead className="text-card-foreground">Quantity Ordered</TableHead>
                                  <TableHead className="text-card-foreground">Quantity Delivered</TableHead>
                                  <TableHead className="text-card-foreground">Status</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {order.items.map(item => <TableRow key={item.id}>
                                    <TableCell className="font-medium text-card-foreground">{item.name}</TableCell>
                                    <TableCell className="text-card-foreground">{item.quantity}</TableCell>
                                    <TableCell className="text-card-foreground">{item.delivered}</TableCell>
                                    <TableCell>
                                      <Badge variant="outline" className="bg-green-100 text-green-800">
                                        Complete
                                      </Badge>
                                    </TableCell>
                                  </TableRow>)}
                              </TableBody>
                            </Table>
                          </div>}
                      </div>;
              })}
                </div>
              </CollapsibleContent>
            </Collapsible>
          </div>)}
      </div>

      {selectedOrder && <OrderDetailsDialog 
        open={showOrderDetails} 
        onOpenChange={closeOrderDetails} 
        order={selectedOrder} 
      />}

      <ProcessingOrderFilesDialog order={filesDialogOrder} isOpen={showFilesDialog} onClose={closeFilesDialog} isAdmin={isAdmin} />
    </div>;
}
