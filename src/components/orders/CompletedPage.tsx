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
import { Eye, ChevronDown, ChevronRight, FileText, Search, Trash2, Download, Edit, Mail } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useGlobalRealtimeOrders } from "./hooks/useGlobalRealtimeOrders";
import ProcessingOrderFilesDialog from "./components/ProcessingOrderFilesDialog";
import OrderDetailsDialog from "./components/OrderDetailsDialog";
import CompletedOrderEditDialog from "./components/CompletedOrderEditDialog";
import CompletedOrderEmailDialog from "./components/CompletedOrderEmailDialog";
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
  reference?: string;
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
  const [showEditOrderDetails, setShowEditOrderDetails] = useState(false);
  const [editOrderData, setEditOrderData] = useState<any>(null);
  const [expandedOrders, setExpandedOrders] = useState<Set<string>>(new Set());
  const [userRole, setUserRole] = useState<'admin' | 'user'>('user');
  const [userCompanyId, setUserCompanyId] = useState<string | null>(null);
  const [showEmailDialog, setShowEmailDialog] = useState(false);
  const [emailDialogOrder, setEmailDialogOrder] = useState<any>(null);

  // Parse order items from description - enhanced to handle delivered quantities and completion status
  const parseOrderItems = (description: string | null): OrderItem[] => {
    if (!description) {
      return [];
    }
    const items = description.split('\n').map((line, index) => {
      // First try the enhanced format with delivered and status info
      const enhancedMatch = line.match(/^(.+?)\s*\(Qty:\s*(\d+)\)(?:\s*\[Delivered:\s*(\d+)\])?(?:\s*\[Status:\s*(completed|pending)\])?/);
      if (enhancedMatch) {
        return {
          id: `item-${index}`,
          name: enhancedMatch[1].trim(),
          quantity: parseInt(enhancedMatch[2]),
          delivered: enhancedMatch[3] ? parseInt(enhancedMatch[3]) : parseInt(enhancedMatch[2]), // For completed orders, default to full quantity
          completed: true // Completed orders are fully delivered
        };
      }
      
      // Fallback to basic format
      const basicMatch = line.match(/^(.+?)\s*\(Qty:\s*(\d+)\)$/);
      if (basicMatch) {
        return {
          id: `item-${index}`,
          name: basicMatch[1].trim(),
          quantity: parseInt(basicMatch[2]),
          delivered: parseInt(basicMatch[2]), // For completed orders, assume fully delivered
          completed: true
        };
      }
      
      // Fallback for items without quantity format
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
        `).eq('status', 'completed').order('order_number', {
        ascending: true
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
        reference: order.reference,
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

  // Group orders by order creation month (not completion month) using UTC to avoid TZ shifts
  useEffect(() => {
    const filteredOrders = orders.filter(order =>
      order.orderNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
      order.companyName.toLowerCase().includes(searchTerm.toLowerCase())
    );

    // Key by YYYY-MM (UTC) to ensure correct month grouping regardless of local timezone
    const monthMap = new Map<string, Order[]>();
    filteredOrders.forEach(order => {
      const y = order.orderDate.getUTCFullYear();
      const m = order.orderDate.getUTCMonth(); // 0-11
      const key = `${y}-${String(m + 1).padStart(2, '0')}`;
      if (!monthMap.has(key)) monthMap.set(key, []);
      monthMap.get(key)!.push(order);
    });

    const groups: MonthGroup[] = Array.from(monthMap.entries())
      // Sort months descending (newest first) using the YYYY-MM key
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([key, groupedOrders]) => {
        const [yy, mm] = key.split('-');
        const monthDate = new Date(Date.UTC(Number(yy), Number(mm) - 1, 1));
        return {
          month: format(monthDate, 'MMMM yyyy'),
          // Within each month sort by creation date descending (newest first)
          orders: groupedOrders.sort((a, b) => b.orderDate.getTime() - a.orderDate.getTime()),
          isOpen: true,
        } as MonthGroup;
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
  
  // Edit order details - for admins only
  const editOrderDetails = (order: Order) => {
    const fetchOrderForEdit = async () => {
      try {
        const { data } = await supabase.from('orders').select(`
            *,
            companies (
              name,
              code
            )
          `).eq('id', order.id).single();
        if (data) {
          setEditOrderData({
            ...data,
            companyName: data.companies?.name || "Unknown Company"
          });
          setShowEditOrderDetails(true);
        }
      } catch (error) {
        console.error('Error fetching order for edit:', error);
      }
    };
    fetchOrderForEdit();
  };
  const closeEditOrderDetails = () => {
    setShowEditOrderDetails(false);
    setEditOrderData(null);
    // Refresh orders after edit
    fetchCompletedOrders();
  };
  
  const openFilesDialog = (order: Order) => {
    setFilesDialogOrder(order);
    setShowFilesDialog(true);
  };
  const closeFilesDialog = () => {
    setShowFilesDialog(false);
    setFilesDialogOrder(null);
  };

  // Email dialog functions
  const openEmailDialog = async (order: Order) => {
    // Fetch the full order data with company_id
    try {
      const { data } = await supabase
        .from('orders')
        .select('id, order_number, company_id, companies(name)')
        .eq('id', order.id)
        .single();
      
      if (data) {
        setEmailDialogOrder({
          id: data.id,
          orderNumber: data.order_number,
          companyName: data.companies?.name || order.companyName,
          company_id: data.company_id
        });
        setShowEmailDialog(true);
      }
    } catch (error) {
      console.error('Error fetching order for email:', error);
      toast({
        title: "Error",
        description: "Failed to load order data for email",
        variant: "destructive",
      });
    }
  };
  
  const closeEmailDialog = () => {
    setShowEmailDialog(false);
    setEmailDialogOrder(null);
  };
  return <div className="w-full max-w-full p-2 md:p-4 bg-background overflow-x-hidden">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-4 md:mb-6 gap-3 md:gap-0">
        <h1 className="text-lg md:text-2xl font-bold text-foreground">Completed Orders</h1>
        <div className="relative w-full md:w-auto">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input 
            type="text" 
            placeholder="Search orders..." 
            className="pl-10 pr-4 py-2 border border-border rounded-md bg-card text-card-foreground w-full md:w-64" 
            value={searchTerm} 
            onChange={e => setSearchTerm(e.target.value)} 
          />
        </div>
      </div>

      <div className="space-y-2 md:space-y-4 w-full max-w-full overflow-x-hidden">
        {monthGroups.length === 0 && <div className="bg-card rounded-lg shadow p-4 md:p-8 text-center text-muted-foreground">
            No completed orders found.
          </div>}

        {monthGroups.map((monthGroup, monthIndex) => <div key={monthGroup.month} className="bg-card rounded-lg shadow w-full max-w-full overflow-x-hidden">
            <Collapsible open={monthGroup.isOpen} onOpenChange={() => toggleMonthGroup(monthIndex)}>
              <CollapsibleTrigger asChild>
                <div className="p-2 md:p-4 border-b border-border cursor-pointer hover:bg-accent flex items-center justify-between">
                  <div className="flex items-center space-x-1 md:space-x-2">
                    {monthGroup.isOpen ? <ChevronDown className="h-4 w-4 text-foreground flex-shrink-0" /> : <ChevronRight className="h-4 w-4 text-foreground flex-shrink-0" />}
                    <h2 className="text-sm md:text-lg font-semibold text-card-foreground truncate">{monthGroup.month}</h2>
                    <Badge variant="outline" className="text-xs">{monthGroup.orders.length}</Badge>
                  </div>
                </div>
              </CollapsibleTrigger>
              
              <CollapsibleContent>
                <div className="divide-y divide-border">
                  {monthGroup.orders.map(order => {
                const isExpanded = expandedOrders.has(order.id);
                return <div key={order.id} className="p-2 md:p-4 w-full max-w-full overflow-x-hidden">
                        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-2 md:gap-0">
                          <div className="flex-1 min-w-0 w-full">
                            <div className="w-full">
                              <h3 className="font-medium text-card-foreground text-sm md:text-base truncate">Order #{order.orderNumber}</h3>
                              {order.reference && (
                                <p className="text-xs md:text-sm text-muted-foreground truncate">{order.reference}</p>
                              )}
                              <p className="text-xs md:text-sm text-muted-foreground truncate">{order.companyName}</p>
                              <p className="text-xs md:text-sm text-muted-foreground">
                                Completed: {format(order.completedDate || order.orderDate, 'MMM d, yyyy')}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center space-x-1 md:space-x-2 flex-wrap gap-1 w-full md:w-auto justify-start md:justify-end">
                            <Button variant="ghost" size="sm" onClick={() => toggleOrderExpansion(order.id)} className="text-xs md:text-sm h-8">
                              {isExpanded ? <ChevronDown className="h-3 w-3 md:h-4 md:w-4" /> : <ChevronRight className="h-3 w-3 md:h-4 md:w-4" />}
                              <span className="hidden sm:inline">Items ({order.items.length})</span>
                              <span className="sm:hidden">({order.items.length})</span>
                            </Button>
                            
                            <Badge variant="outline" className="bg-green-100 text-green-800 text-xs">
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
                            {isAdmin && (
                              <Button variant="outline" size="sm" onClick={() => openEmailDialog(order)}>
                                <Mail className="h-4 w-4 mr-2" />
                                Email
                              </Button>
                            )}
                             <Button variant="outline" size="sm" onClick={() => viewOrderDetails(order)}>
                               <Eye className="h-4 w-4 mr-2" />
                               View Details
                             </Button>
                             {isAdmin && (
                               <Button variant="outline" size="sm" onClick={() => editOrderDetails(order)}>
                                 <Edit className="h-4 w-4 mr-2" />
                                 Edit Details
                               </Button>
                             )}
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
        isAdmin={isAdmin}
      />}

      <CompletedOrderEditDialog 
        order={editOrderData} 
        isOpen={showEditOrderDetails} 
        onClose={closeEditOrderDetails} 
        isAdmin={isAdmin} 
      />

      <ProcessingOrderFilesDialog order={filesDialogOrder} isOpen={showFilesDialog} onClose={closeFilesDialog} isAdmin={isAdmin} />
      
      <CompletedOrderEmailDialog 
        isOpen={showEmailDialog} 
        onClose={closeEmailDialog} 
        order={emailDialogOrder} 
      />
    </div>;
}
