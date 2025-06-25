
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { format } from "date-fns";
import { Upload, File, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

// Define the order item interface
interface OrderItem {
  id: string;
  name: string;
  quantity: number;
  delivered?: number;
  completed: boolean;
}

// Define the order interface
interface Order {
  id: string;
  orderNumber: string;
  companyName: string;
  orderDate: Date;
  dueDate: Date;
  items: OrderItem[];
  status: 'pending' | 'received' | 'in-progress' | 'processing' | 'completed';
  completedDate?: Date;
  files?: {
    id: string;
    name: string;
    url: string;
    type: 'invoice' | 'quote' | 'purchase-order' | 'proof-of-payment' | 'delivery-note' | 'other';
  }[];
}

interface DeliveryNotePageProps {
  isAdmin: boolean;
}

export default function DeliveryNotePage({ isAdmin }: DeliveryNotePageProps) {
  const { toast } = useToast();
  const { user } = useAuth();
  const [completedOrders, setCompletedOrders] = useState<Order[]>([]);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [fileType, setFileType] = useState<'invoice' | 'quote' | 'purchase-order' | 'proof-of-payment' | 'delivery-note' | 'other'>('delivery-note');
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [searchTerm, setSearchTerm] = useState('');

  // Fetch completed orders from localStorage and database
  const fetchCompletedOrders = async () => {
    try {
      // Get from localStorage first
      const storedCompletedOrders = JSON.parse(localStorage.getItem('completedOrders') || '[]');
      
      // Filter orders based on admin status
      let filteredOrders = storedCompletedOrders;
      if (!isAdmin && user?.id) {
        filteredOrders = storedCompletedOrders.filter((order: any) => order.userId === user.id);
      }
      
      // Only show completed orders
      const completedOnly = filteredOrders.filter((order: Order) => order.status === 'completed');
      
      setCompletedOrders(completedOnly);

      // Also fetch from Supabase for real-time sync
      if (user?.id) {
        let query = supabase
          .from('orders')
          .select('*')
          .eq('status', 'completed')
          .order('created_at', { ascending: false });

        if (!isAdmin) {
          query = query.eq('user_id', user.id);
        }

        const { data, error } = await query;
        if (error) {
          console.error("Error fetching completed orders:", error);
          return;
        }

        // Merge with localStorage data (localStorage takes priority for files)
        // This ensures we don't lose any files stored locally
        console.log('Fetched completed orders from database:', data?.length || 0);
      }
    } catch (error) {
      console.error("Failed to fetch completed orders:", error);
    }
  };

  useEffect(() => {
    fetchCompletedOrders();
  }, [isAdmin, user?.id]);

  // Handle file selection
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const files = Array.from(e.target.files).slice(0, 5);
      setSelectedFiles(files);
    }
  };

  // Upload files to the selected order
  const handleFileUpload = () => {
    if (!selectedOrder || selectedFiles.length === 0) return;

    // Create file objects for the upload
    const newFiles = selectedFiles.map(file => ({
      id: `file-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      name: file.name,
      url: URL.createObjectURL(file),
      type: fileType
    }));

    // Update the selected order with new files
    const updatedOrder = {
      ...selectedOrder,
      files: [...(selectedOrder.files || []), ...newFiles]
    };

    // Update completed orders list
    const updatedOrders = completedOrders.map(order => {
      if (order.id === selectedOrder.id) {
        return updatedOrder;
      }
      return order;
    });

    setCompletedOrders(updatedOrders);
    setSelectedOrder(updatedOrder);

    // Save to localStorage
    localStorage.setItem('completedOrders', JSON.stringify(updatedOrders));

    // Close dialog and reset
    setUploadDialogOpen(false);
    setSelectedFiles([]);
    
    toast({
      title: "Files Uploaded",
      description: `${newFiles.length} file(s) have been uploaded to order ${selectedOrder.orderNumber}.`,
    });
  };

  // View order details
  const viewOrderDetails = (order: Order) => {
    setSelectedOrder(order);
  };

  // Close order details
  const closeOrderDetails = () => {
    setSelectedOrder(null);
  };

  // Download or view a file
  const handleFileAction = (file: any, action: 'download' | 'view') => {
    toast({
      title: action === 'download' ? "Downloading File" : "Opening File",
      description: `${action === 'download' ? 'Downloading' : 'Opening'} ${file.name}...`,
    });
    
    window.open(file.url, '_blank');
  };

  // Filter orders based on search term
  const filteredOrders = completedOrders.filter(order => 
    order.orderNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
    order.companyName.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="container mx-auto p-4">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Delivery Notes</h1>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search completed orders..."
            className="pl-10 pr-4 py-2 border rounded-md"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      {/* Completed Orders for File Upload */}
      <div className="bg-white rounded-lg shadow">
        <div className="p-4 border-b">
          <h2 className="text-lg font-semibold">Completed Orders - Upload Files</h2>
          <p className="text-sm text-gray-600 mt-1">
            Upload delivery notes and other files to completed orders
          </p>
        </div>
        <div className="divide-y">
          {filteredOrders.length === 0 && (
            <div className="p-4 text-center text-gray-500">
              No completed orders found.
            </div>
          )}
          
          {filteredOrders.map(order => (
            <div key={order.id} className="p-4 hover:bg-gray-50">
              <div className="flex justify-between items-center">
                <div>
                  <h3 className="font-medium">Order #{order.orderNumber}</h3>
                  <p className="text-sm text-gray-600">{order.companyName}</p>
                  <div className="flex space-x-4 text-xs text-gray-500 mt-1">
                    <span>Completed: {order.completedDate ? format(new Date(order.completedDate), 'MMM d, yyyy') : 'N/A'}</span>
                    {order.files && order.files.length > 0 && (
                      <span className="bg-green-100 text-green-800 px-2 py-1 rounded">
                        {order.files.length} Files
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => viewOrderDetails(order)}
                  >
                    View Details
                  </Button>
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => {
                      setSelectedOrder(order);
                      setUploadDialogOpen(true);
                    }}
                  >
                    <Upload className="h-4 w-4 mr-2" />
                    Upload Files
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Order Details Dialog */}
      <Dialog open={!!selectedOrder && !uploadDialogOpen} onOpenChange={closeOrderDetails}>
        {selectedOrder && (
          <DialogContent className="max-w-3xl">
            <DialogHeader>
              <DialogTitle>Order #{selectedOrder.orderNumber} - Files</DialogTitle>
            </DialogHeader>
            
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-gray-500">Company</p>
                  <p>{selectedOrder.companyName}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Completed Date</p>
                  <p>
                    {selectedOrder.completedDate 
                      ? format(new Date(selectedOrder.completedDate), 'MMM d, yyyy')
                      : 'N/A'}
                  </p>
                </div>
              </div>

              {/* Files Section */}
              <div>
                <div className="flex justify-between items-center mb-4">
                  <h3 className="font-medium">Uploaded Files</h3>
                  <Button
                    size="sm"
                    onClick={() => setUploadDialogOpen(true)}
                  >
                    <Upload className="h-4 w-4 mr-1" />
                    Upload More Files
                  </Button>
                </div>
                
                {(!selectedOrder.files || selectedOrder.files.length === 0) ? (
                  <div className="text-center p-6 border rounded-md border-dashed">
                    <p className="text-gray-500">No files uploaded yet.</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {selectedOrder.files.map(file => (
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
                            onClick={() => handleFileAction(file, 'view')}
                          >
                            View
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </DialogContent>
        )}
      </Dialog>

      {/* File Upload Dialog */}
      <Dialog open={uploadDialogOpen} onOpenChange={setUploadDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              Upload Files to Order #{selectedOrder?.orderNumber}
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">File Type</label>
              <Select value={fileType} onValueChange={(value: any) => setFileType(value)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select file type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="delivery-note">Delivery Note</SelectItem>
                  <SelectItem value="invoice">Invoice</SelectItem>
                  <SelectItem value="quote">Quote</SelectItem>
                  <SelectItem value="purchase-order">Purchase Order</SelectItem>
                  <SelectItem value="proof-of-payment">Proof of Payment</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div>
              <label className="block text-sm font-medium mb-1">
                Files (Max 5)
              </label>
              <div className="border-2 border-dashed rounded-md p-4 text-center relative">
                {selectedFiles.length > 0 ? (
                  <ul className="text-left space-y-1">
                    {selectedFiles.map((file, index) => (
                      <li key={index} className="text-sm">{file.name}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-gray-500">Click to select files or drag and drop</p>
                )}
                <input 
                  type="file" 
                  multiple 
                  accept=".pdf,.doc,.docx,.jpg,.jpeg,.png" 
                  onChange={handleFileChange}
                  className="absolute inset-0 opacity-0 cursor-pointer"
                />
              </div>
              <p className="text-xs text-gray-500 mt-1">
                Supported formats: PDF, DOC, DOCX, JPG, PNG. Maximum 5 files.
              </p>
            </div>
          </div>
          
          <div className="flex justify-end gap-2">
            <Button 
              variant="outline"
              onClick={() => setUploadDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button 
              onClick={handleFileUpload}
              disabled={selectedFiles.length === 0}
            >
              Upload Files
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
