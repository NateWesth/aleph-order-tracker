import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Progress } from "@/components/ui/progress";
import { 
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { 
  Form,
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormMessage 
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import * as z from "zod";
import { CalendarIcon, Plus, Trash, Download, FileText, Printer, Upload, File, Eye } from "lucide-react";
import { format } from "date-fns";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

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
  type: 'invoice' | 'quote' | 'purchase-order' | 'proof-of-payment' | 'delivery-note' | 'other';
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
  status: 'pending' | 'received' | 'in-progress' | 'processing' | 'completed';
  progress?: number;
  progressStage?: 'awaiting-stock' | 'packing' | 'out-for-delivery' | 'completed';
  files?: OrderFile[];
}

// Form schema for new orders
const newOrderSchema = z.object({
  orderNumber: z.string().min(1, "Order number is required"),
  companyName: z.string().min(1, "Company name is required"),
  dueDate: z.date(),
  items: z.array(z.object({
    name: z.string().min(1, "Item name is required"),
    quantity: z.number().min(1, "Quantity must be at least 1"),
  })).min(1, "At least one item is required"),
});

type NewOrderFormValues = z.infer<typeof newOrderSchema>;

// Props for the OrdersPage component
interface OrdersPageProps {
  isAdmin: boolean;
  companyCode?: string;
}

export default function OrdersPage({ isAdmin, companyCode }: OrdersPageProps) {
  const { toast } = useToast();
  const [orders, setOrders] = useState<Order[]>([]);
  const [isNewOrderDialogOpen, setIsNewOrderDialogOpen] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [newItemName, setNewItemName] = useState("");
  const [newItemQuantity, setNewItemQuantity] = useState(1);
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [fileType, setFileType] = useState<'invoice' | 'quote' | 'purchase-order' | 'proof-of-payment' | 'delivery-note' | 'other'>('other');
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);

  const form = useForm<NewOrderFormValues>({
    resolver: zodResolver(newOrderSchema),
    defaultValues: {
      orderNumber: "",
      companyName: "",
      items: [],
    },
  });

  // Load orders from localStorage on component mount
  useEffect(() => {
    const storedPendingOrders = JSON.parse(localStorage.getItem('pendingOrders') || '[]');
    setOrders(storedPendingOrders);
  }, []);

  // Save orders to localStorage whenever orders change
  useEffect(() => {
    localStorage.setItem('pendingOrders', JSON.stringify(orders));
  }, [orders]);

  // Handle file selection
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const files = Array.from(e.target.files).slice(0, 3);
      setSelectedFiles(files);
    }
  };

  // Upload files to order
  const handleFileUpload = () => {
    if (!selectedOrder || selectedFiles.length === 0) return;

    const newFiles: OrderFile[] = selectedFiles.map(file => ({
      id: `file-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      name: file.name,
      url: URL.createObjectURL(file),
      type: fileType,
      uploadedBy: isAdmin ? 'admin' : 'client',
      uploadDate: new Date()
    }));

    const updatedOrders = orders.map(order => {
      if (order.id === selectedOrder.id) {
        return {
          ...order,
          files: [...(order.files || []), ...newFiles]
        };
      }
      return order;
    });

    setOrders(updatedOrders);
    localStorage.setItem('pendingOrders', JSON.stringify(updatedOrders));

    setSelectedOrder({
      ...selectedOrder,
      files: [...(selectedOrder.files || []), ...newFiles]
    });

    setUploadDialogOpen(false);
    setSelectedFiles([]);
    
    toast({
      title: "Files Uploaded",
      description: `${newFiles.length} file(s) have been uploaded successfully.`,
    });
  };

  // Handle file download
  const handleDownload = (fileType: 'pdf' | 'excel', order: Order) => {
    // In a real app, this would download the actual file
    toast({
      title: "Download Started",
      description: `Downloading order #${order.orderNumber} as ${fileType.toUpperCase()}`,
    });
  };

  // Handle file print
  const handlePrint = (order: Order) => {
    // In a real app, this would open the print dialog
    toast({
      title: "Print",
      description: `Printing order #${order.orderNumber}`,
    });
  };

  // Handle order receive (admin only)
  const handleReceiveOrder = (orderId: string) => {
    if (!isAdmin) return;

    const orderToReceive = orders.find(order => order.id === orderId);
    if (!orderToReceive) return;

    const receivedOrder = { 
      ...orderToReceive, 
      status: 'received' as const, 
      progress: 0, 
      progressStage: 'awaiting-stock' as const 
    };

    // Remove from pending orders
    const remainingOrders = orders.filter(order => order.id !== orderId);
    setOrders(remainingOrders);
    localStorage.setItem('pendingOrders', JSON.stringify(remainingOrders));

    // Add to progress orders
    const existingProgressOrders = JSON.parse(localStorage.getItem('progressOrders') || '[]');
    const updatedProgressOrders = [...existingProgressOrders, receivedOrder];
    localStorage.setItem('progressOrders', JSON.stringify(updatedProgressOrders));

    // Add to delivery orders
    const existingDeliveryOrders = JSON.parse(localStorage.getItem('deliveryOrders') || '[]');
    const updatedDeliveryOrders = [...existingDeliveryOrders, receivedOrder];
    localStorage.setItem('deliveryOrders', JSON.stringify(updatedDeliveryOrders));

    toast({
      title: "Order Received",
      description: "Order has been moved to progress tracking and delivery notes.",
    });
  };

  // Add a new item to the form
  const addItem = () => {
    if (!newItemName) {
      toast({
        title: "Error",
        description: "Please enter an item name",
        variant: "destructive",
      });
      return;
    }

    const currentItems = form.getValues("items") || [];
    
    form.setValue("items", [
      ...currentItems, 
      { 
        name: newItemName, 
        quantity: newItemQuantity 
      }
    ]);
    
    setNewItemName("");
    setNewItemQuantity(1);
  };

  // Remove an item from the form
  const removeItem = (index: number) => {
    const currentItems = form.getValues("items") || [];
    const newItems = [...currentItems];
    newItems.splice(index, 1);
    form.setValue("items", newItems);
  };

  // Handle form submission
  const onSubmit = (data: NewOrderFormValues) => {
    const newOrder: Order = {
      id: `order-${Date.now()}`,
      orderNumber: data.orderNumber,
      companyName: data.companyName,
      orderDate: new Date(),
      dueDate: data.dueDate,
      items: data.items.map(item => ({
        id: `item-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        name: item.name,
        quantity: item.quantity,
        completed: false
      })),
      status: 'pending'
    };

    const updatedOrders = [...orders, newOrder];
    setOrders(updatedOrders);
    localStorage.setItem('pendingOrders', JSON.stringify(updatedOrders));
    
    setIsNewOrderDialogOpen(false);
    form.reset();

    toast({
      title: "Order Created",
      description: `Order #${data.orderNumber} has been created successfully.`,
    });
  };

  // Reset form when dialog closes
  const handleDialogClose = () => {
    form.reset();
    setIsNewOrderDialogOpen(false);
    setNewItemName("");
    setNewItemQuantity(1);
  };

  // View order details
  const viewOrderDetails = (order: Order) => {
    setSelectedOrder(order);
  };

  // Close order details
  const closeOrderDetails = () => {
    setSelectedOrder(null);
  };

  return (
    <div className="container mx-auto p-4">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Orders</h1>
        <Button onClick={() => setIsNewOrderDialogOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Add New Order
        </Button>
      </div>

      {/* Orders list */}
      <div className="bg-white rounded-lg shadow">
        <div className="p-4 border-b">
          <h2 className="text-lg font-semibold">Pending Orders</h2>
        </div>
        <div className="divide-y">
          {orders.filter(order => order.status === 'pending').length === 0 && (
            <div className="p-4 text-center text-gray-500">
              No pending orders found.
            </div>
          )}
          
          {orders
            .filter(order => order.status === 'pending')
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
                      Due: {format(order.dueDate, 'MMM d, yyyy')}
                    </p>
                    {order.files && order.files.length > 0 && (
                      <span className="bg-blue-100 text-blue-800 text-xs px-2 py-1 rounded mt-1 inline-block">
                        {order.files.length} Files
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {/* Download/Print options */}
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="outline" size="sm" onClick={(e) => e.stopPropagation()}>
                          <Download className="h-4 w-4 mr-2" />
                          Download
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent>
                        <DropdownMenuItem onClick={(e) => {
                          e.stopPropagation();
                          handleDownload('pdf', order);
                        }}>
                          <FileText className="h-4 w-4 mr-2" />
                          Download as PDF
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={(e) => {
                          e.stopPropagation();
                          handleDownload('excel', order);
                        }}>
                          <FileText className="h-4 w-4 mr-2" />
                          Download as Excel
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                    
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        handlePrint(order);
                      }}
                    >
                      <Printer className="h-4 w-4 mr-2" />
                      Print
                    </Button>
                    
                    {isAdmin && (
                      <Button 
                        variant="outline" 
                        onClick={(e) => {
                          e.stopPropagation();
                          handleReceiveOrder(order.id);
                        }}
                      >
                        Receive Order
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            ))
          }
        </div>
      </div>

      {/* New Order Dialog */}
      <Dialog open={isNewOrderDialogOpen} onOpenChange={handleDialogClose}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Create New Order</DialogTitle>
          </DialogHeader>
          
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="orderNumber"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Order Number</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="Enter order number" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={form.control}
                  name="companyName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Company Name</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="Enter company name" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="dueDate"
                  render={({ field }) => (
                    <FormItem className="flex flex-col">
                      <FormLabel>Due Date</FormLabel>
                      <Popover>
                        <PopoverTrigger asChild>
                          <FormControl>
                            <Button
                              variant={"outline"}
                              className={cn(
                                "w-full pl-3 text-left font-normal",
                                !field.value && "text-muted-foreground"
                              )}
                            >
                              {field.value ? (
                                format(field.value, "PPP")
                              ) : (
                                <span>Pick a date</span>
                              )}
                              <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                            </Button>
                          </FormControl>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <Calendar
                            mode="single"
                            selected={field.value}
                            onSelect={field.onChange}
                            initialFocus
                          />
                        </PopoverContent>
                      </Popover>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="space-y-4">
                <h3 className="font-medium">Order Items</h3>
                
                <div className="space-y-2">
                  {form.watch("items")?.map((item, index) => (
                    <div key={index} className="flex items-center space-x-2">
                      <div className="flex-grow">{item.name}</div>
                      <div>Qty: {item.quantity}</div>
                      <Button 
                        type="button" 
                        variant="ghost" 
                        size="sm"
                        onClick={() => removeItem(index)}
                      >
                        <Trash className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Input
                    placeholder="Item name"
                    value={newItemName}
                    onChange={(e) => setNewItemName(e.target.value)}
                  />
                  <div className="flex items-center space-x-2">
                    <Input
                      type="number"
                      min="1"
                      value={newItemQuantity}
                      onChange={(e) => setNewItemQuantity(parseInt(e.target.value) || 1)}
                    />
                    <Button type="button" onClick={addItem}>
                      Add Item
                    </Button>
                  </div>
                </div>
                
                {form.formState.errors.items && (
                  <p className="text-sm text-red-500">
                    {form.formState.errors.items.message}
                  </p>
                )}
              </div>

              <DialogFooter>
                <Button type="submit">Create Order</Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Order Details Dialog */}
      <Dialog open={!!selectedOrder} onOpenChange={closeOrderDetails}>
        {selectedOrder && (
          <DialogContent className="max-w-3xl">
            <DialogHeader>
              <DialogTitle className="flex items-center justify-between">
                Order #{selectedOrder.orderNumber}
                <div className="flex items-center gap-2">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" size="sm">
                        <Download className="h-4 w-4 mr-2" />
                        Download
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent>
                      <DropdownMenuItem onClick={() => handleDownload('pdf', selectedOrder)}>
                        <FileText className="h-4 w-4 mr-2" />
                        Download as PDF
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleDownload('excel', selectedOrder)}>
                        <FileText className="h-4 w-4 mr-2" />
                        Download as Excel
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                  
                  <Button variant="outline" size="sm" onClick={() => handlePrint(selectedOrder)}>
                    <Printer className="h-4 w-4 mr-2" />
                    Print
                  </Button>
                </div>
              </DialogTitle>
            </DialogHeader>
            
            <div className="space-y-4">
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
                <h3 className="font-medium mb-2">Items</h3>
                <div className="border rounded-md divide-y">
                  {selectedOrder.items.map((item) => (
                    <div key={item.id} className="p-3 flex justify-between items-center">
                      <div>
                        <p>{item.name}</p>
                        <p className="text-sm text-gray-500">
                          Quantity: {item.quantity}
                        </p>
                      </div>
                      <div className="flex items-center space-x-2">
                        {isAdmin && (
                          <div className="flex items-center">
                            <Input
                              className="w-20"
                              type="number"
                              placeholder="Delivered"
                              value={item.delivered || ""}
                              onChange={(e) => {
                                // This would update the delivered amount in a real app
                              }}
                            />
                          </div>
                        )}
                        {item.delivered && (
                          <div className="text-sm">
                            Delivered: {item.delivered}
                          </div>
                        )}
                        {isAdmin && (
                          <input
                            type="checkbox"
                            checked={item.completed}
                            className="ml-2"
                            onChange={() => {
                              // This would mark items as completed in a real app
                            }}
                          />
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Files Section */}
              <div>
                <div className="flex justify-between items-center mb-2">
                  <h3 className="font-medium">Files</h3>
                  <Button
                    size="sm"
                    onClick={() => setUploadDialogOpen(true)}
                  >
                    <Upload className="h-4 w-4 mr-1" />
                    Upload Files
                  </Button>
                </div>
                
                {(!selectedOrder.files || selectedOrder.files.length === 0) ? (
                  <div className="text-center p-6 border rounded-md border-dashed">
                    <p className="text-gray-500">No files uploaded yet.</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {selectedOrder.files.map(file => (
                      <div key={file.id} className="border rounded-md p-3 flex justify-between items-center">
                        <div className="flex items-center">
                          <File className="h-5 w-5 mr-2 text-blue-500" />
                          <div>
                            <p className="text-sm font-medium truncate max-w-[200px]">{file.name}</p>
                            <p className="text-xs text-gray-500 capitalize">
                              {file.type.replace('-', ' ')} • {file.uploadedBy}
                            </p>
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
            <DialogTitle>Upload Files</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">File Type</label>
              <Select value={fileType} onValueChange={(value: any) => setFileType(value)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select file type" />
                </SelectTrigger>
                <SelectContent>
                  {isAdmin ? (
                    <>
                      <SelectItem value="invoice">Invoice</SelectItem>
                      <SelectItem value="quote">Quote</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </>
                  ) : (
                    <>
                      <SelectItem value="purchase-order">Purchase Order</SelectItem>
                      <SelectItem value="proof-of-payment">Proof of Payment</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </>
                  )}
                </SelectContent>
              </Select>
            </div>
            
            <div>
              <label className="block text-sm font-medium mb-1">
                Files (Max 3)
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
                Supported formats: PDF, DOC, DOCX, JPG, PNG. Maximum 3 files.
              </p>
            </div>
          </div>
          
          <div className="flex justify-end">
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
