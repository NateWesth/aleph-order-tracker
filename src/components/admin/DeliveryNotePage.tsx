
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

// Define the order item interface with completion tracking
interface OrderItem {
  id: string;
  name: string;
  quantity: number;
  delivered?: number;
  completed: boolean;
  description?: string;
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
  reference?: string;
  attention?: string;
  progress?: number;
  progressStage?: 'awaiting-stock' | 'packing' | 'out-for-delivery' | 'completed';
}

// Mock companies data with logos and details
const mockCompanies: Company[] = [
  {
    id: "1",
    name: "Pro Process",
    code: "PROPROC",
    contactPerson: "Matthew Smith",
    email: "matthew@proprocess.com",
    phone: "011 234 5678",
    address: "123 Industrial Street, Johannesburg, 2000",
    vatNumber: "4123456789",
    logo: "/lovable-uploads/e1088147-889e-43f6-bdf0-271189b88913.png"
  },
  {
    id: "2",
    name: "XYZ Industries",
    code: "XYZIND",
    contactPerson: "John Doe",
    email: "john@xyzindustries.com",
    phone: "011 987 6543",
    address: "456 Manufacturing Ave, Pretoria, 0001",
    vatNumber: "4987654321"
  }
];

// Mock orders data with all statuses
const mockOrders: Order[] = [
  {
    id: "1",
    orderNumber: "ORD-2024-001",
    companyName: "Pro Process",
    company: mockCompanies[0],
    orderDate: new Date(2024, 0, 15),
    dueDate: new Date(2024, 1, 15),
    status: "in-progress",
    reference: "MATTHEW",
    attention: "Stores",
    progress: 75,
    progressStage: "out-for-delivery",
    items: [
      { id: "1", name: "BOSCH Angle grinder (ZAPPPAAG005)", quantity: 2, delivered: 2, completed: true, description: "Professional angle grinder" },
      { id: "2", name: "Safety Equipment Set", quantity: 1, delivered: 0, completed: false, description: "Complete safety gear package" },
    ]
  },
  {
    id: "2",
    orderNumber: "ORD-2024-002",
    companyName: "XYZ Industries",
    company: mockCompanies[1],
    orderDate: new Date(2024, 0, 20),
    dueDate: new Date(2024, 1, 20),
    status: "processing",
    reference: "JOHN",
    attention: "Warehouse",
    progress: 100,
    progressStage: "completed",
    items: [
      { id: "3", name: "Welding Equipment", quantity: 3, delivered: 3, completed: true, description: "Professional welding equipment set" },
      { id: "4", name: "Safety Helmets", quantity: 25, delivered: 25, completed: true, description: "Industrial safety helmets" },
    ]
  },
  {
    id: "3",
    orderNumber: "ORD-2024-003",
    companyName: "Pro Process",
    company: mockCompanies[0],
    orderDate: new Date(2024, 0, 25),
    dueDate: new Date(2024, 1, 25),
    status: "received",
    reference: "SARAH",
    attention: "Operations",
    progress: 25,
    progressStage: "awaiting-stock",
    items: [
      { id: "5", name: "Industrial Drill Set", quantity: 5, delivered: 0, completed: false, description: "Heavy duty industrial drills" },
      { id: "6", name: "Measurement Tools", quantity: 10, delivered: 0, completed: false, description: "Precision measurement tools" },
    ]
  },
  {
    id: "4",
    orderNumber: "ORD-2024-004",
    companyName: "XYZ Industries",
    company: mockCompanies[1],
    orderDate: new Date(2024, 0, 30),
    dueDate: new Date(2024, 2, 15),
    status: "pending",
    reference: "MICHAEL",
    attention: "Procurement",
    items: [
      { id: "7", name: "Power Supply Units", quantity: 3, delivered: 0, completed: false, description: "Industrial power supply units" },
      { id: "8", name: "Electrical Components", quantity: 50, delivered: 0, completed: false, description: "Various electrical components" },
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
    const random = Math.floor(Math.random() * 100000).toString().padStart(6, '0');
    return random;
  };

  // Create delivery note and auto-fill quantities from progress data
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

  // Generate HTML for delivery note matching the reference format
  const generateDeliveryNoteHTML = () => {
    if (!selectedOrder) return '';
    
    const deliveryNoteNumber = generateDeliveryNoteNumber();
    const deliveryDate = format(new Date(), 'dd/MM/yyyy');
    const company = selectedOrder.company;
    
    return `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Delivery Note ${deliveryNoteNumber}</title>
          <style>
            body { 
              font-family: Arial, sans-serif; 
              margin: 20px; 
              background: white;
            }
            .header { 
              display: flex;
              justify-content: space-between;
              align-items: flex-start;
              margin-bottom: 30px; 
            }
            .logo-section {
              flex: 1;
            }
            .company-name { 
              font-size: 24px; 
              font-weight: bold; 
              color: #1e40af; 
              margin-bottom: 5px;
            }
            .company-tagline {
              font-size: 12px;
              color: #666;
              margin-bottom: 10px;
            }
            .contact-info {
              font-size: 10px;
              line-height: 1.3;
            }
            .client-info {
              font-size: 11px;
              line-height: 1.4;
              margin-top: 15px;
            }
            .client-logo {
              max-width: 80px;
              max-height: 80px;
              margin-bottom: 10px;
            }
            .delivery-note-title { 
              font-size: 16px; 
              font-weight: bold;
              text-align: center;
              border: 2px solid black;
              padding: 8px;
              margin: 20px 0;
            }
            .info-section { 
              margin: 20px 0; 
            }
            .info-row { 
              display: flex; 
              margin: 8px 0; 
            }
            .info-label { 
              font-weight: bold; 
              width: 120px;
              text-decoration: underline;
            }
            .info-value {
              flex: 1;
            }
            .delivery-section {
              margin: 20px 0;
            }
            .date-section {
              text-align: right;
              margin: 20px 0;
            }
            table { 
              width: 100%; 
              border-collapse: collapse; 
              margin: 20px 0; 
            }
            th, td { 
              border: 1px solid black; 
              padding: 8px; 
              text-align: left; 
            }
            th { 
              background-color: #f5f5f5; 
              font-weight: bold; 
              text-align: center;
            }
            .description-col {
              width: 60%;
            }
            .qty-col {
              width: 13%;
              text-align: center;
            }
            .comments-section {
              margin-top: 20px;
            }
            .signature-section {
              margin-top: 30px;
            }
            .signature-line {
              border-bottom: 1px solid black;
              width: 300px;
              height: 30px;
              margin-top: 10px;
            }
          </style>
        </head>
        <body>
          <div class="header">
            <div class="logo-section">
              <div class="company-name">Aleph</div>
              <div class="company-tagline">ENGINEERING & SUPPLIES</div>
              <div class="contact-info">
                Unit F<br>
                4 Skew Road<br>
                Anderbolt<br>
                Boksburg<br>
                needs@alepheng.co.za<br>
                072 887 6908
              </div>
            </div>
            
            ${company?.logo ? `
            <div>
              <img src="${company.logo}" alt="${company.name} Logo" class="client-logo">
              <div class="client-info">
                ${company.name}<br>
                ${company.address.split(',').join('<br>')}<br>
                VAT: ${company.vatNumber}<br>
                Tel: ${company.phone}
              </div>
            </div>
            ` : ''}
          </div>
          
          <div class="delivery-note-title">Delivery Note ${deliveryNoteNumber}</div>
          
          <div class="info-section">
            <div class="info-row">
              <span class="info-label">Delivery To:</span>
              <span class="info-value">${selectedOrder.companyName}</span>
            </div>
            <div class="info-row">
              <span class="info-label">Reference No:</span>
              <span class="info-value">${selectedOrder.reference || 'N/A'}</span>
            </div>
            <div class="info-row">
              <span class="info-label">Att:</span>
              <span class="info-value">${selectedOrder.attention || 'N/A'}</span>
            </div>
          </div>

          <div class="delivery-section">
            <div class="info-row">
              <span class="info-label">Delivery of the following:</span>
            </div>
          </div>

          <div class="date-section">
            <div class="info-row">
              <span style="margin-left: auto;"><span class="info-label">Date:</span> ${deliveryDate}</span>
            </div>
          </div>
          
          <table>
            <thead>
              <tr>
                <th class="description-col">Description</th>
                <th class="qty-col">QTY Ordered</th>
                <th class="qty-col">QTY Delivered</th>
                <th class="qty-col">Balance</th>
              </tr>
            </thead>
            <tbody>
              ${selectedOrder.items.map(item => {
                const delivered = item.delivered || 0;
                const balance = item.quantity - delivered;
                return `
                <tr>
                  <td>${item.name}</td>
                  <td style="text-align: center;">${item.quantity}</td>
                  <td style="text-align: center;">${delivered}</td>
                  <td style="text-align: center;">${balance}</td>
                </tr>
              `}).join('')}
              ${Array.from({length: Math.max(0, 10 - selectedOrder.items.length)}, () => `
                <tr>
                  <td>&nbsp;</td>
                  <td>&nbsp;</td>
                  <td>&nbsp;</td>
                  <td>&nbsp;</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
          
          <div class="comments-section">
            <div class="info-label">COMMENTS:</div>
            <div class="info-row">
              <span class="info-label">Date:</span>
              <div class="signature-line"></div>
            </div>
          </div>

          <div class="signature-section">
            <div class="info-row">
              <span class="info-label">Signature:</span>
              <div class="signature-line"></div>
            </div>
          </div>
        </body>
      </html>
    `;
  };

  // Filter orders based on search term - include all orders instead of just filtered by status
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

      {/* Orders List - showing ALL orders */}
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
              <TableHead>Progress</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredOrders.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-gray-500">
                  No orders found.
                </TableCell>
              </TableRow>
            ) : (
              filteredOrders.map(order => (
                <TableRow key={order.id}>
                  <TableCell className="font-medium">{order.orderNumber}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      {order.company?.logo && (
                        <img 
                          src={order.company.logo} 
                          alt={`${order.companyName} logo`} 
                          className="h-6 w-6 rounded object-cover" 
                        />
                      )}
                      {order.companyName}
                    </div>
                  </TableCell>
                  <TableCell>{format(order.orderDate, 'MMM d, yyyy')}</TableCell>
                  <TableCell>
                    <span className={`px-2 py-1 rounded text-xs font-medium ${
                      order.status === 'completed' ? 'bg-green-100 text-green-800' :
                      order.status === 'in-progress' ? 'bg-blue-100 text-blue-800' :
                      order.status === 'processing' ? 'bg-yellow-100 text-yellow-800' :
                      order.status === 'received' ? 'bg-purple-100 text-purple-800' :
                      'bg-gray-100 text-gray-800'
                    }`}>
                      {order.status.replace('-', ' ')}
                    </span>
                  </TableCell>
                  <TableCell>
                    {order.progressStage && (
                      <span className="text-sm">
                        {order.progressStage === 'awaiting-stock' ? 'Awaiting Stock' :
                        order.progressStage === 'packing' ? 'Packing' :
                        order.progressStage === 'out-for-delivery' ? 'Out for Delivery' :
                        order.progressStage === 'completed' ? 'Completed' : ''}
                      </span>
                    )}
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
            
            <div className="space-y-6 p-4 bg-white border">
              {/* Header section with company details */}
              <div className="flex justify-between items-start">
                <div>
                  <h2 className="text-2xl font-bold text-aleph-blue">Aleph</h2>
                  <p className="text-sm text-gray-600 font-medium">ENGINEERING & SUPPLIES</p>
                  <div className="text-xs mt-2 leading-tight">
                    <div>Unit F</div>
                    <div>4 Skew Road</div>
                    <div>Anderbolt</div>
                    <div>Boksburg</div>
                    <div className="text-blue-600">needs@alepheng.co.za</div>
                    <div>072 887 6908</div>
                  </div>
                </div>

                {selectedOrder.company?.logo && (
                  <div className="text-right">
                    <img 
                      src={selectedOrder.company.logo} 
                      alt={`${selectedOrder.companyName} logo`} 
                      className="h-12 w-auto ml-auto mb-2" 
                    />
                    <div className="text-xs text-right">
                      <div className="font-semibold">{selectedOrder.company.name}</div>
                      {selectedOrder.company.address.split(',').map((line, index) => (
                        <div key={index}>{line.trim()}</div>
                      ))}
                      <div>VAT: {selectedOrder.company.vatNumber}</div>
                      <div>Tel: {selectedOrder.company.phone}</div>
                    </div>
                  </div>
                )}
              </div>
              
              {/* Delivery Note Title */}
              <div className="text-center border-2 border-black p-2">
                <h3 className="text-lg font-bold">Delivery Note {generateDeliveryNoteNumber()}</h3>
              </div>
              
              {/* Order Information */}
              <div className="space-y-2">
                <div className="flex">
                  <span className="font-bold underline w-32">Delivery To:</span>
                  <span>{selectedOrder.companyName}</span>
                </div>
                <div className="flex">
                  <span className="font-bold underline w-32">Reference No:</span>
                  <span>{selectedOrder.reference || 'N/A'}</span>
                </div>
                <div className="flex">
                  <span className="font-bold underline w-32">Att:</span>
                  <span>{selectedOrder.attention || 'N/A'}</span>
                </div>
              </div>

              <div className="flex">
                <span className="font-bold underline">Delivery of the following:</span>
              </div>

              <div className="flex justify-end">
                <div className="flex">
                  <span className="font-bold underline">Date:</span>
                  <span className="ml-2">{format(new Date(), 'dd/MM/yyyy')}</span>
                </div>
              </div>
              
              {/* Items Table - Using quantities from progress tracking */}
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="border border-black text-center font-bold">Description</TableHead>
                    <TableHead className="border border-black text-center font-bold w-24">QTY Ordered</TableHead>
                    <TableHead className="border border-black text-center font-bold w-24">QTY Delivered</TableHead>
                    <TableHead className="border border-black text-center font-bold w-24">Balance</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {selectedOrder.items.map((item) => {
                    const delivered = item.delivered || 0;
                    const balance = item.quantity - delivered;
                    
                    return (
                      <TableRow key={item.id}>
                        <TableCell className="border border-black">{item.name}</TableCell>
                        <TableCell className="border border-black text-center">{item.quantity}</TableCell>
                        <TableCell className="border border-black text-center">{delivered}</TableCell>
                        <TableCell className="border border-black text-center">{balance}</TableCell>
                      </TableRow>
                    );
                  })}
                  {/* Add empty rows to match reference format */}
                  {Array.from({length: Math.max(0, 8 - selectedOrder.items.length)}, (_, index) => (
                    <TableRow key={`empty-${index}`}>
                      <TableCell className="border border-black">&nbsp;</TableCell>
                      <TableCell className="border border-black">&nbsp;</TableCell>
                      <TableCell className="border border-black">&nbsp;</TableCell>
                      <TableCell className="border border-black">&nbsp;</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              {/* Comments and Signature sections */}
              <div className="space-y-4">
                <div>
                  <div className="font-bold underline mb-2">COMMENTS:</div>
                  <div className="flex items-center">
                    <span className="font-bold underline mr-4">Date:</span>
                    <div className="border-b border-black w-64 h-6"></div>
                  </div>
                </div>
                
                <div className="flex items-center">
                  <span className="font-bold underline mr-4">Signature:</span>
                  <div className="border-b border-black w-64 h-8"></div>
                </div>
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
