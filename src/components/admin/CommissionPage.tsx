import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Plus, Pencil, Trash2, Users, DollarSign, FileText, Download, ChevronDown, ChevronRight, Loader2, RefreshCw
} from "lucide-react";
import { format, startOfMonth, endOfMonth } from "date-fns";

type Rep = {
  id: string;
  name: string;
  email: string | null;
  commission_rate: number;
  created_at: string;
};

type Company = {
  id: string;
  name: string;
  code: string;
};

type RepAssignment = {
  rep_id: string;
  company_id: string;
};

type CommissionInvoice = {
  invoice_number: string;
  customer_name: string;
  date: string;
  total: number;
  commission: number;
};

type CommissionRepData = {
  rep_id: string;
  rep_name: string;
  rep_email: string | null;
  commission_rate: number;
  total_invoiced: number;
  commission_earned: number;
  invoice_count: number;
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
  const [repForm, setRepForm] = useState({ name: "", email: "", commission_rate: "5" });
  const [assignDialogOpen, setAssignDialogOpen] = useState(false);
  const [assignRepId, setAssignRepId] = useState<string | null>(null);
  const [selectedCompanies, setSelectedCompanies] = useState<Set<string>>(new Set());
  const [loadingReps, setLoadingReps] = useState(true);

  // Commission report state
  const [selectedMonth, setSelectedMonth] = useState(() => format(new Date(), "yyyy-MM"));
  const [commissionData, setCommissionData] = useState<CommissionResult | null>(null);
  const [loadingReport, setLoadingReport] = useState(false);
  const [expandedReps, setExpandedReps] = useState<Set<string>>(new Set());

  // Fetch reps, companies, assignments
  const fetchData = useCallback(async () => {
    setLoadingReps(true);
    try {
      const [repsRes, companiesRes, assignRes] = await Promise.all([
        supabase.from("reps").select("*").order("name"),
        supabase.from("companies").select("id, name, code").order("name"),
        supabase.from("rep_company_assignments").select("rep_id, company_id"),
      ]);
      if (repsRes.data) setReps(repsRes.data);
      if (companiesRes.data) setCompanies(companiesRes.data);
      if (assignRes.data) setAssignments(assignRes.data);
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
      }).eq("id", editingRep.id);
      if (error) {
        toast({ title: "Error", description: error.message, variant: "destructive" });
        return;
      }
      toast({ title: "Rep updated" });
    } else {
      const { error } = await supabase.from("reps").insert({
        name: repForm.name.trim(),
        email: repForm.email.trim() || null,
        commission_rate: rate,
      });
      if (error) {
        toast({ title: "Error", description: error.message, variant: "destructive" });
        return;
      }
      toast({ title: "Rep added" });
    }

    setRepDialogOpen(false);
    setEditingRep(null);
    setRepForm({ name: "", email: "", commission_rate: "5" });
    fetchData();
  };

  const handleDeleteRep = async (id: string) => {
    const { error } = await supabase.from("reps").delete().eq("id", id);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Rep deleted" });
    fetchData();
  };

  const openEditRep = (rep: Rep) => {
    setEditingRep(rep);
    setRepForm({ name: rep.name, email: rep.email || "", commission_rate: String(rep.commission_rate) });
    setRepDialogOpen(true);
  };

  const openAssignDialog = (repId: string) => {
    setAssignRepId(repId);
    const current = new Set(assignments.filter(a => a.rep_id === repId).map(a => a.company_id));
    setSelectedCompanies(current);
    setAssignDialogOpen(true);
  };

  const handleSaveAssignments = async () => {
    if (!assignRepId) return;

    const currentAssigned = assignments.filter(a => a.rep_id === assignRepId).map(a => a.company_id);
    const toAdd = [...selectedCompanies].filter(c => !currentAssigned.includes(c));
    const toRemove = currentAssigned.filter(c => !selectedCompanies.has(c));

    for (const companyId of toRemove) {
      await supabase.from("rep_company_assignments")
        .delete()
        .eq("rep_id", assignRepId)
        .eq("company_id", companyId);
    }

    for (const companyId of toAdd) {
      await supabase.from("rep_company_assignments").insert({
        rep_id: assignRepId,
        company_id: companyId,
      });
    }

    toast({ title: "Assignments updated" });
    setAssignDialogOpen(false);
    fetchData();
  };

  // Commission report
  const fetchCommissionReport = async () => {
    setLoadingReport(true);
    try {
      const [year, month] = selectedMonth.split("-").map(Number);
      const dateStart = format(startOfMonth(new Date(year, month - 1)), "yyyy-MM-dd");
      const dateEnd = format(endOfMonth(new Date(year, month - 1)), "yyyy-MM-dd");

      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast({ title: "Not authenticated", variant: "destructive" });
        return;
      }

      const response = await supabase.functions.invoke("rep-commission-data", {
        body: { date_start: dateStart, date_end: dateEnd },
      });

      if (response.error) {
        throw new Error(response.error.message || "Failed to fetch commission data");
      }

      setCommissionData(response.data as CommissionResult);
    } catch (e: any) {
      console.error("Commission report error:", e);
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setLoadingReport(false);
    }
  };

  const toggleExpanded = (repId: string) => {
    setExpandedReps(prev => {
      const next = new Set(prev);
      if (next.has(repId)) next.delete(repId);
      else next.add(repId);
      return next;
    });
  };

  const exportCsv = () => {
    if (!commissionData?.data) return;
    const rows = [["Rep", "Email", "Rate %", "Total Invoiced", "Commission Earned", "Invoice Count"]];
    for (const d of commissionData.data) {
      rows.push([d.rep_name, d.rep_email || "", String(d.commission_rate), String(d.total_invoiced), String(d.commission_earned), String(d.invoice_count)]);
      for (const inv of d.invoices) {
        rows.push(["", inv.invoice_number, inv.customer_name, inv.date, String(inv.total), String(inv.commission)]);
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

  const formatCurrency = (n: number) => `R ${n.toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const getRepAssignedCompanies = (repId: string) =>
    assignments.filter(a => a.rep_id === repId).map(a => companies.find(c => c.id === a.company_id)?.name).filter(Boolean);

  return (
    <div className="space-y-4">
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="report"><FileText className="h-4 w-4 mr-1.5" />Commission Report</TabsTrigger>
          <TabsTrigger value="reps"><Users className="h-4 w-4 mr-1.5" />Manage Reps</TabsTrigger>
        </TabsList>

        {/* Commission Report Tab */}
        <TabsContent value="report" className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <Input
              type="month"
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="w-48"
            />
            <Button onClick={fetchCommissionReport} disabled={loadingReport}>
              {loadingReport ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <RefreshCw className="h-4 w-4 mr-1.5" />}
              Calculate
            </Button>
            {commissionData && (
              <Button variant="outline" onClick={exportCsv}>
                <Download className="h-4 w-4 mr-1.5" />Export CSV
              </Button>
            )}
          </div>

          {/* Summary Cards */}
          {commissionData && (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <Card>
                  <CardContent className="pt-4 pb-3">
                    <p className="text-xs text-muted-foreground">Total Invoiced</p>
                    <p className="text-2xl font-bold text-foreground">{formatCurrency(commissionData.summary.totalInvoiced)}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-4 pb-3">
                    <p className="text-xs text-muted-foreground">Total Commission</p>
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
                  <Card key={d.rep_id}>
                    <CardHeader className="pb-2 cursor-pointer" onClick={() => toggleExpanded(d.rep_id)}>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          {expandedReps.has(d.rep_id) ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                          <CardTitle className="text-base">{d.rep_name}</CardTitle>
                          <Badge variant="secondary">{d.commission_rate}%</Badge>
                        </div>
                        <div className="flex items-center gap-4 text-sm">
                          <span className="text-muted-foreground">{d.invoice_count} invoices</span>
                          <span className="font-medium">{formatCurrency(d.total_invoiced)}</span>
                          <span className="font-bold text-primary">{formatCurrency(d.commission_earned)}</span>
                        </div>
                      </div>
                      {d.companies.length > 0 && (
                        <p className="text-xs text-muted-foreground mt-1">
                          Clients: {d.companies.join(", ")}
                        </p>
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
                                <th className="text-right p-2 font-medium">Total</th>
                                <th className="text-right p-2 font-medium">Commission</th>
                              </tr>
                            </thead>
                            <tbody>
                              {d.invoices.map((inv, i) => (
                                <tr key={i} className="border-t">
                                  <td className="p-2">{inv.invoice_number}</td>
                                  <td className="p-2">{inv.customer_name}</td>
                                  <td className="p-2">{inv.date}</td>
                                  <td className="p-2 text-right">{formatCurrency(inv.total)}</td>
                                  <td className="p-2 text-right font-medium text-primary">{formatCurrency(inv.commission)}</td>
                                </tr>
                              ))}
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

          {!commissionData && !loadingReport && (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                <DollarSign className="h-12 w-12 mx-auto mb-3 opacity-30" />
                <p className="text-lg font-medium">Select a month and click Calculate</p>
                <p className="text-sm">Commission will be calculated from Zoho invoices matched to rep-assigned companies</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Manage Reps Tab */}
        <TabsContent value="reps" className="space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-lg font-semibold">Sales Reps</h2>
            <Button onClick={() => { setEditingRep(null); setRepForm({ name: "", email: "", commission_rate: "5" }); setRepDialogOpen(true); }}>
              <Plus className="h-4 w-4 mr-1.5" />Add Rep
            </Button>
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
              {reps.map((rep) => {
                const assignedCompanies = getRepAssignedCompanies(rep.id);
                return (
                  <Card key={rep.id}>
                    <CardContent className="py-4 flex items-center justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{rep.name}</span>
                          <Badge variant="secondary">{rep.commission_rate}%</Badge>
                        </div>
                        {rep.email && <p className="text-xs text-muted-foreground">{rep.email}</p>}
                        {assignedCompanies.length > 0 ? (
                          <div className="flex flex-wrap gap-1 mt-1.5">
                            {assignedCompanies.map((name, i) => (
                              <Badge key={i} variant="outline" className="text-xs">{name}</Badge>
                            ))}
                          </div>
                        ) : (
                          <p className="text-xs text-amber-500 mt-1">No companies assigned</p>
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
              <Label>Commission Rate (%)</Label>
              <Input type="number" step="0.5" min="0" max="100" value={repForm.commission_rate} onChange={e => setRepForm(f => ({ ...f, commission_rate: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRepDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSaveRep}>{editingRep ? "Save" : "Add"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Assign Companies Dialog */}
      <Dialog open={assignDialogOpen} onOpenChange={setAssignDialogOpen}>
        <DialogContent className="max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Assign Companies to {reps.find(r => r.id === assignRepId)?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 max-h-[50vh] overflow-y-auto">
            {companies.map((company) => (
              <label key={company.id} className="flex items-center gap-2 p-2 rounded-lg hover:bg-muted/50 cursor-pointer">
                <Checkbox
                  checked={selectedCompanies.has(company.id)}
                  onCheckedChange={(checked) => {
                    setSelectedCompanies(prev => {
                      const next = new Set(prev);
                      if (checked) next.add(company.id);
                      else next.delete(company.id);
                      return next;
                    });
                  }}
                />
                <span className="text-sm">{company.name}</span>
                <span className="text-xs text-muted-foreground">({company.code})</span>
              </label>
            ))}
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
