
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { format } from "date-fns";
import { Search, Download, Printer } from "lucide-react";

// Define the order item interface
interface OrderItem {
  id: string;
  name: string;
  quantity: number;
  description?: string;
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
}

// Mock orders data
const mockOrders: Order[] = [
  {
    id: "1",
    orderNumber: "ORD-2024-001",
    companyName: "ABC Construction",
    orderDate: new Date(2024, 0, 15),
    dueDate: new Date(2024, 1, 15),
    status: "in-progress",
    items: [
      { id: "1", name: "Steel Beams", quantity: 10, description: "Heavy duty steel beams for construction" },
      { id: "2", name: "Concrete Mix", quantity: 50, description: "Premium concrete mix bags" },
    ]
  },
  {
    id: "2",
    orderNumber: "ORD-2024-002",
    companyName: "XYZ Industries",
    orderDate: new Date(2024, 0, 20),
    dueDate: new Date(2024, 1, 20),
    status: "processing",
    items: [
      { id: "3", name: "Welding Equipment", quantity: 3, description: "Professional welding equipment set" },
      { id: "4", name: "Safety Helmets", quantity: 25, description: "Industrial safety helmets" },
    ]
  },
];

export default function DeliveryNotePage() {
  const { toast } = useToast();
  const [orders] = useState<Order[]>(mockOrders);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [showDeliveryNote, setShowDeliveryNote] = useState(false);

  // Generate delivery note number
  const generateDeliveryNoteNumber = () => {
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
    return `DN-${year}${month}${day}-${random}`;
  };

  // Create delivery note
  const createDeliveryNote = (order: Order) => {
    setSelectedOrder(order);
    setShowDeliveryNote(true);
  };

  // Download delivery note as PDF
  const downloadDeliveryNote = () => {
    if (!selectedOrder) return;
    
    // Create delivery note content
    const deliveryNoteContent = generateDeliveryNoteHTML();
    
    // Create a new window for printing/PDF generation
    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(deliveryNoteContent);
      printWindow.document.close();
      
      // Trigger download
      printWindow.focus();
      setTimeout(() => {
        printWindow.print();
      }, 250);
    }

    toast({
      title: "Delivery Note Downloaded",
      description: `Delivery note for order ${selectedOrder.orderNumber} has been generated.`,
    });
  };

  // Print delivery note
  const printDeliveryNote = () => {
    if (!selectedOrder) return;
    
    // Create delivery note content
    const deliveryNoteContent = generateDeliveryNoteHTML();
    
    // Create a new window for printing
    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(deliveryNoteContent);
      printWindow.document.close();
      printWindow.focus();
      setTimeout(() => {
        printWindow.print();
        printWindow.close();
      }, 250);
    }

    toast({
      title: "Delivery Note Printed",
      description: `Delivery note for order ${selectedOrder.orderNumber} has been sent to printer.`,
    });
  };

  // Generate HTML for delivery note
  const generateDeliveryNoteHTML = () => {
    if (!selectedOrder) return '';
    
    const deliveryNoteNumber = generateDeliveryNoteNumber();
    const deliveryDate = format(new Date(), 'dd/MM/yyyy');
    
    return `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Delivery Note - ${deliveryNoteNumber}</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 20px; }
            .header { text-align: center; margin-bottom: 30px; }
            .company-name { font-size: 24px; font-weight: bold; color: #1e40af; }
            .document-title { font-size: 20px; margin: 20px 0; }
            .info-section { margin: 20px 0; }
            .info-row { display: flex; justify-content: space-between; margin: 10px 0; }
            .info-label { font-weight: bold; }
            table { width: 100%; border-collapse: collapse; margin: 20px 0; }
            th, td { border: 1px solid #ddd; padding: 12px; text-align: left; }
            th { background-color: #f5f5f5; font-weight: bold; }
            .footer { margin-top: 40px; text-align: center; color: #666; }
          </style>
        </head>
        <body>
          <div class="header">
            <div class="company-name">Aleph Engineering and Supplies</div>
            <div class="document-title">DELIVERY NOTE</div>
          </div>
          
          <div class="info-section">
            <div class="info-row">
              <span><span class="info-label">Delivery Note Number:</span> ${deliveryNoteNumber}</span>
              <span><span class="info-label">Date:</span> ${deliveryDate}</span>
            </div>
            <div class="info-row">
              <span><span class="info-label">Order Number:</span> ${selectedOrder.orderNumber}</span>
              <span><span class="info-label">Order Date:</span> ${format(selectedOrder.orderDate, 'dd/MM/yyyy')}</span>
            </div>
            <div class="info-row">
              <span><span class="info-label">Customer:</span> ${selectedOrder.companyName}</span>
            </div>
          </div>
          
          <table>
            <thead>
              <tr>
                <th>Item</th>
                <th>Description</th>
                <th>Quantity</th>
              </tr>
            </thead>
            <tbody>
              ${selectedOrder.items.map(item => `
                <tr>
                  <td>${item.name}</td>
                  <td>${item.description || 'N/A'}</td>
                  <td>${item.quantity}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
          
          <div class="footer">
            <p>This document was automatically generated by Aleph Engineering and Supplies system.</p>
            <p>Generated on ${format(new Date(), 'dd/MM/yyyy HH:mm')}</p>
          </div>
        </body>
      </html>
    `;
  };

  // Filter orders based on search term
  const filteredOrders = orders.filter(order => 
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
            placeholder="Search orders..."
            className="pl-10 pr-4 py-2 border rounded-md"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      {/* Orders List */}
      <div className="bg-white rounded-lg shadow">
        <div className="p-4 border-b">
          <h2 className="text-lg font-semibold">Select Order for Delivery Note</h2>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Order Number</TableHead>
              <TableHead>Company</TableHead>
              <TableHead>Order Date</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredOrders.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-gray-500">
                  No orders found.
                </TableCell>
              </TableRow>
            ) : (
              filteredOrders.map(order => (
                <TableRow key={order.id}>
                  <TableCell className="font-medium">{order.orderNumber}</TableCell>
                  <TableCell>{order.companyName}</TableCell>
                  <TableCell>{format(order.orderDate, 'MMM d, yyyy')}</TableCell>
                  <TableCell>
                    <span className={`px-2 py-1 rounded text-xs font-medium ${
                      order.status === 'completed' ? 'bg-green-100 text-green-800' :
                      order.status === 'in-progress' ? 'bg-blue-100 text-blue-800' :
                      order.status === 'processing' ? 'bg-yellow-100 text-yellow-800' :
                      'bg-gray-100 text-gray-800'
                    }`}>
                      {order.status.replace('-', ' ')}
                    </span>
                  </TableCell>
                  <TableCell>
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => createDeliveryNote(order)}
                    >
                      Create Delivery Note
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Delivery Note Preview Dialog */}
      <Dialog open={showDeliveryNote} onOpenChange={setShowDeliveryNote}>
        {selectedOrder && (
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Delivery Note Preview - {selectedOrder.orderNumber}</DialogTitle>
            </DialogHeader>
            
            <div className="space-y-6">
              <div className="text-center border-b pb-4">
                <h2 className="text-2xl font-bold text-aleph-blue">Aleph Engineering and Supplies</h2>
                <h3 className="text-xl font-semibold mt-2">DELIVERY NOTE</h3>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-gray-500">Delivery Note Number</p>
                  <p className="font-medium">{generateDeliveryNoteNumber()}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Date</p>
                  <p className="font-medium">{format(new Date(), 'dd/MM/yyyy')}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Order Number</p>
                  <p className="font-medium">{selectedOrder.orderNumber}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Order Date</p>
                  <p className="font-medium">{format(selectedOrder.orderDate, 'dd/MM/yyyy')}</p>
                </div>
                <div className="col-span-2">
                  <p className="text-sm text-gray-500">Customer</p>
                  <p className="font-medium">{selectedOrder.companyName}</p>
                </div>
              </div>
              
              <div>
                <h4 className="font-medium mb-3">Items Delivered</h4>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Item</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead>Quantity</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {selectedOrder.items.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell className="font-medium">{item.name}</TableCell>
                        <TableCell>{item.description || 'N/A'}</TableCell>
                        <TableCell>{item.quantity}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <div className="flex justify-end space-x-4 pt-4 border-t">
                <Button 
                  variant="outline" 
                  onClick={() => setShowDeliveryNote(false)}
                >
                  Cancel
                </Button>
                <Button 
                  variant="outline" 
                  onClick={printDeliveryNote}
                  className="flex items-center gap-2"
                >
                  <Printer className="h-4 w-4" />
                  Print
                </Button>
                <Button 
                  onClick={downloadDeliveryNote}
                  className="flex items-center gap-2"
                >
                  <Download className="h-4 w-4" />
                  Download PDF
                </Button>
              </div>
            </div>
          </DialogContent>
        )}
      </Dialog>
    </div>
  );
}
