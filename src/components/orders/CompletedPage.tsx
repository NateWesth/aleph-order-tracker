import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { format } from "date-fns";
import { File, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useGlobalRealtimeOrders } from "./hooks/useGlobalRealtimeOrders";

// Define the order item interface
interface OrderItem {
  id: string;
  name: string;
  quantity: number;
  delivered?: number;
  completed: boolean;
}

// Define the order file interface
interface OrderFile {
  id: string;
  name: string;
  url: string;
  type: 'invoice' | 'quote' | 'purchase-order' | 'proof-of-payment';
  uploadedBy: 'admin' | 'client';
  uploadDate: Date;
}

// Define the order interface
interface Order {
  id: string;
  orderNumber: string;
  companyName: string;
  orderDate: Date;
  dueDate: Date;
  items: OrderItem[];
  files: OrderFile[];
  status: 'pending' | 'received' | 'in-progress' | 'processing' | 'completed';
  completedDate?: Date;
}

interface CompletedPageProps {
  isAdmin: boolean;
}

export default function CompletedPage({ isAdmin }: CompletedPageProps) {
  const { toast } = useToast();
  const { user } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [supabaseOrders, setSupabaseOrders] = useState<any[]>([]);

  // Fetch orders from database
  const fetchSupabaseOrders = async () => {
    if (!user?.id) return;

    try {
      let query = supabase
        .from('orders')
        .select('*')
        .eq('status', 'completed')
        .order('created_at', { ascending: false });

      // If user is admin, fetch all orders; otherwise, fetch only user's orders
      if (!isAdmin) {
        query = query.eq('user_id', user.id);
      }

      const { data, error } = await query;

      if (error) {
        console.error("Error fetching completed orders:", error);
        return;
      }

      setSupabaseOrders(data || []);
    } catch (error) {
      console.error("Failed to fetch completed orders:", error);
    }
  };

  // Set up real-time subscriptions
  useGlobalRealtimeOrders({
    onOrdersChange: fetchSupabaseOrders,
    isAdmin,
    pageType: 'completed'
  });

  useEffect(() => {
    const storedCompletedOrders = JSON.parse(localStorage.getItem('completedOrders') || '[]');
    
    // Filter orders based on admin status
    let filteredOrders = storedCompletedOrders;
    if (!isAdmin && user?.id) {
      // For non-admin users, only show their own orders
      filteredOrders = storedCompletedOrders.filter((order: any) => order.userId === user.id);
    }
    
    setOrders(filteredOrders);
    fetchSupabaseOrders();
  }, [isAdmin, user?.id]);

  // View order details
  const viewOrderDetails = (order: Order) => {
    setSelectedOrder(order);
  };

  // Close order details
  const closeOrderDetails = () => {
    setSelectedOrder(null);
  };

  // Handle file action (download or print)
  const handleFileAction = (file: OrderFile, action: 'download' | 'print') => {
    toast({
      title: action === 'download' ? "Downloading File" : "Printing File",
      description: `${action === 'download' ? 'Downloading' : 'Printing'} ${file.name}...`,
    });
    
    if (action === 'download') {
      window.open(file.url, '_blank');
    } else {
      const printWindow = window.open(file.url, '_blank');
      printWindow?.addEventListener('load', () => {
        printWindow.print();
      });
    }
  };

  // Filter orders based on search term
  const filteredOrders = orders
    .filter(order => order.status === 'completed')
    .filter(order => 
      order.orderNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
      order.companyName.toLowerCase().includes(searchTerm.toLowerCase())
    );

  return (
    <div className="container mx-auto p-4">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Completed Orders</h1>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search orders..."
            className="pl-10 pr-4 py-2 border rounded-md"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      {/* Completed Orders */}
      <div className="bg-white rounded-lg shadow">
        <div className="p-4 border-b">
          <h2 className="text-lg font-semibold">Completed Orders</h2>
        </div>
        <div className="divide-y">
          {filteredOrders.length === 0 && (
            <div className="p-4 text-center text-gray-500">
              No completed orders found.
            </div>
          )}
          
          {filteredOrders.map(order => (
            <div 
              key={order.id} 
              className="p-4 hover:bg-gray-50 cursor-pointer"
              onClick={() => viewOrderDetails(order)}
            >
              <div className="flex justify-between items-center">
                <div>
                  <h3 className="font-medium">Order #{order.orderNumber}</h3>
                  <p className="text-sm text-gray-600">{order.companyName}</p>
                  <div className="flex space-x-4 text-xs text-gray-500 mt-1">
                    <span>Ordered: {format(order.orderDate, 'MMM d, yyyy')}</span>
                    {order.completedDate && (
                      <span>Completed: {format(order.completedDate, 'MMM d, yyyy')}</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center">
                  {order.files && order.files.length > 0 && (
                    <span className="bg-green-100 text-green-800 text-xs px-2 py-1 rounded mr-2">
                      {order.files.length} Files
                    </span>
                  )}
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      viewOrderDetails(order);
                    }}
                  >
                    View Details
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Order Details Dialog */}
      <Dialog open={!!selectedOrder} onOpenChange={closeOrderDetails}>
        {selectedOrder && (
          <DialogContent className="max-w-3xl">
            <DialogHeader>
              <DialogTitle>Order #{selectedOrder.orderNumber} Details</DialogTitle>
            </DialogHeader>
            
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-gray-500">Company</p>
                  <p>{selectedOrder.companyName}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Order Date</p>
                  <p>{format(selectedOrder.orderDate, 'MMM d, yyyy')}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Completed Date</p>
                  <p>
                    {selectedOrder.completedDate 
                      ? format(selectedOrder.completedDate, 'MMM d, yyyy')
                      : 'N/A'}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Status</p>
                  <p className="text-green-600 font-medium">Completed</p>
                </div>
              </div>
              
              <div>
                <h3 className="font-medium mb-2">Order Items</h3>
                <div className="border rounded-md divide-y">
                  {selectedOrder.items.map((item) => (
                    <div key={item.id} className="p-3">
                      <div className="flex justify-between">
                        <div>
                          <p>{item.name}</p>
                          <p className="text-sm text-gray-500">
                            Quantity: {item.quantity}
                            {item.delivered ? ` (Delivered: ${item.delivered})` : ''}
                          </p>
                        </div>
                        <div className="text-green-600 text-sm">Completed</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <h3 className="font-medium mb-2">Documents</h3>
                {(!selectedOrder.files || selectedOrder.files.length === 0) ? (
                  <div className="text-center p-6 border rounded-md border-dashed">
                    <p className="text-gray-500">No documents available.</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {/* Admin Documents */}
                    <div>
                      <h4 className="text-sm font-medium text-gray-500 mb-2">Admin Documents</h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                        {selectedOrder.files
                          .filter(file => file.uploadedBy === 'admin')
                          .map(file => (
                            <div key={file.id} className="border rounded-md p-3 flex justify-between items-center">
                              <div className="flex items-center">
                                <File className="h-5 w-5 mr-2 text-blue-500" />
                                <div>
                                  <p className="text-sm font-medium truncate max-w-[200px]">{file.name}</p>
                                  <p className="text-xs text-gray-500 capitalize">{file.type.replace('-', ' ')}</p>
                                </div>
                              </div>
                              <div className="flex space-x-2">
                                <Button 
                                  variant="ghost" 
                                  size="sm"
                                  onClick={() => handleFileAction(file, 'download')}
                                >
                                  Download
                                </Button>
                                <Button 
                                  variant="ghost" 
                                  size="sm"
                                  onClick={() => handleFileAction(file, 'print')}
                                >
                                  Print
                                </Button>
                              </div>
                            </div>
                          ))}
                      </div>
                    </div>

                    {/* Client Documents */}
                    <div>
                      <h4 className="text-sm font-medium text-gray-500 mb-2">Client Documents</h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                        {selectedOrder.files
                          .filter(file => file.uploadedBy === 'client')
                          .map(file => (
                            <div key={file.id} className="border rounded-md p-3 flex justify-between items-center">
                              <div className="flex items-center">
                                <File className="h-5 w-5 mr-2 text-green-500" />
                                <div>
                                  <p className="text-sm font-medium truncate max-w-[200px]">{file.name}</p>
                                  <p className="text-xs text-gray-500 capitalize">{file.type.replace('-', ' ')}</p>
                                </div>
                              </div>
                              <div className="flex space-x-2">
                                <Button 
                                  variant="ghost" 
                                  size="sm"
                                  onClick={() => handleFileAction(file, 'download')}
                                >
                                  Download
                                </Button>
                                <Button 
                                  variant="ghost" 
                                  size="sm"
                                  onClick={() => handleFileAction(file, 'print')}
                                >
                                  Print
                                </Button>
                              </div>
                            </div>
                          ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </DialogContent>
        )}
      </Dialog>
    </div>
  );
}
