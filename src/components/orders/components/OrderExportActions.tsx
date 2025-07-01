
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

interface Order {
  id: string;
  order_number: string;
  description: string | null;
  status: string | null;
  total_amount: number | null;
  created_at: string;
  company_id: string | null;
  companyName?: string;
}

interface OrderExportActionsProps {
  orders: Order[];
  title?: string;
}

export default function OrderExportActions({ orders, title = "Orders" }: OrderExportActionsProps) {
  const [loading, setLoading] = useState(false);

  const handlePrint = () => {
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

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" disabled={loading || orders.length === 0}>
          <Download className="h-4 w-4 mr-2" />
          Export ({orders.length})
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
