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
            }
            .header { 
              text-align: center; 
              margin-bottom: 30px; 
              border-bottom: 1px solid #333;
              padding-bottom: 15px;
            }
            .header h1 {
              font-size: 24px;
              margin-bottom: 2px;
              font-weight: bold;
            }
            .header .purchase-order {
              font-size: 12px;
              color: #666;
              margin-bottom: 5px;
            }
            .company-details { 
              display: flex; 
              justify-content: space-between; 
              margin-bottom: 25px;
              gap: 30px;
            }
            .company-section { 
              width: 45%; 
              padding: 15px;
              background-color: #f5f5f5;
              border: 1px solid #ddd;
            }
            .company-title { 
              font-weight: bold; 
              font-size: 12px; 
              margin-bottom: 10px;
            }
            .company-info {
              line-height: 1.5;
              color: #333;
              font-size: 11px;
            }
            .order-info { 
              text-align: center; 
              margin: 25px 0; 
            }
            .order-info div {
              margin-bottom: 5px;
            }
            table { 
              width: 100%; 
              border-collapse: collapse; 
              margin: 20px 0;
            }
            th { 
              background-color: #4a90c2;
              color: white;
              padding: 12px;
              text-align: left;
              font-weight: bold;
              font-size: 12px;
            }
            td { 
              border: 1px solid #ddd; 
              padding: 10px; 
              text-align: left;
            }
            tr:nth-child(even) { 
              background-color: #f9f9f9;
            }
            .signature-section { 
              margin-top: 30px; 
            }
            .signature-section p {
              margin-bottom: 10px;
              font-weight: bold;
            }
            .signature-line { 
              border-bottom: 1px solid #333; 
              width: 120px; 
              height: 15px; 
              margin: 5px 10px;
              display: inline-block;
            }
            .signature-row {
              display: flex;
              justify-content: space-between;
              margin-top: 15px;
            }
            .signature-item {
              text-align: center;
              font-size: 10px;
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
            <h1>${orderToPrint.order_number}</h1>
            <p class="purchase-order">Purchase Order</p>
          </div>

          <div class="company-details">
            <div class="company-section">
              <div class="company-title">FROM:</div>
              <div class="company-info">
                <strong>${companyDetails?.name || orderToPrint.companyName || clientCompany?.name || 'Client Company'}</strong><br>
                ${companyDetails?.address || clientCompany?.address || 'Address not available'}<br>
                Phone: ${companyDetails?.phone || clientCompany?.phone || 'N/A'}<br>
                Email: ${companyDetails?.email || clientCompany?.email || 'N/A'}<br>
                Contact: ${companyDetails?.contact_person || clientCompany?.contactPerson || 'N/A'}<br>
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
            <div><strong>Order Date:</strong> ${new Date(orderToPrint.created_at).toLocaleDateString()}</div>
            <div><strong>Status:</strong> ${orderToPrint.status || 'pending'}</div>
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
            <p>Client Sign-off:</p>
            <div class="signature-row">
              <div class="signature-item">
                <div class="signature-line"></div>
                <div>Signature</div>
              </div>
              <div class="signature-item">
                <div class="signature-line"></div>
                <div>Date</div>
              </div>
              <div class="signature-item">
                <div class="signature-line"></div>
                <div>Print Name</div>
              </div>
            </div>
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
      
      // Header - swapped order number and purchase order
      doc.setFontSize(20);
      doc.text(orderToExport.order_number, 105, 20, { align: 'center' });
      doc.setFontSize(10);
      doc.text('Purchase Order', 105, 28, { align: 'center' });
      
      // Add line under header
      doc.line(20, 35, 190, 35);
      
      // Company details with light grey blocks
      // FROM block (Client)
      doc.setFillColor(245, 245, 245);
      doc.rect(20, 45, 75, 50, 'F');
      doc.setDrawColor(221, 221, 221);
      doc.rect(20, 45, 75, 50, 'S');
      
      doc.setFontSize(10);
      doc.text('FROM:', 25, 55);
      doc.setFontSize(9);
      doc.text(companyDetails?.name || orderToExport.companyName || clientCompany?.name || 'Client Company', 25, 63);
      
      const fromLines = [
        companyDetails?.address || clientCompany?.address || 'Address not available',
        `Phone: ${companyDetails?.phone || clientCompany?.phone || 'N/A'}`,
        `Email: ${companyDetails?.email || clientCompany?.email || 'N/A'}`,
        `Contact: ${companyDetails?.contact_person || clientCompany?.contactPerson || 'N/A'}`
      ];
      if (companyDetails?.vat_number) {
        fromLines.push(`VAT: ${companyDetails.vat_number}`);
      }
      if (companyDetails?.account_manager) {
        fromLines.push(`Account Manager: ${companyDetails.account_manager}`);
      }
      
      let yPosition = 70;
      fromLines.forEach(line => {
        doc.text(line, 25, yPosition);
        yPosition += 5;
      });
      
      // TO block (Aleph)
      doc.setFillColor(245, 245, 245);
      doc.rect(105, 45, 75, 50, 'F');
      doc.setDrawColor(221, 221, 221);
      doc.rect(105, 45, 75, 50, 'S');
      
      doc.setFontSize(10);
      doc.text('TO:', 110, 55);
      doc.setFontSize(9);
      doc.text(adminCompany.name, 110, 63);
      
      const toLines = [
        adminCompany.address,
        `Phone: ${adminCompany.phone}`,
        `Email: ${adminCompany.email}`,
        `Contact: ${adminCompany.contactPerson}`
      ];
      
      yPosition = 70;
      toLines.forEach(line => {
        doc.text(line, 110, yPosition);
        yPosition += 5;
      });
      
      // Order info - centered
      doc.setFontSize(10);
      doc.text(`Order Date: ${new Date(orderToExport.created_at).toLocaleDateString()}`, 105, 110, { align: 'center' });
      doc.text(`Status: ${orderToExport.status || 'pending'}`, 105, 118, { align: 'center' });
      
      // Items table with blue header
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
          cellPadding: 4,
        },
        headStyles: {
          fillColor: [74, 144, 194], // Blue color matching the reference
          textColor: 255,
          fontStyle: 'bold',
        },
        alternateRowStyles: {
          fillColor: [249, 249, 249],
        },
        columnStyles: {
          0: { cellWidth: 80 },
          1: { cellWidth: 30, halign: 'center' },
          2: { cellWidth: 30, halign: 'center' },
          3: { cellWidth: 50 }
        }
      });

      // Signature section
      const finalY = (doc as any).lastAutoTable.finalY + 20;
      doc.setFontSize(10);
      doc.text('Client Sign-off:', 20, finalY);
      
      // Signature lines
      doc.line(20, finalY + 15, 70, finalY + 15);
      doc.line(85, finalY + 15, 125, finalY + 15);
      doc.line(140, finalY + 15, 180, finalY + 15);
      
      doc.setFontSize(8);
      doc.text('Signature', 45, finalY + 20, { align: 'center' });
      doc.text('Date', 105, finalY + 20, { align: 'center' });
      doc.text('Print Name', 160, finalY + 20, { align: 'center' });
      
      // Footer
      doc.setFontSize(8);
      doc.text(`Generated on: ${new Date().toLocaleDateString()} | ${adminCompany.name}`, 105, 280, { align: 'center' });

      // Convert PDF to blob
      const pdfBlob = doc.output('blob');
      const fileName = `order-${orderToExport.order_number}-${new Date().getTime()}.pdf`;
      
      // Use the File System Access API if available, otherwise fallback to download
      if ('showSaveFilePicker' in window) {
        try {
          const fileHandle = await (window as any).showSaveFilePicker({
            suggestedName: fileName,
            types: [{
              description: 'PDF files',
              accept: { 'application/pdf': ['.pdf'] }
            }]
          });
          
          const writable = await fileHandle.createWritable();
          await writable.write(pdfBlob);
          await writable.close();
        } catch (err) {
          // User cancelled the save dialog
          if ((err as Error).name !== 'AbortError') {
            console.error('Error saving file:', err);
            // Fallback to download
            const url = URL.createObjectURL(pdfBlob);
            const link = document.createElement('a');
            link.href = url;
            link.download = fileName;
            link.style.display = 'none';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
          }
        }
      } else {
        // Fallback for browsers that don't support File System Access API
        const url = URL.createObjectURL(pdfBlob);
        const link = document.createElement('a');
        link.href = url;
        link.download = fileName;
        link.style.display = 'none';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      }
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

      // Convert PDF to blob
      const pdfBlob = doc.output('blob');
      const fileName = `${title.toLowerCase().replace(/\s+/g, '-')}-${new Date().getTime()}.pdf`;
      
      // Use the File System Access API if available, otherwise fallback to download
      if ('showSaveFilePicker' in window) {
        try {
          const fileHandle = await (window as any).showSaveFilePicker({
            suggestedName: fileName,
            types: [{
              description: 'PDF files',
              accept: { 'application/pdf': ['.pdf'] }
            }]
          });
          
          const writable = await fileHandle.createWritable();
          await writable.write(pdfBlob);
          await writable.close();
        } catch (err) {
          // User cancelled the save dialog
          if ((err as Error).name !== 'AbortError') {
            console.error('Error saving file:', err);
            // Fallback to download
            const url = URL.createObjectURL(pdfBlob);
            const link = document.createElement('a');
            link.href = url;
            link.download = fileName;
            link.style.display = 'none';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
          }
        }
      } else {
        // Fallback for browsers that don't support File System Access API
        const url = URL.createObjectURL(pdfBlob);
        const link = document.createElement('a');
        link.href = url;
        link.download = fileName;
        link.style.display = 'none';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      }
    } catch (error) {
      console.error('Error generating PDF:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleExportExcel = async () => {
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

      // Generate blob
      const excelBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
      const excelBlob = new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const fileName = `${title.toLowerCase().replace(/\s+/g, '-')}-${new Date().getTime()}.xlsx`;
      
      // Use the File System Access API if available, otherwise fallback to download
      if ('showSaveFilePicker' in window) {
        try {
          const fileHandle = await (window as any).showSaveFilePicker({
            suggestedName: fileName,
            types: [{
              description: 'Excel files',
              accept: { 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'] }
            }]
          });
          
          const writable = await fileHandle.createWritable();
          await writable.write(excelBlob);
          await writable.close();
        } catch (err) {
          // User cancelled the save dialog
          if ((err as Error).name !== 'AbortError') {
            console.error('Error saving file:', err);
            // Fallback to download
            const url = URL.createObjectURL(excelBlob);
            const link = document.createElement('a');
            link.href = url;
            link.download = fileName;
            link.style.display = 'none';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
          }
        }
      } else {
        // Fallback for browsers that don't support File System Access API
        const url = URL.createObjectURL(excelBlob);
        const link = document.createElement('a');
        link.href = url;
        link.download = fileName;
        link.style.display = 'none';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      }
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
            Save as PDF
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
          Save as PDF
        </DropdownMenuItem>
        <DropdownMenuItem onClick={handleExportExcel}>
          <Sheet className="h-4 w-4 mr-2" />
          Save as Excel
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
