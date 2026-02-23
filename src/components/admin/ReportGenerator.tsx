import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { FileText, Download, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { format, subMonths, startOfMonth, endOfMonth, isWithinInterval } from "date-fns";

const MONTHS = Array.from({ length: 12 }, (_, i) => {
  const d = subMonths(new Date(), i);
  return { value: format(d, "yyyy-MM"), label: format(d, "MMMM yyyy") };
});

export default function ReportGenerator() {
  const [open, setOpen] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState(MONTHS[0].value);
  const [reportType, setReportType] = useState<"summary" | "client" | "supplier">("summary");
  const [generating, setGenerating] = useState(false);
  const { toast } = useToast();

  const generateReport = async () => {
    setGenerating(true);
    try {
      const [year, month] = selectedMonth.split("-").map(Number);
      const rangeStart = startOfMonth(new Date(year, month - 1));
      const rangeEnd = endOfMonth(new Date(year, month - 1));

      // Fetch data
      const [ordersRes, companiesRes, suppliersRes, itemsRes, posRes] = await Promise.all([
        supabase.from("orders").select("*, companies(name)"),
        supabase.from("companies").select("*"),
        supabase.from("suppliers").select("*"),
        supabase.from("order_items").select("*"),
        supabase.from("order_purchase_orders").select("*, suppliers(name)"),
      ]);

      const allOrders = ordersRes.data || [];
      const companies = companiesRes.data || [];
      const suppliers = suppliersRes.data || [];
      const items = itemsRes.data || [];
      const pos = posRes.data || [];

      const orders = allOrders.filter(o =>
        o.created_at && isWithinInterval(new Date(o.created_at), { start: rangeStart, end: rangeEnd })
      );

      const doc = new jsPDF();
      const pageWidth = doc.internal.pageSize.getWidth();
      const monthLabel = format(rangeStart, "MMMM yyyy");

      // Header
      doc.setFontSize(20);
      doc.setFont("helvetica", "bold");
      doc.text("Aleph Engineering & Supplies", 14, 20);
      doc.setFontSize(12);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(100);
      doc.text(`Monthly Report — ${monthLabel}`, 14, 28);
      doc.text(`Generated: ${format(new Date(), "PPpp")}`, 14, 34);

      // Line
      doc.setDrawColor(200);
      doc.line(14, 38, pageWidth - 14, 38);

      let yPos = 46;

      if (reportType === "summary" || reportType === "client") {
        // Summary stats
        const totalRevenue = orders.reduce((sum, o) => sum + (Number(o.total_amount) || 0), 0);
        const statusCounts: Record<string, number> = {};
        orders.forEach(o => {
          const s = o.status || "pending";
          statusCounts[s] = (statusCounts[s] || 0) + 1;
        });

        doc.setFontSize(14);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(0);
        doc.text("Overview", 14, yPos);
        yPos += 8;

        doc.setFontSize(10);
        doc.setFont("helvetica", "normal");
        doc.text(`Total Orders: ${orders.length}`, 14, yPos); yPos += 6;
        doc.text(`Total Revenue: R${totalRevenue.toLocaleString()}`, 14, yPos); yPos += 6;
        doc.text(`Status Breakdown: ${Object.entries(statusCounts).map(([k, v]) => `${k}: ${v}`).join(", ")}`, 14, yPos);
        yPos += 12;

        // Orders table
        doc.setFontSize(14);
        doc.setFont("helvetica", "bold");
        doc.text("Orders", 14, yPos);
        yPos += 4;

        autoTable(doc, {
          startY: yPos,
          head: [["Order #", "Company", "Status", "Urgency", "Amount", "Date"]],
          body: orders.map(o => [
            o.order_number,
            (o.companies as any)?.name || "—",
            o.status || "pending",
            o.urgency || "normal",
            o.total_amount ? `R${Number(o.total_amount).toLocaleString()}` : "—",
            o.created_at ? format(new Date(o.created_at), "dd MMM yyyy") : "—",
          ]),
          styles: { fontSize: 8 },
          headStyles: { fillColor: [16, 185, 129] },
        });

        yPos = (doc as any).lastAutoTable.finalY + 12;
      }

      if (reportType === "client") {
        // Per-client breakdown
        doc.addPage();
        yPos = 20;
        doc.setFontSize(14);
        doc.setFont("helvetica", "bold");
        doc.text("Client Breakdown", 14, yPos);
        yPos += 8;

        const clientData = companies.map(c => {
          const clientOrders = orders.filter(o => o.company_id === c.id);
          const revenue = clientOrders.reduce((s, o) => s + (Number(o.total_amount) || 0), 0);
          return { name: c.name, orders: clientOrders.length, revenue };
        }).filter(c => c.orders > 0).sort((a, b) => b.orders - a.orders);

        autoTable(doc, {
          startY: yPos,
          head: [["Client", "Orders", "Revenue"]],
          body: clientData.map(c => [c.name, c.orders.toString(), `R${c.revenue.toLocaleString()}`]),
          styles: { fontSize: 9 },
          headStyles: { fillColor: [59, 130, 246] },
        });
      }

      if (reportType === "supplier") {
        // Supplier performance
        doc.setFontSize(14);
        doc.setFont("helvetica", "bold");
        doc.text("Supplier Performance", 14, yPos);
        yPos += 8;

        const monthPOs = pos.filter(po => {
          const order = allOrders.find(o => o.id === po.order_id);
          return order?.created_at && isWithinInterval(new Date(order.created_at), { start: rangeStart, end: rangeEnd });
        });

        const supplierData = suppliers.map(s => {
          const sPOs = monthPOs.filter(po => po.supplier_id === s.id);
          return { name: s.name, poCount: sPOs.length };
        }).filter(s => s.poCount > 0).sort((a, b) => b.poCount - a.poCount);

        autoTable(doc, {
          startY: yPos,
          head: [["Supplier", "POs This Month"]],
          body: supplierData.map(s => [s.name, s.poCount.toString()]),
          styles: { fontSize: 9 },
          headStyles: { fillColor: [139, 92, 246] },
        });
      }

      // Save
      const filename = `report-${reportType}-${selectedMonth}.pdf`;
      doc.save(filename);

      toast({ title: "Report Downloaded", description: `${filename} has been saved.` });
    } catch (error) {
      console.error("Report generation error:", error);
      toast({ title: "Error", description: "Failed to generate report.", variant: "destructive" });
    } finally {
      setGenerating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="gap-2">
          <FileText className="h-4 w-4" />
          Generate Report
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Generate Monthly Report</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>Report Type</Label>
            <Select value={reportType} onValueChange={(v: any) => setReportType(v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="summary">Order Summary</SelectItem>
                <SelectItem value="client">Client Breakdown</SelectItem>
                <SelectItem value="supplier">Supplier Performance</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Month</Label>
            <Select value={selectedMonth} onValueChange={setSelectedMonth}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MONTHS.map(m => (
                  <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button onClick={generateReport} disabled={generating} className="w-full gap-2">
            {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            {generating ? "Generating..." : "Download PDF"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
