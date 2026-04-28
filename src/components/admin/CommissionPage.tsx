import { useState, useEffect, useCallback, Fragment } from "react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Plus, Pencil, Trash2, Users, DollarSign, FileText, Download, ChevronDown, ChevronRight, Loader2, RefreshCw, AlertCircle, Lock, Unlock
} from "lucide-react";
import { format, startOfMonth, endOfMonth, subMonths } from "date-fns";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { Printer, AlertTriangle } from "lucide-react";

type CommissionMethod = "margin_scaled" | "half_markup_below_25";

type Rep = {
  id: string;
  name: string;
  email: string | null;
  commission_rate: number;
  commission_method: CommissionMethod;
  created_at: string;
};

type Company = {
  id: string;
  name: string;
  code: string;
};

const normalizeCompanyName = (value: string) => value.trim().replace(/\s+/g, " ").toLowerCase();

const isZohoCompany = (company: Company) => company.code.startsWith("ZOHO-");

type RepAssignment = {
  rep_id: string;
  company_id: string;
  commission_rate: number | null;
};

type CommissionLineItem = {
  name: string;
  code: string;
  quantity: number;
  rate: number;
  cost: number | null;
  sub_total: number;
  margin_percent: number | null;
  commission_rate: number;
  commission: number;
};

type CommissionInvoice = {
  invoice_id: string;
  invoice_number: string;
  customer_name: string;
  date: string;
  sub_total: number;
  total: number;
  commission: number;
  commission_rate: number;
  line_items?: CommissionLineItem[];
  locked: boolean;
};

type CommissionRepData = {
  rep_id: string;
  rep_name: string;
  rep_email: string | null;
  commission_rate: number;
  total_invoiced: number;
  commission_earned: number;
  invoice_count: number;
  locked_commission: number;
  locked_invoice_count: number;
  is_locked: boolean;
  invoices: CommissionInvoice[];
  companies: string[];
};

type CommissionResult = {
  success: boolean;
  data: CommissionRepData[];
  summary: {
    totalInvoiced: number;
    totalCommission: number;
    totalInvoices: number;
  };
  error?: string;
};

const CommissionPage = () => {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("report");

  // Rep management state
  const [reps, setReps] = useState<Rep[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [assignments, setAssignments] = useState<RepAssignment[]>([]);
  const [repDialogOpen, setRepDialogOpen] = useState(false);
  const [editingRep, setEditingRep] = useState<Rep | null>(null);
  const [repForm, setRepForm] = useState({ name: "", email: "", commission_rate: "5", commission_method: "margin_scaled" as CommissionMethod });
  const [assignDialogOpen, setAssignDialogOpen] = useState(false);
  const [assignRepId, setAssignRepId] = useState<string | null>(null);
  const [selectedCompanies, setSelectedCompanies] = useState<Set<string>>(new Set());
  const [companyRateOverrides, setCompanyRateOverrides] = useState<Map<string, string>>(new Map());
  const [loadingReps, setLoadingReps] = useState(true);

  const [methodFilter, setMethodFilter] = useState<"all" | CommissionMethod>("all");

  // Commission report state - default to PREVIOUS month
  const [selectedMonth, setSelectedMonth] = useState(() => format(subMonths(new Date(), 1), "yyyy-MM"));
  const [commissionData, setCommissionData] = useState<CommissionResult | null>(null);
  const [loadingReport, setLoadingReport] = useState(false);
  const [expandedReps, setExpandedReps] = useState<Set<string>>(new Set());
  const [expandedInvoices, setExpandedInvoices] = useState<Set<string>>(new Set());

  const fetchData = useCallback(async () => {
    setLoadingReps(true);
    try {
      const [repsRes, companiesRes, assignRes] = await Promise.all([
        supabase.from("reps").select("*").order("name"),
        supabase.from("companies").select("id, name, code").order("name"),
        supabase.from("rep_company_assignments").select("rep_id, company_id, commission_rate"),
      ]);
      if (repsRes.data) setReps(repsRes.data as Rep[]);
      if (companiesRes.data) {
        const zohoCompanies = companiesRes.data.filter(isZohoCompany);
        const dedupedCompanies = Array.from(
          zohoCompanies.reduce((map, company) => {
            const normalizedName = normalizeCompanyName(company.name);
            if (!map.has(normalizedName)) {
              map.set(normalizedName, company);
            }
            return map;
          }, new Map<string, Company>()).values()
        );

        setCompanies(dedupedCompanies);
      }
      if (assignRes.data) setAssignments(assignRes.data as RepAssignment[]);
    } catch (e) {
      console.error("Error fetching commission data:", e);
    } finally {
      setLoadingReps(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Rep CRUD
  const handleSaveRep = async () => {
    const rate = parseFloat(repForm.commission_rate);
    if (!repForm.name.trim() || isNaN(rate) || rate < 0) {
      toast({ title: "Invalid input", description: "Please enter a valid name and commission rate.", variant: "destructive" });
      return;
    }

    if (editingRep) {
      const { error } = await supabase.from("reps").update({
        name: repForm.name.trim(),
        email: repForm.email.trim() || null,
        commission_rate: rate,
        commission_method: repForm.commission_method,
      }).eq("id", editingRep.id);
      if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
      toast({ title: "Rep updated" });
    } else {
      const { error } = await supabase.from("reps").insert({
        name: repForm.name.trim(),
        email: repForm.email.trim() || null,
        commission_rate: rate,
        commission_method: repForm.commission_method,
      });
      if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
      toast({ title: "Rep added" });
    }

    setRepDialogOpen(false);
    setEditingRep(null);
    setRepForm({ name: "", email: "", commission_rate: "5", commission_method: "margin_scaled" });
    fetchData();
  };

  const handleDeleteRep = async (id: string) => {
    const { error } = await supabase.from("reps").delete().eq("id", id);
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Rep deleted" });
    fetchData();
  };

  const openEditRep = (rep: Rep) => {
    setEditingRep(rep);
    setRepForm({
      name: rep.name,
      email: rep.email || "",
      commission_rate: String(rep.commission_rate),
      commission_method: (rep.commission_method as CommissionMethod) || "margin_scaled",
    });
    setRepDialogOpen(true);
  };

  const openAssignDialog = (repId: string) => {
    setAssignRepId(repId);
    const currentAssigns = assignments.filter(a => a.rep_id === repId);
    setSelectedCompanies(new Set(currentAssigns.map(a => a.company_id)));
    const overrides = new Map<string, string>();
    for (const a of currentAssigns) {
      if (a.commission_rate !== null) {
        overrides.set(a.company_id, String(a.commission_rate));
      }
    }
    setCompanyRateOverrides(overrides);
    setAssignDialogOpen(true);
  };

  const handleSaveAssignments = async () => {
    if (!assignRepId) return;

    const currentAssigned = assignments.filter(a => a.rep_id === assignRepId).map(a => a.company_id);
    const toAdd = [...selectedCompanies].filter(c => !currentAssigned.includes(c));
    const toRemove = currentAssigned.filter(c => !selectedCompanies.has(c));
    const toUpdate = [...selectedCompanies].filter(c => currentAssigned.includes(c));

    for (const companyId of toRemove) {
      await supabase.from("rep_company_assignments").delete().eq("rep_id", assignRepId).eq("company_id", companyId);
    }

    for (const companyId of toAdd) {
      const overrideRate = companyRateOverrides.get(companyId);
      await supabase.from("rep_company_assignments").insert({
        rep_id: assignRepId,
        company_id: companyId,
        commission_rate: overrideRate ? parseFloat(overrideRate) : null,
      });
    }

    // Update override rates for existing assignments
    for (const companyId of toUpdate) {
      const overrideRate = companyRateOverrides.get(companyId);
      await supabase.from("rep_company_assignments")
        .update({ commission_rate: overrideRate ? parseFloat(overrideRate) : null })
        .eq("rep_id", assignRepId)
        .eq("company_id", companyId);
    }

    toast({ title: "Assignments updated" });
    setAssignDialogOpen(false);
    fetchData();
  };

  // Commission report - uses previous month by default. Auto-runs whenever the
  // Report tab is opened OR the selected month changes.
  const fetchCommissionReport = useCallback(async () => {
    setLoadingReport(true);
    try {
      const [year, month] = selectedMonth.split("-").map(Number);
      const dateStart = format(startOfMonth(new Date(year, month - 1)), "yyyy-MM-dd");
      const dateEnd = format(endOfMonth(new Date(year, month - 1)), "yyyy-MM-dd");

      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { toast({ title: "Not authenticated", variant: "destructive" }); return; }

      const response = await supabase.functions.invoke("rep-commission-data", {
        body: { date_start: dateStart, date_end: dateEnd },
      });

      if (response.error) throw new Error(response.error.message || "Failed to fetch commission data");
      setCommissionData(response.data as CommissionResult);
    } catch (e: any) {
      console.error("Commission report error:", e);
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setLoadingReport(false);
    }
  }, [selectedMonth, toast]);

  // Auto-fetch whenever the Report tab is the active tab or the month changes.
  useEffect(() => {
    if (activeTab === "report") {
      fetchCommissionReport();
    }
  }, [activeTab, selectedMonth, fetchCommissionReport]);

  // Lock all currently-unlocked invoices for a single rep into commission_payouts.
  const lockRepPayout = async (rep: CommissionRepData) => {
    const unlocked = rep.invoices.filter(i => !i.locked);
    if (unlocked.length === 0) {
      toast({ title: "Nothing to lock", description: "All invoices for this rep are already locked." });
      return;
    }
    if (!confirm(`Lock ${unlocked.length} invoice(s) totalling ${formatCurrency(rep.commission_earned)} commission for ${rep.rep_name}? This marks the payout as paid and excludes these invoices from future calculations.`)) {
      return;
    }
    const { data: { user } } = await supabase.auth.getUser();
    const periodMonth = `${selectedMonth}-01`;
    const rows = unlocked.map(inv => ({
      rep_id: rep.rep_id,
      period_month: periodMonth,
      invoice_id: inv.invoice_id,
      invoice_number: inv.invoice_number,
      customer_name: inv.customer_name,
      invoice_date: inv.date || null,
      sub_total: inv.sub_total,
      commission_rate: inv.commission_rate,
      commission_amount: inv.commission,
      line_items: inv.line_items || [],
      locked_by: user?.id ?? null,
    }));
    const { error } = await supabase.from("commission_payouts").insert(rows);
    if (error) {
      toast({ title: "Lock failed", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Payout locked", description: `${unlocked.length} invoice(s) locked for ${rep.rep_name}.` });
    fetchCommissionReport();
  };

  const unlockRepPayout = async (rep: CommissionRepData) => {
    const locked = rep.invoices.filter(i => i.locked);
    if (locked.length === 0) return;
    if (!confirm(`Unlock ${locked.length} invoice(s) for ${rep.rep_name}? They will be re-included in the calculation.`)) return;
    const periodMonth = `${selectedMonth}-01`;
    const { error } = await supabase
      .from("commission_payouts")
      .delete()
      .eq("rep_id", rep.rep_id)
      .eq("period_month", periodMonth);
    if (error) {
      toast({ title: "Unlock failed", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Payout unlocked" });
    fetchCommissionReport();
  };

  const toggleExpanded = (repId: string) => {
    setExpandedReps(prev => {
      const next = new Set(prev);
      if (next.has(repId)) next.delete(repId); else next.add(repId);
      return next;
    });
  };

  const exportCsv = () => {
    if (!commissionData?.data) return;
    const rows = [["Rep", "Email", "Rate %", "Total Invoiced (excl. VAT)", "Commission Earned", "Invoice Count"]];
    for (const d of commissionData.data) {
      rows.push([d.rep_name, d.rep_email || "", String(d.commission_rate), String(d.total_invoiced), String(d.commission_earned), String(d.invoice_count)]);
      for (const inv of d.invoices) {
        rows.push(["", inv.invoice_number, inv.customer_name, inv.date, String(inv.sub_total), String(inv.commission)]);
      }
    }
    const csv = rows.map(r => r.map(c => `"${c}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `commission-report-${selectedMonth}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const printPdfReport = () => {
    if (!commissionData?.data) return;
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const monthLabel = format(new Date(selectedMonth + "-01"), "MMMM yyyy");

    // Header
    doc.setFontSize(18);
    doc.setFont("helvetica", "bold");
    doc.text("Sales Commission Report", 14, 18);
    doc.setFontSize(11);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(100);
    doc.text(`Period: ${monthLabel}`, 14, 25);
    doc.text(`Generated: ${format(new Date(), "PPpp")}`, 14, 31);
    doc.setDrawColor(200);
    doc.line(14, 35, pageWidth - 14, 35);

    // Summary
    let y = 43;
    doc.setTextColor(0);
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.text("Summary", 14, y);
    y += 6;
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.text(`Total Invoiced (excl. VAT): ${formatCurrency(commissionData.summary.totalInvoiced)}`, 14, y); y += 5;
    doc.text(`Total Commission Due: ${formatCurrency(commissionData.summary.totalCommission)}`, 14, y); y += 5;
    doc.text(`Invoices Matched: ${commissionData.summary.totalInvoices}`, 14, y); y += 8;

    // Per rep
    for (const rep of commissionData.data) {
      if (y > 250) { doc.addPage(); y = 20; }
      doc.setFontSize(13);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(0);
      doc.text(rep.rep_name, 14, y); y += 5;
      doc.setFontSize(9);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(80);
      doc.text(
        `${rep.rep_email || "—"}  |  Rate: ${rep.commission_rate}%  |  Invoices: ${rep.invoice_count}  |  Invoiced: ${formatCurrency(rep.total_invoiced)}  |  Commission: ${formatCurrency(rep.commission_earned)}`,
        14, y,
      );
      y += 5;

      for (const inv of rep.invoices) {
        if (y > 250) { doc.addPage(); y = 20; }
        doc.setFontSize(10);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(0);
        doc.text(
          `Invoice ${inv.invoice_number} — ${inv.customer_name}${inv.locked ? " (LOCKED)" : ""}`,
          14, y,
        );
        y += 4;
        doc.setFontSize(9);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(90);
        doc.text(
          `Date: ${inv.date || "—"}  |  Sub-total: ${formatCurrency(inv.sub_total)}  |  Rate: ${inv.commission_rate}%  |  Commission: ${formatCurrency(inv.commission)}`,
          14, y,
        );
        y += 3;

        const items = inv.line_items || [];
        if (items.length > 0) {
          autoTable(doc, {
            startY: y,
            head: [["SKU", "Item", "Qty", "Rate", "Cost", "Sub-total", "Margin %", "Comm %", "Commission"]],
            body: items.map(li => [
              li.code || "—",
              (li.name || "").slice(0, 40),
              String(li.quantity ?? ""),
              li.rate != null ? formatCurrency(Number(li.rate)) : "—",
              li.cost != null ? formatCurrency(Number(li.cost)) : "—",
              formatCurrency(Number(li.sub_total || 0)),
              li.margin_percent != null ? `${Number(li.margin_percent).toFixed(1)}%` : "—",
              `${li.commission_rate}%`,
              formatCurrency(Number(li.commission || 0)),
            ]),
            styles: { fontSize: 7, cellPadding: 1.5 },
            headStyles: { fillColor: [16, 185, 129], fontSize: 7 },
            margin: { left: 14, right: 14 },
            theme: "striped",
          });
          y = (doc as any).lastAutoTable.finalY + 4;
        } else {
          doc.text("(no line items returned)", 14, y + 4);
          y += 8;
        }
      }
      y += 4;
      doc.setDrawColor(220);
      doc.line(14, y, pageWidth - 14, y);
      y += 4;
    }

    doc.save(`commission-report-${selectedMonth}.pdf`);
  };

  const formatCurrency = (n: number) => `R ${n.toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const getRepAssignedCompanies = (repId: string) =>
    assignments.filter(a => a.rep_id === repId).map(a => {
      const company = companies.find(c => c.id === a.company_id);
      return company ? { name: company.name, overrideRate: a.commission_rate } : null;
    }).filter(Boolean) as { name: string; overrideRate: number | null }[];

  // Determine which month label to show
  const selectedDate = new Date(selectedMonth + "-01");
  const isPreviousMonth = format(subMonths(new Date(), 1), "yyyy-MM") === selectedMonth;

  return (
    <div className="space-y-4">
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="report"><FileText className="h-4 w-4 mr-1.5" />Commission Report</TabsTrigger>
          <TabsTrigger value="reps"><Users className="h-4 w-4 mr-1.5" />Manage Reps</TabsTrigger>
        </TabsList>

        {/* Commission Report Tab */}
        <TabsContent value="report" className="space-y-4">
          {/* Info banner */}
          <div className="flex items-start gap-2 p-3 rounded-lg bg-muted/50 text-sm text-muted-foreground">
            <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
            <div>
              <p className="font-medium text-foreground">Commission is calculated on amounts excluding VAT (sub-total)</p>
              <p>This month's commission due = last month's sales. Default view shows previous month ({format(subMonths(new Date(), 1), "MMMM yyyy")}).</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Input
              type="month"
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="w-48"
            />
            <Button onClick={fetchCommissionReport} disabled={loadingReport} variant="outline">
              {loadingReport ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <RefreshCw className="h-4 w-4 mr-1.5" />}
              {loadingReport ? "Calculating..." : "Refresh"}
            </Button>
            {commissionData && (
              <>
                <Button variant="outline" onClick={exportCsv}>
                  <Download className="h-4 w-4 mr-1.5" />Export CSV
                </Button>
                <Button variant="outline" onClick={printPdfReport}>
                  <Printer className="h-4 w-4 mr-1.5" />Print Full Report
                </Button>
              </>
            )}
            {isPreviousMonth && (
              <Badge variant="default" className="text-xs">Commission Due This Month</Badge>
            )}
          </div>

          {/* Summary Cards */}
          {commissionData && (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <Card>
                  <CardContent className="pt-4 pb-3">
                    <p className="text-xs text-muted-foreground">Total Invoiced (excl. VAT)</p>
                    <p className="text-2xl font-bold text-foreground">{formatCurrency(commissionData.summary.totalInvoiced)}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-4 pb-3">
                    <p className="text-xs text-muted-foreground">Total Commission Due</p>
                    <p className="text-2xl font-bold text-primary">{formatCurrency(commissionData.summary.totalCommission)}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-4 pb-3">
                    <p className="text-xs text-muted-foreground">Invoices Matched</p>
                    <p className="text-2xl font-bold text-foreground">{commissionData.summary.totalInvoices}</p>
                  </CardContent>
                </Card>
              </div>

              {/* Per-rep cards */}
              <div className="space-y-3">
                {commissionData.data.map((d) => (
                  <Card key={d.rep_id} className={cn(d.is_locked && "opacity-70")}>
                    <CardHeader className="pb-2">
                      <div className="flex items-center justify-between gap-3 flex-wrap">
                        <div
                          className="flex items-center gap-2 cursor-pointer flex-1 min-w-0"
                          onClick={() => toggleExpanded(d.rep_id)}
                        >
                          {expandedReps.has(d.rep_id) ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
                          <CardTitle className="text-base truncate">{d.rep_name}</CardTitle>
                          <Badge variant="secondary">{d.commission_rate}% default</Badge>
                          {d.locked_invoice_count > 0 && (
                            <Badge variant="outline" className="gap-1 text-xs">
                              <Lock className="h-3 w-3" />
                              {d.locked_invoice_count} paid ({formatCurrency(d.locked_commission)})
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-3 text-sm">
                          <div className="text-right">
                            <div className="text-xs text-muted-foreground">{d.invoice_count} due • {formatCurrency(d.total_invoiced)}</div>
                            <div className="font-bold text-primary">{formatCurrency(d.commission_earned)}</div>
                          </div>
                          {d.invoice_count > 0 ? (
                            <Button
                              size="sm"
                              variant="default"
                              onClick={(e) => { e.stopPropagation(); lockRepPayout(d); }}
                              className="gap-1"
                            >
                              <Lock className="h-3.5 w-3.5" />
                              Mark paid
                            </Button>
                          ) : d.locked_invoice_count > 0 ? (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={(e) => { e.stopPropagation(); unlockRepPayout(d); }}
                              className="gap-1 text-muted-foreground"
                            >
                              <Unlock className="h-3.5 w-3.5" />
                              Unlock
                            </Button>
                          ) : null}
                        </div>
                      </div>
                      {d.companies.length > 0 && (
                        <Popover>
                          <PopoverTrigger asChild>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 px-2 mt-1 text-xs text-muted-foreground hover:text-foreground gap-1"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <Users className="h-3 w-3" />
                              {d.companies.length} {d.companies.length === 1 ? "client" : "clients"}
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent
                            align="start"
                            className="w-80 max-h-72 overflow-y-auto"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <p className="text-xs font-medium mb-2 text-muted-foreground">Assigned clients</p>
                            <ul className="space-y-1 text-sm">
                              {d.companies.map((c, idx) => (
                                <li key={idx} className="truncate">{c}</li>
                              ))}
                            </ul>
                          </PopoverContent>
                        </Popover>
                      )}
                    </CardHeader>
                    {expandedReps.has(d.rep_id) && d.invoices.length > 0 && (
                      <CardContent className="pt-0">
                        <div className="border rounded-lg overflow-hidden">
                          <table className="w-full text-sm">
                            <thead className="bg-muted/50">
                              <tr>
                                <th className="text-left p-2 font-medium">Invoice #</th>
                                <th className="text-left p-2 font-medium">Customer</th>
                                <th className="text-left p-2 font-medium">Date</th>
                                <th className="text-right p-2 font-medium">Excl. VAT</th>
                                <th className="text-right p-2 font-medium">Rate</th>
                                <th className="text-right p-2 font-medium">Commission</th>
                              </tr>
                            </thead>
                            <tbody>
                              {d.invoices.map((inv, i) => {
                                const invKey = `${d.rep_id}::${inv.invoice_number}::${i}`;
                                const isOpen = expandedInvoices.has(invKey);
                                const lines = inv.line_items || [];
                                const hasLines = lines.length > 0;
                                return (
                                  <Fragment key={invKey}>
                                    <tr
                                      className={cn(
                                        "border-t",
                                        hasLines && "cursor-pointer hover:bg-muted/40",
                                        inv.locked && "opacity-60"
                                      )}
                                      onClick={() => {
                                        if (!hasLines) return;
                                        setExpandedInvoices(prev => {
                                          const next = new Set(prev);
                                          if (next.has(invKey)) next.delete(invKey); else next.add(invKey);
                                          return next;
                                        });
                                      }}
                                    >
                                      <td className="p-2">
                                        <span className="inline-flex items-center gap-1">
                                          {hasLines && (isOpen
                                            ? <ChevronDown className="h-3 w-3 text-muted-foreground" />
                                            : <ChevronRight className="h-3 w-3 text-muted-foreground" />)}
                                          {inv.invoice_number}
                                          {inv.locked && <Lock className="h-3 w-3 text-muted-foreground ml-1" />}
                                        </span>
                                      </td>
                                      <td className="p-2">{inv.customer_name}</td>
                                      <td className="p-2">{inv.date}</td>
                                      <td className="p-2 text-right">{formatCurrency(inv.sub_total)}</td>
                                      <td className="p-2 text-right">
                                        <Badge variant={inv.commission_rate !== d.commission_rate ? "outline" : "secondary"} className="text-xs">
                                          {inv.commission_rate}%
                                        </Badge>
                                      </td>
                                      <td className="p-2 text-right font-medium text-primary">{formatCurrency(inv.commission)}</td>
                                    </tr>
                                    {isOpen && hasLines && (
                                      <tr className="bg-muted/20">
                                        <td colSpan={6} className="p-0">
                                          <div className="px-4 py-3">
                                            <p className="text-xs font-medium text-muted-foreground mb-2">Line items ({lines.length})</p>
                                            <table className="w-full text-xs">
                                              <thead className="text-muted-foreground">
                                                <tr>
                                                  <th className="text-left py-1 font-medium">Item</th>
                                                  <th className="text-right py-1 font-medium">Qty</th>
                                                  <th className="text-right py-1 font-medium">Sell</th>
                                                  <th className="text-right py-1 font-medium">Cost</th>
                                                  <th className="text-right py-1 font-medium">Margin</th>
                                                  <th className="text-right py-1 font-medium">Sub-total</th>
                                                  <th className="text-right py-1 font-medium">Comm. %</th>
                                                  <th className="text-right py-1 font-medium">Commission</th>
                                                </tr>
                                              </thead>
                                              <tbody>
                                                {lines.map((li, j) => (
                                                  <tr key={j} className="border-t border-border/40">
                                                    <td className="py-1.5 pr-2">
                                                      <div className="font-medium text-foreground">{li.name || "—"}</div>
                                                      {li.code && <div className="text-[10px] text-muted-foreground">{li.code}</div>}
                                                    </td>
                                                    <td className="py-1.5 text-right">{li.quantity}</td>
                                                    <td className="py-1.5 text-right">{formatCurrency(li.rate)}</td>
                                                    <td className="py-1.5 text-right text-muted-foreground">
                                                      {li.cost !== null ? formatCurrency(li.cost) : "—"}
                                                    </td>
                                                    <td className="py-1.5 text-right">
                                                      {li.margin_percent !== null ? (
                                                        <span className={cn(
                                                          li.margin_percent >= 25 ? "text-primary" : "text-destructive"
                                                        )}>
                                                          {li.margin_percent}%
                                                        </span>
                                                      ) : <span className="text-muted-foreground">—</span>}
                                                    </td>
                                                    <td className="py-1.5 text-right">{formatCurrency(li.sub_total)}</td>
                                                    <td className="py-1.5 text-right">
                                                      <Badge variant="outline" className="text-[10px] px-1 py-0">{li.commission_rate}%</Badge>
                                                    </td>
                                                    <td className="py-1.5 text-right font-medium text-primary">{formatCurrency(li.commission)}</td>
                                                  </tr>
                                                ))}
                                              </tbody>
                                            </table>
                                          </div>
                                        </td>
                                      </tr>
                                    )}
                                  </Fragment>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </CardContent>
                    )}
                  </Card>
                ))}
                {commissionData.data.length === 0 && (
                  <Card>
                    <CardContent className="py-8 text-center text-muted-foreground">
                      No commission data found. Make sure reps are set up with company assignments.
                    </CardContent>
                  </Card>
                )}
              </div>
            </>
          )}

          {!commissionData && loadingReport && (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                <Loader2 className="h-8 w-8 mx-auto mb-3 animate-spin opacity-60" />
                <p className="text-sm">Fetching invoices and calculating commissions...</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Manage Reps Tab */}
        <TabsContent value="reps" className="space-y-4">
          <div className="flex justify-between items-center flex-wrap gap-2">
            <h2 className="text-lg font-semibold">Sales Reps</h2>
            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex items-center gap-1 rounded-lg border p-0.5">
                <Button
                  size="sm"
                  variant={methodFilter === "all" ? "secondary" : "ghost"}
                  className="h-7 text-xs"
                  onClick={() => setMethodFilter("all")}
                >
                  All ({reps.length})
                </Button>
                <Button
                  size="sm"
                  variant={methodFilter === "margin_scaled" ? "secondary" : "ghost"}
                  className="h-7 text-xs"
                  onClick={() => setMethodFilter("margin_scaled")}
                >
                  Margin-scaled ({reps.filter(r => (r.commission_method || "margin_scaled") === "margin_scaled").length})
                </Button>
                <Button
                  size="sm"
                  variant={methodFilter === "half_markup_below_25" ? "secondary" : "ghost"}
                  className="h-7 text-xs"
                  onClick={() => setMethodFilter("half_markup_below_25")}
                >
                  Half-markup ({reps.filter(r => r.commission_method === "half_markup_below_25").length})
                </Button>
              </div>
              <Button onClick={() => { setEditingRep(null); setRepForm({ name: "", email: "", commission_rate: "5", commission_method: "margin_scaled" }); setRepDialogOpen(true); }}>
                <Plus className="h-4 w-4 mr-1.5" />Add Rep
              </Button>
            </div>
          </div>

          {loadingReps ? (
            <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : reps.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                No sales reps yet. Add a rep to get started.
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-3">
              {reps
                .filter(rep => methodFilter === "all" || (rep.commission_method || "margin_scaled") === methodFilter)
                .map((rep) => {
                const assignedCompanies = getRepAssignedCompanies(rep.id);
                const method = (rep.commission_method || "margin_scaled") as CommissionMethod;
                return (
                  <Card key={rep.id}>
                    <CardContent className="py-4 flex items-center justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium">{rep.name}</span>
                          <Badge variant="secondary">{rep.commission_rate}% default</Badge>
                          <Badge variant="outline" className="text-xs">
                            {method === "margin_scaled" ? "Margin-scaled" : "Half-markup <25%"}
                          </Badge>
                        </div>
                        {rep.email && <p className="text-xs text-muted-foreground">{rep.email}</p>}
                        {assignedCompanies.length > 0 ? (
                          <div className="flex flex-wrap gap-1 mt-1.5">
                            {assignedCompanies.map((c, i) => (
                              <Badge key={i} variant="outline" className="text-xs">
                                {c.name}{c.overrideRate !== null ? ` (${c.overrideRate}%)` : ''}
                              </Badge>
                            ))}
                          </div>
                        ) : (
                          <p className="text-xs text-destructive mt-1">No companies assigned</p>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <Button variant="outline" size="sm" onClick={() => openAssignDialog(rep.id)}>
                          <Users className="h-3.5 w-3.5 mr-1" />Assign
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => openEditRep(rep)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" className="text-destructive" onClick={() => handleDeleteRep(rep.id)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Add/Edit Rep Dialog */}
      <Dialog open={repDialogOpen} onOpenChange={setRepDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingRep ? "Edit Rep" : "Add Rep"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Name *</Label>
              <Input value={repForm.name} onChange={e => setRepForm(f => ({ ...f, name: e.target.value }))} placeholder="John Smith" />
            </div>
            <div>
              <Label>Email</Label>
              <Input value={repForm.email} onChange={e => setRepForm(f => ({ ...f, email: e.target.value }))} placeholder="john@example.com" />
            </div>
            <div>
              <Label>Default Commission Rate (%)</Label>
              <Input type="number" step="0.5" min="0" max="100" value={repForm.commission_rate} onChange={e => setRepForm(f => ({ ...f, commission_rate: e.target.value }))} />
              <p className="text-xs text-muted-foreground mt-1">This is the default rate. You can override per-company in assignments.</p>
            </div>
            <div>
              <Label>Commission Calculation Method</Label>
              <div className="space-y-2 mt-2">
                <label className="flex items-start gap-2 p-2 rounded-md border cursor-pointer hover:bg-muted/50">
                  <input
                    type="radio"
                    name="commission_method"
                    className="mt-1"
                    checked={repForm.commission_method === "margin_scaled"}
                    onChange={() => setRepForm(f => ({ ...f, commission_method: "margin_scaled" }))}
                  />
                  <div className="text-sm">
                    <div className="font-medium">Margin-scaled rate</div>
                    <div className="text-xs text-muted-foreground">
                      Full rate at 25%+ margin. Below 25%, rate drops 1% per 1% margin shortfall (floored at 0).
                    </div>
                  </div>
                </label>
                <label className="flex items-start gap-2 p-2 rounded-md border cursor-pointer hover:bg-muted/50">
                  <input
                    type="radio"
                    name="commission_method"
                    className="mt-1"
                    checked={repForm.commission_method === "half_markup_below_25"}
                    onChange={() => setRepForm(f => ({ ...f, commission_method: "half_markup_below_25" }))}
                  />
                  <div className="text-sm">
                    <div className="font-medium">Half-markup below 25%</div>
                    <div className="text-xs text-muted-foreground">
                      Full rate at 25%+ margin. Below 25%, rep earns 50% of the markup (sell − cost) for that line.
                    </div>
                  </div>
                </label>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRepDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSaveRep}>{editingRep ? "Save" : "Add"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Assign Companies Dialog - now with per-company rate override */}
      <Dialog open={assignDialogOpen} onOpenChange={setAssignDialogOpen}>
        <DialogContent className="max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Assign Companies to {reps.find(r => r.id === assignRepId)?.name}</DialogTitle>
          </DialogHeader>
          <p className="text-xs text-muted-foreground">
            Leave rate blank to use the rep's default rate ({reps.find(r => r.id === assignRepId)?.commission_rate}%). Set a custom rate per company if profit margins differ.
          </p>
          <div className="space-y-2 max-h-[50vh] overflow-y-auto">
            {companies.map((company) => {
              const isSelected = selectedCompanies.has(company.id);
              return (
                <div key={company.id} className="flex items-center gap-2 p-2 rounded-lg hover:bg-muted/50">
                  <Checkbox
                    checked={isSelected}
                    onCheckedChange={(checked) => {
                      setSelectedCompanies(prev => {
                        const next = new Set(prev);
                        if (checked) next.add(company.id); else next.delete(company.id);
                        return next;
                      });
                      if (!checked) {
                        setCompanyRateOverrides(prev => {
                          const next = new Map(prev);
                          next.delete(company.id);
                          return next;
                        });
                      }
                    }}
                  />
                  <span className="text-sm flex-1">{company.name} <span className="text-xs text-muted-foreground">({company.code})</span></span>
                  {isSelected && (
                    <Input
                      type="number"
                      step="0.5"
                      min="0"
                      max="100"
                      placeholder="Default"
                      value={companyRateOverrides.get(company.id) || ""}
                      onChange={(e) => {
                        setCompanyRateOverrides(prev => {
                          const next = new Map(prev);
                          if (e.target.value) next.set(company.id, e.target.value);
                          else next.delete(company.id);
                          return next;
                        });
                      }}
                      className="w-20 h-8 text-xs"
                    />
                  )}
                </div>
              );
            })}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAssignDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSaveAssignments}>Save Assignments</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default CommissionPage;
