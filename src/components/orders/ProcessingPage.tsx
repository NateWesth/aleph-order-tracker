import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { format } from "date-fns";
import { File, Plus, Upload } from "lucide-react";

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
}

interface ProcessingPageProps {
  isAdmin: boolean;
}

export default function ProcessingPage({ isAdmin }: ProcessingPageProps) {
  const { toast } = useToast();
  const [orders, setOrders] = useState<Order[]>([]);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [fileType, setFileType] = useState<'invoice' | 'quote' | 'purchase-order' | 'proof-of-payment'>('invoice');
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);

  // Load orders from localStorage on component mount
  useEffect(() => {
    const storedProcessingOrders = JSON.parse(localStorage.getItem('processingOrders') || '[]');
    setOrders(storedProcessingOrders);
  }, []);

  // Save orders to localStorage whenever orders change
  useEffect(() => {
    localStorage.setItem('processingOrders', JSON.stringify(orders));
  }, [orders]);

  // View order details
  const viewOrderDetails = (order: Order) => {
    setSelectedOrder(order);
  };

  // Close order details
  const closeOrderDetails = () => {
    setSelectedOrder(null);
  };

  // Handle file selection
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      // Limit to 3 files
      const files = Array.from(e.target.files).slice(0, 3);
      setSelectedFiles(files);
    }
  };

  // Upload files and set status
  const handleFileUpload = () => {
    if (!selectedOrder || selectedFiles.length === 0) return;

    const newFiles: OrderFile[] = selectedFiles.map(file => ({
      id: `file-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      name: file.name,
      url: URL.createObjectURL(file), // In a real app, this would be a server URL
      type: fileType,
      uploadedBy: isAdmin ? 'admin' : 'client',
      uploadDate: new Date()
    }));

    // Update the order with new files
    setOrders(orders.map(order => {
      if (order.id === selectedOrder.id) {
        return {
          ...order,
          files: [...(order.files || []), ...newFiles]
        };
      }
      return order;
    }));

    // Update the selected order for immediate UI update
    if (selectedOrder) {
      setSelectedOrder({
        ...selectedOrder,
        files: [...(selectedOrder.files || []), ...newFiles]
      });
    }

    setUploadDialogOpen(false);
    setSelectedFiles([]);
    
    toast({
      title: "Files Uploaded",
      description: `${newFiles.length} file(s) have been uploaded successfully.`,
    });
  };

  // Download or print a file
  const handleFileAction = (file: OrderFile, action: 'download' | 'print') => {
    // In a real app, this would download or print the actual file
    toast({
      title: action === 'download' ? "Downloading File" : "Printing File",
      description: `${action === 'download' ? 'Downloading' : 'Printing'} ${file.name}...`,
    });
    
    if (action === 'download') {
      // Simulate a download by opening in a new tab
      window.open(file.url, '_blank');
    } else {
      // Simulate printing by opening print dialog
      const printWindow = window.open(file.url, '_blank');
      printWindow?.addEventListener('load', () => {
        printWindow.print();
      });
    }
  };

  // Mark order as complete (admin only)
  const completeOrder = (orderId: string) => {
    if (!isAdmin) return;

    const orderToComplete = orders.find(order => order.id === orderId);
    if (!orderToComplete) return;

    // Check if required documents are present
    const hasAdminDocs = orderToComplete.files?.some(f => f.type === 'invoice' || f.type === 'quote');
    const hasClientDocs = orderToComplete.files?.some(f => f.type === 'purchase-order' || f.type === 'proof-of-payment');

    if (!hasAdminDocs || !hasClientDocs) {
      toast({
        title: "Cannot Complete Order",
        description: "Required documents must be uploaded before completing the order.",
        variant: "destructive",
      });
      return;
    }

    const completedOrder = {
      ...orderToComplete,
      status: 'completed' as const,
      completedDate: new Date()
    };

    // Remove from processing orders
    const remainingOrders = orders.filter(order => order.id !== orderId);
    setOrders(remainingOrders);
    localStorage.setItem('processingOrders', JSON.stringify(remainingOrders));

    // Add to completed orders
    const existingCompletedOrders = JSON.parse(localStorage.getItem('completedOrders') || '[]');
    const updatedCompletedOrders = [...existingCompletedOrders, completedOrder];
    localStorage.setItem('completedOrders', JSON.stringify(updatedCompletedOrders));

    toast({
      title: "Order Completed",
      description: "Order has been moved to completed orders.",
    });
    
    closeOrderDetails();
  };

  return (
    <div className="container mx-auto p-4">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Order Processing</h1>
      </div>

      {/* Processing Orders */}
      <div className="bg-white rounded-lg shadow">
        <div className="p-4 border-b">
          <h2 className="text-lg font-semibold">Orders in Processing</h2>
        </div>
        <div className="divide-y">
          {orders.filter(order => order.status === 'processing').length === 0 && (
            <div className="p-4 text-center text-gray-500">
              No orders in processing.
            </div>
          )}
          
          {orders
            .filter(order => order.status === 'processing')
            .map(order => (
              <div 
                key={order.id} 
                className="p-4 hover:bg-gray-50 cursor-pointer"
                onClick={() => viewOrderDetails(order)}
              >
                <div className="flex justify-between items-center">
                  <div>
                    <h3 className="font-medium">Order #{order.orderNumber}</h3>
                    <p className="text-sm text-gray-600">{order.companyName}</p>
                    <p className="text-sm text-gray-600">
                      Order Date: {format(order.orderDate, 'MMM d, yyyy')}
                    </p>
                  </div>
                  <div className="flex items-center">
                    {order.files && order.files.length > 0 && (
                      <span className="bg-blue-100 text-blue-800 text-xs px-2 py-1 rounded mr-2">
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
              <DialogTitle>Order #{selectedOrder.orderNumber} Processing</DialogTitle>
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
                  <p className="text-sm text-gray-500">Due Date</p>
                  <p>{format(selectedOrder.dueDate, 'MMM d, yyyy')}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Status</p>
                  <p className="capitalize">{selectedOrder.status}</p>
                </div>
              </div>
              
              <div>
                <div className="flex justify-between items-center mb-2">
                  <h3 className="font-medium">Order Items</h3>
                </div>
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
                        {item.completed && (
                          <div className="text-green-600 text-sm">Completed</div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <div className="flex justify-between items-center mb-2">
                  <h3 className="font-medium">Documents</h3>
                  <Button
                    size="sm"
                    onClick={() => setUploadDialogOpen(true)}
                    disabled={(isAdmin && selectedOrder.files?.some(f => f.type === 'invoice' || f.type === 'quote')) || 
                            (!isAdmin && selectedOrder.files?.some(f => f.type === 'purchase-order' || f.type === 'proof-of-payment'))}
                  >
                    <Upload className="h-4 w-4 mr-1" /> 
                    Upload Files
                  </Button>
                </div>
                
                {(!selectedOrder.files || selectedOrder.files.length === 0) ? (
                  <div className="text-center p-6 border rounded-md border-dashed">
                    <p className="text-gray-500">No documents have been uploaded yet.</p>
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
              
              {isAdmin && (
                <div className="flex justify-end">
                  <Button 
                    onClick={() => completeOrder(selectedOrder.id)}
                    disabled={
                      !selectedOrder.files?.some(f => f.type === 'invoice' || f.type === 'quote') || 
                      !selectedOrder.files?.some(f => f.type === 'purchase-order' || f.type === 'proof-of-payment')
                    }
                  >
                    Complete Order
                  </Button>
                </div>
              )}
            </div>
          </DialogContent>
        )}
      </Dialog>

      {/* File Upload Dialog */}
      <Dialog open={uploadDialogOpen} onOpenChange={setUploadDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Upload Documents</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">Document Type</label>
              <Select value={fileType} onValueChange={(value: any) => setFileType(value)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select document type" />
                </SelectTrigger>
                <SelectContent>
                  {isAdmin ? (
                    <>
                      <SelectItem value="invoice">Invoice</SelectItem>
                      <SelectItem value="quote">Quote</SelectItem>
                    </>
                  ) : (
                    <>
                      <SelectItem value="purchase-order">Purchase Order</SelectItem>
                      <SelectItem value="proof-of-payment">Proof of Payment</SelectItem>
                    </>
                  )}
                </SelectContent>
              </Select>
            </div>
            
            <div>
              <label className="block text-sm font-medium mb-1">
                Files (Max 3)
              </label>
              <div className="border-2 border-dashed rounded-md p-4 text-center">
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
                  accept=".pdf,.doc,.docx" 
                  onChange={handleFileChange}
                  className="absolute inset-0 opacity-0 cursor-pointer"
                />
              </div>
              <p className="text-xs text-gray-500 mt-1">
                Supported formats: PDF, DOC, DOCX. Maximum 3 files.
              </p>
            </div>
          </div>
          
          <DialogFooter>
            <Button 
              onClick={handleFileUpload}
              disabled={selectedFiles.length === 0}
            >
              Upload Files
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
