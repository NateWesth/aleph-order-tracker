
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
import { Printer, Eye, Upload, File, Plus } from "lucide-react";

// Define the order item interface
interface OrderItem {
  id: string;
  name: string;
  quantity: number;
  delivered?: number;
  completed: boolean;
}

// Define the company interface
interface Company {
  id: string;
  name: string;
  code: string;
  contactPerson: string;
  email: string;
  phone: string;
  address: string;
  vatNumber: string;
  logo?: string;
}

// Define the order interface with company details
interface Order {
  id: string;
  orderNumber: string;
  companyName: string;
  company?: Company;
  orderDate: Date;
  dueDate: Date;
  items: OrderItem[];
  status: 'pending' | 'received' | 'in-progress' | 'processing' | 'completed';
  progress?: number;
  progressStage?: 'awaiting-stock' | 'packing' | 'out-for-delivery' | 'completed';
  reference?: string;
  attention?: string;
  files?: {
    id: string;
    name: string;
    url: string;
    type: 'invoice' | 'quote' | 'purchase-order' | 'proof-of-payment' | 'delivery-note' | 'other';
  }[];
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

export default function DeliveryNotePage() {
  const { toast } = useToast();
  const [orders, setOrders] = useState<Order[]>([]);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [fileType, setFileType] = useState<'invoice' | 'quote' | 'purchase-order' | 'proof-of-payment' | 'delivery-note' | 'other'>('other');
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);

  // Load orders from localStorage on component mount
  useEffect(() => {
    const storedDeliveryOrders = JSON.parse(localStorage.getItem('deliveryOrders') || '[]');
    setOrders(storedDeliveryOrders);
  }, []);

  // Save orders to localStorage whenever orders change
  useEffect(() => {
    localStorage.setItem('deliveryOrders', JSON.stringify(orders));
  }, [orders]);

  // Update delivery quantity for an item
  const updateDeliveryQuantity = (orderId: string, itemId: string, quantity: number) => {
    const updatedOrders = orders.map(order => {
      if (order.id === orderId) {
        return {
          ...order,
          items: order.items.map(item => {
            if (item.id === itemId) {
              return { ...item, delivered: quantity };
            }
            return item;
          })
        };
      }
      return order;
    });

    setOrders(updatedOrders);
    localStorage.setItem('deliveryOrders', JSON.stringify(updatedOrders));

    // Also update the same order in progressOrders
    const progressOrders = JSON.parse(localStorage.getItem('progressOrders') || '[]');
    const updatedProgressOrders = progressOrders.map((order: Order) => {
      if (order.id === orderId) {
        return {
          ...order,
          items: order.items.map((item: any) => {
            if (item.id === itemId) {
              return { ...item, delivered: quantity };
            }
            return item;
          })
        };
      }
      return order;
    });
    localStorage.setItem('progressOrders', JSON.stringify(updatedProgressOrders));
  };

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

    // Create simple file objects for regular uploads (without uploadedBy and uploadDate)
    const newFiles = selectedFiles.map(file => ({
      id: `file-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      name: file.name,
      url: URL.createObjectURL(file),
      type: fileType
    }));

    // Update the order with new files
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
    localStorage.setItem('deliveryOrders', JSON.stringify(updatedOrders));

    // Also update in other storage locations
    const progressOrders = JSON.parse(localStorage.getItem('progressOrders') || '[]');
    const updatedProgressOrders = progressOrders.map((order: Order) => {
      if (order.id === selectedOrder.id) {
        return {
          ...order,
          files: [...(order.files || []), ...newFiles]
        };
      }
      return order;
    });
    localStorage.setItem('progressOrders', JSON.stringify(updatedProgressOrders));

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

  // Download or view a file
  const handleFileAction = (file: any, action: 'download' | 'view') => {
    toast({
      title: action === 'download' ? "Downloading File" : "Opening File",
      description: `${action === 'download' ? 'Downloading' : 'Opening'} ${file.name}...`,
    });
    
    window.open(file.url, '_blank');
  };

  // View order details
  const viewOrderDetails = (order: Order) => {
    setSelectedOrder(order);
  };

  // Close order details
  const closeOrderDetails = () => {
    setSelectedOrder(null);
  };

  // Generate delivery note
  const generateDeliveryNote = (order: Order) => {
    // Add delivery note with uploadedBy and uploadDate when generating
    const deliveryNoteFile: OrderFile = {
      id: `file-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      name: `Delivery_Note_${order.orderNumber}_${format(new Date(), 'yyyy-MM-dd')}.pdf`,
      url: `delivery-note-${order.id}`,
      type: 'delivery-note',
      uploadedBy: 'admin' as const,
      uploadDate: new Date()
    };

    // Update order with delivery note file
    const updatedOrders = orders.map(o => {
      if (o.id === order.id) {
        return {
          ...o,
          files: [...(o.files || []), deliveryNoteFile]
        };
      }
      return o;
    });

    setOrders(updatedOrders);
    localStorage.setItem('deliveryOrders', JSON.stringify(updatedOrders));

    setSelectedOrder({...order, files: [...(order.files || []), deliveryNoteFile]});
    setShowPreview(true);
  };

  // Print delivery note
  const printDeliveryNote = () => {
    const printWindow = window.open('', '_blank');
    if (printWindow && selectedOrder) {
      printWindow.document.write(`
        <html>
          <head>
            <title>Delivery Note - ${selectedOrder.orderNumber}</title>
            <style>
              @page { 
                size: A4; 
                margin: 0; 
              }
              * { 
                margin: 0; 
                padding: 0; 
                box-sizing: border-box; 
              }
              body { 
                font-family: Arial, sans-serif; 
                font-size: 12px; 
                line-height: 1.2; 
              }
              .page { 
                width: 210mm; 
                height: 297mm; 
                padding: 10mm; 
                page-break-after: always; 
              }
              .header { 
                display: flex; 
                justify-content: flex-end; 
                align-items: flex-start; 
                margin-bottom: 15mm; 
                position: relative;
              }
              .logo { 
                width: 60mm; 
                height: 40mm; 
                object-fit: contain; 
              }
              .company-details { 
                position: absolute;
                right: 65mm;
                top: 0;
                font-size: 10px; 
                line-height: 1.3; 
                max-width: 60mm; 
              }
              .delivery-note-number { 
                text-align: center; 
                font-size: 16px; 
                font-weight: bold; 
                color: black; 
                margin-bottom: 10mm; 
              }
              .copy-indicator { 
                text-align: center; 
                font-size: 14px; 
                font-weight: bold; 
                margin-bottom: 5mm; 
              }
              table { 
                width: 100%; 
                border-collapse: collapse; 
                margin-bottom: 15mm; 
              }
              th, td { 
                border: 1px solid black; 
                padding: 1.5mm; 
                text-align: left; 
                height: 6mm; 
                font-size: 10px; 
              }
              th { 
                background-color: #f0f0f0; 
                font-weight: bold; 
              }
              .col-description { 
                width: 105mm; 
              }
              .col-ordered, .col-delivered, .col-remaining { 
                width: 17mm; 
                text-align: center; 
              }
              .footer { 
                position: absolute; 
                bottom: 10mm; 
                left: 10mm; 
                right: 10mm; 
                display: flex; 
                justify-content: space-between; 
                font-size: 9px; 
              }
              .signature-section { 
                text-align: center; 
                width: 60mm; 
              }
              .date-section { 
                text-align: center; 
                width: 60mm; 
              }
            </style>
          </head>
          <body>
            <!-- Original Page -->
            <div class="page">
              <div class="header">
                <div class="company-details">
                  <strong>ALEPH TRADING AND PROJECTS CC</strong><br/>
                  123 Business Street<br/>
                  Johannesburg, 2000<br/>
                  VAT: 4123456789<br/>
                  Tel: 011 234 5678
                </div>
                <img src="/lovable-uploads/4c615bdd-48d0-4893-a843-01d2335af67a.png" alt="Aleph Logo" class="logo" />
              </div>
              
              <div class="delivery-note-number">
                DELIVERY NOTE: DN-${selectedOrder.orderNumber}
              </div>
              
              <table>
                <thead>
                  <tr>
                    <th class="col-description">Description</th>
                    <th class="col-ordered">Ordered</th>
                    <th class="col-delivered">Delivered</th>
                    <th class="col-remaining">Remaining</th>
                  </tr>
                </thead>
                <tbody>
                  ${selectedOrder.items.map(item => `
                    <tr>
                      <td>${item.name}</td>
                      <td class="col-ordered">${item.quantity}</td>
                      <td class="col-delivered">${item.delivered || 0}</td>
                      <td class="col-remaining">${item.quantity - (item.delivered || 0)}</td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
              
              <div class="footer">
                <div class="date-section">
                  Date: ${format(new Date(), 'dd/MM/yyyy')}<br/>
                  _________________
                </div>
                <div class="signature-section">
                  Signature<br/>
                  _________________
                </div>
              </div>
            </div>
            
            <!-- Copy Page -->
            <div class="page">
              <div class="copy-indicator">COPY</div>
              <div class="header">
                <div class="company-details">
                  <strong>ALEPH TRADING AND PROJECTS CC</strong><br/>
                  123 Business Street<br/>
                  Johannesburg, 2000<br/>
                  VAT: 4123456789<br/>
                  Tel: 011 234 5678
                </div>
                <img src="/lovable-uploads/4c615bdd-48d0-4893-a843-01d2335af67a.png" alt="Aleph Logo" class="logo" />
              </div>
              
              <div class="delivery-note-number">
                DELIVERY NOTE: DN-${selectedOrder.orderNumber}
              </div>
              
              <table>
                <thead>
                  <tr>
                    <th class="col-description">Description</th>
                    <th class="col-ordered">Ordered</th>
                    <th class="col-delivered">Delivered</th>
                    <th class="col-remaining">Remaining</th>
                  </tr>
                </thead>
                <tbody>
                  ${selectedOrder.items.map(item => `
                    <tr>
                      <td>${item.name}</td>
                      <td class="col-ordered">${item.quantity}</td>
                      <td class="col-delivered">${item.delivered || 0}</td>
                      <td class="col-remaining">${item.quantity - (item.delivered || 0)}</td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
              
              <div class="footer">
                <div class="date-section">
                  Date: ${format(new Date(), 'dd/MM/yyyy')}<br/>
                  _________________
                </div>
                <div class="signature-section">
                  Signature<br/>
                  _________________
                </div>
              </div>
            </div>
          </body>
        </html>
      `);
      printWindow.document.close();
      printWindow.print();
    }
  };

  return (
    <div className="container mx-auto p-4">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Delivery Notes</h1>
      </div>

      {/* Orders available for delivery */}
      <div className="bg-white rounded-lg shadow">
        <div className="p-4 border-b">
          <h2 className="text-lg font-semibold">Orders Ready for Delivery</h2>
        </div>
        <div className="divide-y">
          {orders.length === 0 && (
            <div className="p-4 text-center text-gray-500">
              No orders ready for delivery.
            </div>
          )}
          
          {orders.map(order => (
            <div key={order.id} className="p-4 hover:bg-gray-50">
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
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => viewOrderDetails(order)}
                  >
                    <Eye className="h-4 w-4 mr-2" />
                    View Details
                  </Button>
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => generateDeliveryNote(order)}
                  >
                    <Printer className="h-4 w-4 mr-2" />
                    Generate Note
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Order Details Dialog */}
      <Dialog open={!!selectedOrder && !showPreview} onOpenChange={closeOrderDetails}>
        {selectedOrder && (
          <DialogContent className="max-w-3xl">
            <DialogHeader>
              <DialogTitle>Order #{selectedOrder.orderNumber} - Delivery Details</DialogTitle>
            </DialogHeader>
            
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-gray-500">Company</p>
                  <p>{selectedOrder.companyName}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Due Date</p>
                  <p>{format(selectedOrder.dueDate, 'MMM d, yyyy')}</p>
                </div>
              </div>
              
              <div>
                <h3 className="font-medium mb-2">Items for Delivery</h3>
                <div className="border rounded-md divide-y">
                  {selectedOrder.items.map((item) => (
                    <div key={item.id} className="p-3">
                      <div className="flex justify-between items-center">
                        <div className="flex-grow">
                          <p className="font-medium">{item.name}</p>
                          <p className="text-sm text-gray-500">
                            Ordered: {item.quantity}
                          </p>
                        </div>
                        <div className="flex items-center gap-4">
                          <div className="flex items-center gap-2">
                            <label className="text-sm">Delivered:</label>
                            <Input
                              type="number"
                              min="0"
                              max={item.quantity}
                              value={item.delivered || 0}
                              onChange={(e) => updateDeliveryQuantity(
                                selectedOrder.id, 
                                item.id, 
                                parseInt(e.target.value) || 0
                              )}
                              className="w-20"
                            />
                          </div>
                          <div className="text-sm text-gray-500">
                            Remaining: {item.quantity - (item.delivered || 0)}
                          </div>
                        </div>
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

      {/* Delivery Note Preview Dialog */}
      <Dialog open={showPreview} onOpenChange={() => setShowPreview(false)}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>Delivery Note Preview</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            <Button onClick={printDeliveryNote} className="w-full">
              <Printer className="h-4 w-4 mr-2" />
              Print Delivery Note
            </Button>
          </div>
        </DialogContent>
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
