import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
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

type ReportType = "summary" | "client" | "supplier";

const COLUMN_SETS: Record<ReportType, { key: string; label: string }[]> = {
  summary: [
    { key: "order_number", label: "Order #" },
    { key: "company", label: "Company" },
    { key: "status", label: "Status" },
    { key: "urgency", label: "Urgency" },
    { key: "amount", label: "Amount" },
    { key: "date", label: "Date" },
  ],
  client: [
    { key: "order_number", label: "Order #" },
    { key: "company", label: "Company" },
    { key: "status", label: "Status" },
    { key: "urgency", label: "Urgency" },
    { key: "amount", label: "Amount" },
    { key: "date", label: "Date" },
    { key: "client_name", label: "Client (breakdown)" },
    { key: "client_orders", label: "Orders (breakdown)" },
    { key: "client_revenue", label: "Revenue (breakdown)" },
  ],
  supplier: [
    { key: "supplier_name", label: "Supplier" },
    { key: "supplier_pos", label: "POs This Month" },
  ],
};

export default function ReportGenerator() {
  const [open, setOpen] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState(MONTHS[0].value);
  const [reportType, setReportType] = useState<ReportType>("summary");
  const [selectedColumns, setSelectedColumns] = useState<Record<ReportType, string[]>>({
    summary: COLUMN_SETS.summary.map(c => c.key),
    client: COLUMN_SETS.client.map(c => c.key),
    supplier: COLUMN_SETS.supplier.map(c => c.key),
  });
  const [generating, setGenerating] = useState(false);
  const { toast } = useToast();

  const activeColumns = selectedColumns[reportType];
  const columnDefs = COLUMN_SETS[reportType];

  const toggleColumn = (key: string) => {
    setSelectedColumns(prev => {
      const current = prev[reportType];
      const next = current.includes(key) ? current.filter(k => k !== key) : [...current, key];
      return { ...prev, [reportType]: next };
    });
  };

  const setAll = (all: boolean) => {
    setSelectedColumns(prev => ({ ...prev, [reportType]: all ? columnDefs.map(c => c.key) : [] }));
  };

  const orderedSelected = useMemo(
    () => columnDefs.filter(c => activeColumns.includes(c.key)),
    [columnDefs, activeColumns]
  );

  const generateReport = async () => {
    if (orderedSelected.length === 0) {
      toast({ title: "No columns selected", description: "Pick at least one column to print.", variant: "destructive" });
      return;
    }
    setGenerating(true);
    try {
      const [year, month] = selectedMonth.split("-").map(Number);
      const rangeStart = startOfMonth(new Date(year, month - 1));
      const rangeEnd = endOfMonth(new Date(year, month - 1));

      const [ordersRes, companiesRes, suppliersRes, posRes] = await Promise.all([
        supabase.from("orders").select("*, companies(name)"),
        supabase.from("companies").select("*"),
        supabase.from("suppliers").select("*"),
        supabase.from("order_purchase_orders").select("*, suppliers(name)"),
      ]);

      const allOrders = ordersRes.data || [];
      const companies = companiesRes.data || [];
      const suppliers = suppliersRes.data || [];
      const pos = posRes.data || [];

      const orders = allOrders.filter(o =>
        o.created_at && isWithinInterval(new Date(o.created_at), { start: rangeStart, end: rangeEnd })
      );

      const doc = new jsPDF();
      const pageWidth = doc.internal.pageSize.getWidth();
      const monthLabel = format(rangeStart, "MMMM yyyy");

      doc.setFontSize(20);
      doc.setFont("helvetica", "bold");
      doc.text("Aleph Engineering & Supplies", 14, 20);
      doc.setFontSize(12);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(100);
      doc.text(`Monthly Report — ${monthLabel}`, 14, 28);
      doc.text(`Generated: ${format(new Date(), "PPpp")}`, 14, 34);

      doc.setDrawColor(200);
      doc.line(14, 38, pageWidth - 14, 38);

      let yPos = 46;

      const orderColumnKeys = ["order_number", "company", "status", "urgency", "amount", "date"];
      const clientColumnKeys = ["client_name", "client_orders", "client_revenue"];

      const selectedOrderCols = orderedSelected.filter(c => orderColumnKeys.includes(c.key));
      const selectedClientCols = orderedSelected.filter(c => clientColumnKeys.includes(c.key));
      const selectedSupplierCols = orderedSelected.filter(c => c.key.startsWith("supplier_"));

      const orderCell = (o: any, key: string) => {
        switch (key) {
          case "order_number": return o.order_number;
          case "company": return o.companies?.name || "—";
          case "status": return o.status || "pending";
          case "urgency": return o.urgency || "normal";
          case "amount": return o.total_amount ? `R${Number(o.total_amount).toLocaleString()}` : "—";
          case "date": return o.created_at ? format(new Date(o.created_at), "dd MMM yyyy") : "—";
          default: return "";
        }
      };

      if (reportType === "summary" || reportType === "client") {
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

        if (selectedOrderCols.length > 0) {
          doc.setFontSize(14);
          doc.setFont("helvetica", "bold");
          doc.text("Orders", 14, yPos);
          yPos += 4;

          autoTable(doc, {
            startY: yPos,
            head: [selectedOrderCols.map(c => c.label)],
            body: orders.map(o => selectedOrderCols.map(c => orderCell(o, c.key))),
            styles: { fontSize: 8 },
            headStyles: { fillColor: [16, 185, 129] },
          });

          yPos = (doc as any).lastAutoTable.finalY + 12;
        }
      }

      if (reportType === "client" && selectedClientCols.length > 0) {
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

        const clientCell = (c: { name: string; orders: number; revenue: number }, key: string) => {
          switch (key) {
            case "client_name": return c.name;
            case "client_orders": return c.orders.toString();
            case "client_revenue": return `R${c.revenue.toLocaleString()}`;
            default: return "";
          }
        };

        autoTable(doc, {
          startY: yPos,
          head: [selectedClientCols.map(c => c.label.replace(" (breakdown)", ""))],
          body: clientData.map(c => selectedClientCols.map(col => clientCell(c, col.key))),
          styles: { fontSize: 9 },
          headStyles: { fillColor: [59, 130, 246] },
        });
      }

      if (reportType === "supplier" && selectedSupplierCols.length > 0) {
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

        const supplierCell = (s: { name: string; poCount: number }, key: string) =>
          key === "supplier_name" ? s.name : s.poCount.toString();

        autoTable(doc, {
          startY: yPos,
          head: [selectedSupplierCols.map(c => c.label)],
          body: supplierData.map(s => selectedSupplierCols.map(col => supplierCell(s, col.key))),
          styles: { fontSize: 9 },
          headStyles: { fillColor: [139, 92, 246] },
        });
      }

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
      <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Generate Monthly Report</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>Report Type</Label>
            <Select value={reportType} onValueChange={(v: ReportType) => setReportType(v)}>
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

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Columns to print</Label>
              <div className="flex gap-1">
                <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => setAll(true)}>
                  All
                </Button>
                <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => setAll(false)}>
                  None
                </Button>
              </div>
            </div>
            <div className="rounded-md border border-border p-3 space-y-2">
              {columnDefs.map(col => (
                <label key={col.key} className="flex items-center gap-2 text-sm cursor-pointer">
                  <Checkbox
                    checked={activeColumns.includes(col.key)}
                    onCheckedChange={() => toggleColumn(col.key)}
                  />
                  <span>{col.label}</span>
                </label>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              {orderedSelected.length} of {columnDefs.length} columns selected
            </p>
          </div>

          <Button onClick={generateReport} disabled={generating || orderedSelected.length === 0} className="w-full gap-2">
            {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            {generating ? "Generating..." : "Download PDF"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
