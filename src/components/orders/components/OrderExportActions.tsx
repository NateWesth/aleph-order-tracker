import { useState } from "react";
import { Button } from "@/components/ui/button";
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuTrigger 
} from "@/components/ui/dropdown-menu";
import { Download, Printer, FileText, Sheet } from "lucide-react";
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';

interface OrderItem {
  id: string;
  name: string;
  quantity: number;
  delivered?: number;
}

interface Order {
  id: string;
  order_number: string;
  description: string | null;
  status: string | null;
  total_amount: number | null;
  created_at: string;
  company_id: string | null;
  companyName?: string;
  items?: OrderItem[];
}

interface OrderExportActionsProps {
  orders?: Order[];
  order?: Order;
  title?: string;
  clientCompany?: {
    name: string;
    address: string;
    phone: string;
    email: string;
    contactPerson: string;
  };
}

export default function OrderExportActions({ 
  orders, 
  order, 
  title = "Orders",
  clientCompany 
}: OrderExportActionsProps) {
  const [loading, setLoading] = useState(false);

  // Default admin company details
  const adminCompany = {
    name: "Aleph Engineering and Supplies",
    address: "123 Industrial Avenue, Cape Town, South Africa",
    phone: "+27 21 123 4567",
    email: "info@alephengineering.co.za",
    contactPerson: "Operations Manager"
  };

  const parseOrderItems = (description: string | null): OrderItem[] => {
    if (!description) return [];
    
    return description.split('\n').map((line, index) => {
      const match = line.match(/^(.+?)\s*\(Qty:\s*(\d+)\)$/);
      if (match) {
        return {
          id: `item-${index}`,
          name: match[1].trim(),
          quantity: parseInt(match[2])
        };
      }
      return {
        id: `item-${index}`,
        name: line.trim(),
        quantity: 1
      };
    }).filter(item => item.name);
  };

  const handlePrintSingleOrder = (orderToPrint: Order) => {
    const items = orderToPrint.items || parseOrderItems(orderToPrint.description);
    
    const printContent = `
      <html>
        <head>
          <title>Order ${orderToPrint.order_number}</title>
          <style>
            @page { size: A4; margin: 20mm; }
            body { 
              font-family: Arial, sans-serif; 
              margin: 0; 
              padding: 0;
              font-size: 12px;
              line-height: 1.4;
            }
            .header { 
              text-align: center; 
              margin-bottom: 30px; 
              border-bottom: 2px solid #333;
              padding-bottom: 20px;
            }
            .company-details { 
              display: flex; 
              justify-content: space-between; 
              margin-bottom: 30px;
            }
            .company-section { 
              width: 45%; 
              padding: 15px;
              border: 1px solid #ddd;
              border-radius: 5px;
            }
            .company-title { 
              font-weight: bold; 
              font-size: 14px; 
              margin-bottom: 10px;
              color: #333;
            }
            .order-info { 
              text-align: center; 
              margin: 30px 0; 
              padding: 15px;
              background-color: #f5f5f5;
              border-radius: 5px;
            }
            table { 
              width: 100%; 
              border-collapse: collapse; 
              margin: 20px 0;
            }
            th, td { 
              border: 1px solid #ddd; 
              padding: 12px 8px; 
              text-align: left;
            }
            th { 
              background-color: #f2f2f2; 
              font-weight: bold;
              font-size: 13px;
            }
            tr:nth-child(even) { 
              background-color: #f9f9f9; 
            }
            .signature-section { 
              margin-top: 50px; 
              padding: 20px;
              border: 1px solid #ddd;
              border-radius: 5px;
            }
            .signature-line { 
              border-bottom: 1px solid #333; 
              width: 300px; 
              height: 40px; 
              margin: 20px 0;
            }
            .footer { 
              text-align: center; 
              margin-top: 30px; 
              font-size: 10px;
              color: #666;
            }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>PURCHASE ORDER</h1>
            <p>Order #${orderToPrint.order_number}</p>
          </div>

          <div class="company-details">
            <div class="company-section">
              <div class="company-title">FROM:</div>
              <strong>${clientCompany?.name || orderToPrint.companyName || 'Client Company'}</strong><br>
              ${clientCompany?.address || 'Client Address'}<br>
              Phone: ${clientCompany?.phone || 'N/A'}<br>
              Email: ${clientCompany?.email || 'N/A'}<br>
              Contact: ${clientCompany?.contactPerson || 'N/A'}
            </div>
            
            <div class="company-section">
              <div class="company-title">TO:</div>
              <strong>${adminCompany.name}</strong><br>
              ${adminCompany.address}<br>
              Phone: ${adminCompany.phone}<br>
              Email: ${adminCompany.email}<br>
              Contact: ${adminCompany.contactPerson}
            </div>
          </div>

          <div class="order-info">
            <strong>Order Date:</strong> ${new Date(orderToPrint.created_at).toLocaleDateString()}<br>
            <strong>Status:</strong> ${orderToPrint.status || 'Pending'}
          </div>

          <table>
            <thead>
              <tr>
                <th>Item Description</th>
                <th>Quantity</th>
                <th>Unit</th>
                <th>Notes</th>
              </tr>
            </thead>
            <tbody>
              ${items.map(item => `
                <tr>
                  <td>${item.name}</td>
                  <td>${item.quantity}</td>
                  <td>Each</td>
                  <td></td>
                </tr>
              `).join('')}
            </tbody>
          </table>

          <div class="signature-section">
            <p><strong>Client Sign-off:</strong></p>
            <p>I acknowledge receipt and approve this order as specified above.</p>
            <br>
            <div class="signature-line"></div>
            <p>Signature: _________________________ Date: _____________</p>
            <br>
            <p>Print Name: _________________________</p>
            <p>Position: ___________________________</p>
          </div>

          <div class="footer">
            <p>Generated on: ${new Date().toLocaleDateString()} | ${adminCompany.name}</p>
          </div>
        </body>
      </html>
    `;

    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(printContent);
      printWindow.document.close();
      printWindow.focus();
      printWindow.print();
    }
  };

  const handleExportSingleOrderPDF = async (orderToExport: Order) => {
    setLoading(true);
    try {
      const doc = new jsPDF();
      const items = orderToExport.items || parseOrderItems(orderToExport.description);
      
      // Header
      doc.setFontSize(18);
      doc.text('PURCHASE ORDER', 105, 20, { align: 'center' });
      doc.setFontSize(12);
      doc.text(`Order #${orderToExport.order_number}`, 105, 30, { align: 'center' });
      
      // Company details
      doc.setFontSize(10);
      doc.text('FROM:', 20, 50);
      doc.setFontSize(11);
      doc.text(clientCompany?.name || orderToExport.companyName || 'Client Company', 20, 60);
      doc.setFontSize(9);
      doc.text(clientCompany?.address || 'Client Address', 20, 68);
      doc.text(`Phone: ${clientCompany?.phone || 'N/A'}`, 20, 76);
      doc.text(`Email: ${clientCompany?.email || 'N/A'}`, 20, 84);
      doc.text(`Contact: ${clientCompany?.contactPerson || 'N/A'}`, 20, 92);
      
      doc.setFontSize(10);
      doc.text('TO:', 110, 50);
      doc.setFontSize(11);
      doc.text(adminCompany.name, 110, 60);
      doc.setFontSize(9);
      doc.text(adminCompany.address, 110, 68);
      doc.text(`Phone: ${adminCompany.phone}`, 110, 76);
      doc.text(`Email: ${adminCompany.email}`, 110, 84);
      doc.text(`Contact: ${adminCompany.contactPerson}`, 110, 92);
      
      // Order info
      doc.setFontSize(10);
      doc.text(`Order Date: ${new Date(orderToExport.created_at).toLocaleDateString()}`, 20, 110);
      doc.text(`Status: ${orderToExport.status || 'Pending'}`, 20, 118);
      
      // Items table
      const tableData = items.map(item => [
        item.name,
        item.quantity.toString(),
        'Each',
        ''
      ]);

      autoTable(doc, {
        head: [['Item Description', 'Quantity', 'Unit', 'Notes']],
        body: tableData,
        startY: 130,
        styles: {
          fontSize: 9,
          cellPadding: 3,
        },
        headStyles: {
          fillColor: [41, 128, 185],
          textColor: 255,
          fontStyle: 'bold',
        },
        alternateRowStyles: {
          fillColor: [245, 245, 245],
        },
      });

      // Signature section
      const finalY = (doc as any).lastAutoTable.finalY + 20;
      doc.setFontSize(11);
      doc.text('Client Sign-off:', 20, finalY);
      doc.setFontSize(9);
      doc.text('I acknowledge receipt and approve this order as specified above.', 20, finalY + 10);
      
      doc.line(20, finalY + 30, 120, finalY + 30);
      doc.text('Signature: _________________________ Date: _____________', 20, finalY + 40);
      doc.text('Print Name: _________________________', 20, finalY + 50);
      doc.text('Position: ___________________________', 20, finalY + 60);
      
      // Footer
      doc.setFontSize(8);
      doc.text(`Generated on: ${new Date().toLocaleDateString()} | ${adminCompany.name}`, 105, 280, { align: 'center' });

      // Save the PDF
      doc.save(`order-${orderToExport.order_number}-${new Date().getTime()}.pdf`);
    } catch (error) {
      console.error('Error generating PDF:', error);
    } finally {
      setLoading(false);
    }
  };

  const handlePrint = () => {
    if (!orders) return;
    
    const printContent = `
      <html>
        <head>
          <title>${title}</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 20px; }
            h1 { color: #333; margin-bottom: 20px; }
            table { width: 100%; border-collapse: collapse; margin-top: 20px; }
            th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
            th { background-color: #f2f2f2; font-weight: bold; }
            tr:nth-child(even) { background-color: #f9f9f9; }
            .status { padding: 4px 8px; border-radius: 4px; font-size: 12px; }
            .status-pending { background-color: #fef3c7; color: #92400e; }
            .status-received { background-color: #e0e7ff; color: #3730a3; }
            .status-processing { background-color: #ddd6fe; color: #5b21b6; }
            .status-completed { background-color: #d1fae5; color: #065f46; }
          </style>
        </head>
        <body>
          <h1>${title}</h1>
          <p>Generated on: ${new Date().toLocaleDateString()}</p>
          <table>
            <thead>
              <tr>
                <th>Order Number</th>
                <th>Company</th>
                <th>Status</th>
                <th>Created Date</th>
                <th>Total Amount</th>
              </tr>
            </thead>
            <tbody>
              ${orders.map(order => `
                <tr>
                  <td>${order.order_number}</td>
                  <td>${order.companyName || 'No Company'}</td>
                  <td><span class="status status-${order.status || 'pending'}">${order.status || 'pending'}</span></td>
                  <td>${new Date(order.created_at).toLocaleDateString()}</td>
                  <td>${order.total_amount ? `$${order.total_amount.toFixed(2)}` : 'N/A'}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </body>
      </html>
    `;

    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(printContent);
      printWindow.document.close();
      printWindow.focus();
      printWindow.print();
    }
  };

  const handleExportPDF = async () => {
    if (!orders) return;
    
    setLoading(true);
    try {
      const doc = new jsPDF();
      
      // Add title
      doc.setFontSize(18);
      doc.text(title, 20, 20);
      
      // Add generation date
      doc.setFontSize(10);
      doc.text(`Generated on: ${new Date().toLocaleDateString()}`, 20, 30);

      // Prepare table data
      const tableData = orders.map(order => [
        order.order_number,
        order.companyName || 'No Company',
        order.status || 'pending',
        new Date(order.created_at).toLocaleDateString(),
        order.total_amount ? `$${order.total_amount.toFixed(2)}` : 'N/A'
      ]);

      // Add table
      autoTable(doc, {
        head: [['Order Number', 'Company', 'Status', 'Created Date', 'Total Amount']],
        body: tableData,
        startY: 40,
        styles: {
          fontSize: 9,
          cellPadding: 3,
        },
        headStyles: {
          fillColor: [41, 128, 185],
          textColor: 255,
          fontStyle: 'bold',
        },
        alternateRowStyles: {
          fillColor: [245, 245, 245],
        },
      });

      // Save the PDF
      doc.save(`${title.toLowerCase().replace(/\s+/g, '-')}-${new Date().getTime()}.pdf`);
    } catch (error) {
      console.error('Error generating PDF:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleExportExcel = () => {
    if (!orders) return;
    
    setLoading(true);
    try {
      // Prepare data for Excel
      const excelData = orders.map(order => ({
        'Order Number': order.order_number,
        'Company': order.companyName || 'No Company',
        'Status': order.status || 'pending',
        'Created Date': new Date(order.created_at).toLocaleDateString(),
        'Total Amount': order.total_amount || 0,
        'Description': order.description || ''
      }));

      // Create workbook and worksheet
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.json_to_sheet(excelData);

      // Auto-size columns
      const colWidths = [
        { wch: 15 }, // Order Number
        { wch: 20 }, // Company
        { wch: 12 }, // Status
        { wch: 15 }, // Created Date
        { wch: 15 }, // Total Amount
        { wch: 30 }, // Description
      ];
      ws['!cols'] = colWidths;

      // Add worksheet to workbook
      XLSX.utils.book_append_sheet(wb, ws, title);

      // Save the file
      XLSX.writeFile(wb, `${title.toLowerCase().replace(/\s+/g, '-')}-${new Date().getTime()}.xlsx`);
    } catch (error) {
      console.error('Error generating Excel file:', error);
    } finally {
      setLoading(false);
    }
  };

  // Single order export
  if (order) {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" disabled={loading}>
            <Printer className="h-4 w-4 mr-2" />
            Print Order
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => handlePrintSingleOrder(order)}>
            <Printer className="h-4 w-4 mr-2" />
            Print Order
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => handleExportSingleOrderPDF(order)}>
            <FileText className="h-4 w-4 mr-2" />
            Export as PDF
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  // Bulk orders export
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" disabled={loading || !orders || orders.length === 0}>
          <Download className="h-4 w-4 mr-2" />
          Export ({orders?.length || 0})
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={handlePrint}>
          <Printer className="h-4 w-4 mr-2" />
          Print
        </DropdownMenuItem>
        <DropdownMenuItem onClick={handleExportPDF}>
          <FileText className="h-4 w-4 mr-2" />
          Export as PDF
        </DropdownMenuItem>
        <DropdownMenuItem onClick={handleExportExcel}>
          <Sheet className="h-4 w-4 mr-2" />
          Export as Excel
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
