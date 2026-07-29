import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { ArrowLeft, DollarSign, FileText, TrendingUp, AlertCircle, Download, Lock } from "lucide-react";
import { format } from "date-fns";
import { useToast } from "@/hooks/use-toast";

interface PeriodData {
  period_month: string;
  invoice_count: number;
  total_invoiced: number;
  total_commission: number;
  invoices: Array<{
    invoice_id: string;
    invoice_number: string | null;
    customer_name: string | null;
    invoice_date: string | null;
    sub_total: number;
    commission_rate: number;
    commission_amount: number;
    locked_at: string | null;
  }>;
}

interface Statement {
  rep: { id: string; name: string; email: string; commission_rate: number; commission_method: string };
  totals: {
    lifetime_commission: number;
    lifetime_invoiced: number;
    invoice_count: number;
    approved_adjustments: number;
    open_disputes: number;
  };
  periods: PeriodData[];
  batches: Array<{
    id: string;
    period_month: string;
    status: string;
    total_amount: number | null;
    approved_at: string | null;
    paid_at: string | null;
    notes: string | null;
  }>;
  adjustments: Array<{
    id: string;
    kind: string;
    amount: number;
    reason: string | null;
    status: string;
    created_at: string;
  }>;
}

const formatCurrency = (n: number) =>
  new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR" }).format(n || 0);

const RepStatementsPage = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [statement, setStatement] = useState<Statement | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) {
      navigate("/");
      return;
    }
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const { data, error: fnErr } = await supabase.functions.invoke("rep-self-statement");
        if (fnErr) {
          const details = (fnErr as any)?.context ? await (fnErr as any).context.text() : fnErr.message;
          throw new Error(details || fnErr.message);
        }
        if (data?.error) throw new Error(data.error);
        setStatement(data as Statement);
      } catch (e: any) {
        setError(e?.message || "Failed to load statement");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [user, navigate]);

  const exportPeriodCsv = (period: PeriodData) => {
    if (!statement) return;
    const rows = [
      ["Invoice", "Customer", "Date", "Sub Total", "Rate %", "Commission", "Status"],
      ...period.invoices.map(inv => [
        inv.invoice_number || inv.invoice_id,
        inv.customer_name || "",
        inv.invoice_date || "",
        inv.sub_total.toFixed(2),
        inv.commission_rate.toFixed(2),
        inv.commission_amount.toFixed(2),
        inv.locked_at ? "Locked" : "Pending",
      ]),
      [],
      ["Totals", "", "", period.total_invoiced.toFixed(2), "", period.total_commission.toFixed(2), ""],
    ];
    const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `my-commission-${period.period_month}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast({ title: "Statement downloaded" });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background p-6 space-y-4">
        <Skeleton className="h-10 w-64" />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
        </div>
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-background p-6 flex items-center justify-center">
        <Card className="max-w-md w-full">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-destructive">
              <AlertCircle className="h-5 w-5" />
              Unable to load your statement
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">{error}</p>
            <Button onClick={() => navigate("/admin-dashboard")} variant="outline">
              <ArrowLeft className="h-4 w-4 mr-2" /> Back
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!statement) return null;

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 bg-card/80 backdrop-blur-xl border-b border-border">
        <div className="px-4 py-3 flex items-center justify-between max-w-5xl mx-auto">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate("/admin-dashboard")}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <h1 className="text-lg font-semibold">My Commission Statements</h1>
              <p className="text-xs text-muted-foreground">{statement.rep.name} · {statement.rep.email}</p>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6 space-y-6">
        {/* Totals */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
                <DollarSign className="h-3.5 w-3.5" /> Lifetime commission (locked)
              </div>
              <div className="text-2xl font-bold text-primary">
                {formatCurrency(statement.totals.lifetime_commission)}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
                <FileText className="h-3.5 w-3.5" /> Invoices counted
              </div>
              <div className="text-2xl font-bold">{statement.totals.invoice_count}</div>
              <div className="text-xs text-muted-foreground mt-1">
                {formatCurrency(statement.totals.lifetime_invoiced)} invoiced
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
                <TrendingUp className="h-3.5 w-3.5" /> Adjustments
              </div>
              <div className={`text-2xl font-bold ${statement.totals.approved_adjustments >= 0 ? "text-emerald-500" : "text-red-500"}`}>
                {statement.totals.approved_adjustments >= 0 ? "+" : ""}
                {formatCurrency(statement.totals.approved_adjustments)}
              </div>
              {statement.totals.open_disputes > 0 && (
                <Badge variant="secondary" className="mt-1 text-[10px]">
                  {statement.totals.open_disputes} open
                </Badge>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Periods */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Locked payouts by period</CardTitle>
          </CardHeader>
          <CardContent>
            {statement.periods.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                No locked payouts yet. Once admin locks a period, it will appear here.
              </p>
            ) : (
              <Accordion type="multiple" className="w-full">
                {statement.periods.map(period => (
                  <AccordionItem key={period.period_month} value={period.period_month}>
                    <AccordionTrigger className="hover:no-underline">
                      <div className="flex-1 flex items-center justify-between pr-4">
                        <div className="text-left">
                          <div className="font-medium">
                            {format(new Date(period.period_month + "-01"), "MMMM yyyy")}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {period.invoice_count} invoice{period.invoice_count === 1 ? "" : "s"} · {formatCurrency(period.total_invoiced)}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="font-bold text-primary">{formatCurrency(period.total_commission)}</div>
                          <div className="text-[10px] text-muted-foreground flex items-center justify-end gap-1">
                            <Lock className="h-3 w-3" /> locked
                          </div>
                        </div>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent>
                      <div className="space-y-2">
                        <div className="flex justify-end">
                          <Button size="sm" variant="outline" onClick={() => exportPeriodCsv(period)}>
                            <Download className="h-3.5 w-3.5 mr-1" /> Export CSV
                          </Button>
                        </div>
                        <div className="rounded-md border overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead className="bg-muted/50">
                              <tr>
                                <th className="text-left px-3 py-2 font-medium">Invoice</th>
                                <th className="text-left px-3 py-2 font-medium">Customer</th>
                                <th className="text-left px-3 py-2 font-medium">Date</th>
                                <th className="text-right px-3 py-2 font-medium">Sub Total</th>
                                <th className="text-right px-3 py-2 font-medium">Rate</th>
                                <th className="text-right px-3 py-2 font-medium">Commission</th>
                              </tr>
                            </thead>
                            <tbody>
                              {period.invoices.map(inv => (
                                <tr key={inv.invoice_id} className="border-t">
                                  <td className="px-3 py-2 font-mono text-xs">{inv.invoice_number || inv.invoice_id}</td>
                                  <td className="px-3 py-2">{inv.customer_name || "—"}</td>
                                  <td className="px-3 py-2 text-xs text-muted-foreground">
                                    {inv.invoice_date ? format(new Date(inv.invoice_date), "d MMM yyyy") : "—"}
                                  </td>
                                  <td className="px-3 py-2 text-right">{formatCurrency(inv.sub_total)}</td>
                                  <td className="px-3 py-2 text-right text-xs">{inv.commission_rate.toFixed(2)}%</td>
                                  <td className="px-3 py-2 text-right font-medium text-primary">{formatCurrency(inv.commission_amount)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            )}
          </CardContent>
        </Card>

        {/* Batches */}
        {statement.batches.length > 0 && (
          <Card>
            <CardHeader><CardTitle className="text-base">Payout batches</CardTitle></CardHeader>
            <CardContent>
              <div className="space-y-2">
                {statement.batches.map(b => (
                  <div key={b.id} className="flex items-center justify-between p-3 rounded-md border">
                    <div>
                      <div className="font-medium text-sm">
                        {format(new Date(b.period_month + "-01"), "MMMM yyyy")}
                      </div>
                      {b.notes && <div className="text-xs text-muted-foreground">{b.notes}</div>}
                      <div className="text-[10px] text-muted-foreground mt-0.5">
                        {b.approved_at && `Approved ${format(new Date(b.approved_at), "d MMM yyyy")}`}
                        {b.paid_at && ` · Paid ${format(new Date(b.paid_at), "d MMM yyyy")}`}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-bold">{formatCurrency(Number(b.total_amount) || 0)}</div>
                      <Badge
                        variant={b.status === "paid" ? "default" : b.status === "approved" ? "secondary" : "outline"}
                        className="text-[10px]"
                      >
                        {b.status}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Adjustments */}
        {statement.adjustments.length > 0 && (
          <Card>
            <CardHeader><CardTitle className="text-base">Adjustments & disputes</CardTitle></CardHeader>
            <CardContent>
              <div className="space-y-2">
                {statement.adjustments.map(a => (
                  <div key={a.id} className="flex items-start justify-between p-3 rounded-md border">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-[10px] capitalize">{a.kind}</Badge>
                        <Badge
                          variant={a.status === "applied" || a.status === "approved" ? "default" : a.status === "rejected" ? "destructive" : "secondary"}
                          className="text-[10px] capitalize"
                        >
                          {a.status}
                        </Badge>
                        <span className="text-[10px] text-muted-foreground">
                          {format(new Date(a.created_at), "d MMM yyyy")}
                        </span>
                      </div>
                      {a.reason && <p className="text-sm mt-1">{a.reason}</p>}
                    </div>
                    <div className={`font-bold ${a.amount >= 0 ? "text-emerald-500" : "text-red-500"}`}>
                      {a.amount >= 0 ? "+" : ""}{formatCurrency(a.amount)}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
};

export default RepStatementsPage;
