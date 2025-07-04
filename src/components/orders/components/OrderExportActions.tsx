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
import { supabase } from "@/integrations/supabase/client";

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

interface Company {
  id: string;
  name: string;
  contact_person: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  vat_number: string | null;
  account_manager: string | null;
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

  const adminCompany = {
    name: "Aleph Engineering and Supplies",
    address: "Unit F, Maritz and Donley Properties, 4 Skew Road, Anderbolt, Boksburg, 1459",
    phone: "+27 72 887 6908 / +27 63 609 7571",
    email: "admin@alepheng.co.za",
    contactPerson: "Neels Van Der Westhuizen"
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

  const fetchCompanyDetails = async (companyId: string): Promise<Company | null> => {
    try {
      const { data, error } = await supabase
        .from('companies')
        .select('*')
        .eq('id', companyId)
        .single();

      if (error) {
        console.error('Error fetching company details:', error);
        return null;
      }

      return data;
    } catch (error) {
      console.error('Error fetching company details:', error);
      return null;
    }
  };

  const handlePrintSingleOrder = async (orderToPrint: Order) => {
    setLoading(true);
    
    // Fetch company details if company_id exists
    let companyDetails: Company | null = null;
    if (orderToPrint.company_id) {
      companyDetails = await fetchCompanyDetails(orderToPrint.company_id);
    }

    // Parse items from description if not already provided
    const items = orderToPrint.items && orderToPrint.items.length > 0 
      ? orderToPrint.items 
      : parseOrderItems(orderToPrint.description);
    
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
              background: linear-gradient(135deg, #fef7ff 0%, #f8fafc 100%);
            }
            .header { 
              text-align: center; 
              margin-bottom: 30px; 
              border-bottom: 3px solid #3b82f6;
              padding-bottom: 20px;
              background: linear-gradient(135deg, #1e40af 0%, #3b82f6 100%);
              color: white;
              padding: 20px;
              border-radius: 8px;
              box-shadow: 0 4px 6px rgba(0,0,0,0.1);
            }
            .header h1 {
              font-size: 28px;
              margin-bottom: 10px;
              text-shadow: 0 2px 4px rgba(0,0,0,0.3);
            }
            .header .order-number {
              font-size: 22px;
              font-weight: bold;
              color: #fbbf24;
              text-shadow: 0 1px 2px rgba(0,0,0,0.2);
            }
            .company-details { 
              display: flex; 
              justify-content: space-between; 
              margin-bottom: 30px;
              gap: 20px;
            }
            .company-section { 
              width: 45%; 
              padding: 15px;
              border: 1px solid #e2e8f0;
              border-radius: 8px;
              background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%);
              box-shadow: 0 2px 4px rgba(0,0,0,0.05);
            }
            .company-title { 
              font-weight: bold; 
              font-size: 14px; 
              margin-bottom: 15px;
              color: #1e40af;
              text-decoration: underline;
              text-transform: uppercase;
            }
            .company-info {
              line-height: 1.6;
              color: #374151;
              font-weight: 500;
            }
            .order-info { 
              text-align: center; 
              margin: 30px 0; 
              padding: 15px;
              background: linear-gradient(135deg, #dbeafe 0%, #bfdbfe 100%);
              border-radius: 8px;
              border: 2px solid #3b82f6;
              color: #1e40af;
              font-weight: bold;
            }
            table { 
              width: 100%; 
              border-collapse: collapse; 
              margin: 20px 0;
              box-shadow: 0 4px 6px rgba(0,0,0,0.1);
              border-radius: 8px;
              overflow: hidden;
            }
            th, td { 
              border: 1px solid #e2e8f0; 
              padding: 12px; 
              text-align: left;
            }
            th { 
              background: linear-gradient(135deg, #1e40af 0%, #3b82f6 100%);
              color: white;
              font-weight: bold;
              font-size: 12px;
              text-transform: uppercase;
            }
            tr:nth-child(even) { 
              background: linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%);
            }
            tr:nth-child(odd) { 
              background-color: white;
            }
            .signature-section { 
              margin-top: 20px; 
              padding: 15px;
              border: 2px solid #10b981;
              border-radius: 8px;
              background: linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%);
            }
            .signature-line { 
              border-bottom: 2px solid #059669; 
              width: 150px; 
              height: 15px; 
              margin: 5px 0;
              display: inline-block;
            }
            .footer { 
              text-align: center; 
              margin-top: 20px; 
              font-size: 10px;
              color: #6b7280;
              padding: 10px;
              background: linear-gradient(135deg, #f3f4f6 0%, #e5e7eb 100%);
              border-radius: 4px;
            }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>PURCHASE ORDER</h1>
            <p class="order-number">Order #${orderToPrint.order_number}</p>
          </div>

          <div class="company-details">
            <div class="company-section">
              <div class="company-title">FROM:</div>
              <div class="company-info">
                <strong>${companyDetails?.name || orderToPrint.companyName || 'Client Company'}</strong><br>
                ${companyDetails?.address || 'Address not available'}<br>
                Phone: ${companyDetails?.phone || 'N/A'}<br>
                Email: ${companyDetails?.email || 'N/A'}<br>
                Contact: ${companyDetails?.contact_person || 'N/A'}<br>
                ${companyDetails?.vat_number ? `VAT: ${companyDetails.vat_number}<br>` : ''}
                ${companyDetails?.account_manager ? `Account Manager: ${companyDetails.account_manager}` : ''}
              </div>
            </div>
            
            <div class="company-section">
              <div class="company-title">TO:</div>
              <div class="company-info">
                <strong>${adminCompany.name}</strong><br>
                ${adminCompany.address}<br>
                Phone: ${adminCompany.phone}<br>
                Email: ${adminCompany.email}<br>
                Contact: ${adminCompany.contactPerson}
              </div>
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
            <p>Signature: <span class="signature-line"></span> Date: <span class="signature-line"></span></p>
            <p>Print Name: <span class="signature-line"></span></p>
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
    
    setLoading(false);
  };

  const handleExportSingleOrderPDF = async (orderToExport: Order) => {
    setLoading(true);
    try {
      const doc = new jsPDF();
      
      // Fetch company details if company_id exists
      let companyDetails: Company | null = null;
      if (orderToExport.company_id) {
        companyDetails = await fetchCompanyDetails(orderToExport.company_id);
      }
      
      // Parse items from description if not already provided
      const items = orderToExport.items && orderToExport.items.length > 0 
        ? orderToExport.items 
        : parseOrderItems(orderToExport.description);
      
      // Header with blue background
      doc.setFillColor(30, 64, 175); // Blue background
      doc.rect(0, 0, 210, 40, 'F'); // Full width blue header
      
      doc.setTextColor(255, 255, 255); // White text
      doc.setFontSize(20);
      doc.text('PURCHASE ORDER', 105, 20, { align: 'center' });
      doc.setFontSize(16);
      doc.setTextColor(251, 191, 36); // Yellow/gold color for order number
      doc.text(`Order #${orderToExport.order_number}`, 105, 30, { align: 'center' });
      
      // Company details with light grey blocks
      // FROM block (Client) - Light grey background
      doc.setFillColor(248, 250, 252); // Very light grey
      doc.rect(15, 45, 85, 65, 'F'); // Filled rectangle
      doc.setDrawColor(226, 232, 240); // Light grey border
      doc.rect(15, 45, 85, 65); // Border
      
      doc.setFontSize(10);
      doc.setTextColor(30, 64, 175); // Blue text
      doc.text('FROM:', 20, 55);
      doc.setFontSize(11);
      doc.setTextColor(31, 41, 55); // Dark gray text
      doc.text(companyDetails?.name || orderToExport.companyName || 'Client Company', 20, 65);
      doc.setFontSize(9);
      const fromLines = [
        companyDetails?.address || 'Address not available',
        `Phone: ${companyDetails?.phone || 'N/A'}`,
        `Email: ${companyDetails?.email || 'N/A'}`,
        `Contact: ${companyDetails?.contact_person || 'N/A'}`
      ];
      if (companyDetails?.vat_number) {
        fromLines.push(`VAT: ${companyDetails.vat_number}`);
      }
      if (companyDetails?.account_manager) {
        fromLines.push(`Account Manager: ${companyDetails.account_manager}`);
      }
      
      let yPosition = 73;
      fromLines.forEach(line => {
        doc.text(line, 20, yPosition);
        yPosition += 6;
      });
      
      // TO block (Aleph) - Light grey background
      doc.setFillColor(248, 250, 252); // Very light grey
      doc.rect(110, 45, 85, 65, 'F'); // Filled rectangle
      doc.setDrawColor(226, 232, 240); // Light grey border
      doc.rect(110, 45, 85, 65); // Border
      
      doc.setFontSize(10);
      doc.setTextColor(30, 64, 175); // Blue text
      doc.text('TO:', 115, 55);
      doc.setFontSize(11);
      doc.setTextColor(31, 41, 55); // Dark gray text
      doc.text(adminCompany.name, 115, 65);
      doc.setFontSize(9);
      const toLines = [
        adminCompany.address,
        `Phone: ${adminCompany.phone}`,
        `Email: ${adminCompany.email}`,
        `Contact: ${adminCompany.contactPerson}`
      ];
      
      yPosition = 73;
      toLines.forEach(line => {
        doc.text(line, 115, yPosition);
        yPosition += 6;
      });
      
      // Order info with colored background
      doc.setFillColor(219, 234, 254); // Light blue background
      doc.rect(15, 120, 180, 20, 'F');
      doc.setDrawColor(59, 130, 246); // Blue border
      doc.rect(15, 120, 180, 20);
      
      doc.setTextColor(30, 64, 175); // Blue text
      doc.setFontSize(11);
      doc.text(`Order Date: ${new Date(orderToExport.created_at).toLocaleDateString()}`, 20, 128);
      doc.text(`Status: ${orderToExport.status || 'Pending'}`, 20, 135);
      
      // Reset text color for the rest of the document
      doc.setTextColor(0, 0, 0);
      
      // Items table with colorful styling
      const tableData = items.map(item => [
        item.name,
        item.quantity.toString(),
        'Each',
        ''
      ]);

      autoTable(doc, {
        head: [['Item Description', 'Quantity', 'Unit', 'Notes']],
        body: tableData,
        startY: 150,
        styles: {
          fontSize: 9,
          cellPadding: 4,
        },
        headStyles: {
          fillColor: [30, 64, 175], // Blue header
          textColor: 255,
          fontStyle: 'bold',
        },
        alternateRowStyles: {
          fillColor: [240, 249, 255], // Light blue alternating rows
        },
        columnStyles: {
          0: { cellWidth: 80 },
          1: { cellWidth: 30, halign: 'center' },
          2: { cellWidth: 30, halign: 'center' },
          3: { cellWidth: 50 }
        }
      });

      // Colorful signature section
      const finalY = (doc as any).lastAutoTable.finalY + 15;
      doc.setFillColor(236, 253, 245); // Light green background
      doc.rect(15, finalY - 5, 180, 25, 'F');
      doc.setDrawColor(16, 185, 129); // Green border
      doc.rect(15, finalY - 5, 180, 25);
      
      doc.setTextColor(22, 101, 52); // Green text
      doc.setFontSize(11);
      doc.text('Client Sign-off:', 20, finalY + 5);
      
      doc.setDrawColor(5, 150, 105); // Green lines
      doc.line(20, finalY + 15, 80, finalY + 15);
      doc.line(90, finalY + 15, 130, finalY + 15);
      doc.line(140, finalY + 15, 190, finalY + 15);
      doc.setFontSize(8);
      doc.setTextColor(0, 0, 0);
      doc.text('Signature', 20, finalY + 20);
      doc.text('Date', 90, finalY + 20);
      doc.text('Print Name', 140, finalY + 20);
      
      // Colorful footer
      doc.setFillColor(243, 244, 246); // Light grey background
      doc.rect(0, 270, 210, 15, 'F');
      doc.setFontSize(8);
      doc.setTextColor(107, 114, 128); // Grey text
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
