import { useState, useEffect, useMemo, useCallback, useRef, Fragment } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import {
  Search, Download, ShoppingCart, Package, RefreshCw, Loader2,
  AlertTriangle, TrendingUp, TrendingDown, Minus, ChevronDown, ChevronRight,
  ArrowUpDown, ArrowUp, ArrowDown, Layers, Clock, Flame, CheckCircle2,
  FileSpreadsheet, Users, Printer, Mail, StickyNote, Copy, X,
  BarChart3, Filter, Maximize2, Minimize2, ClipboardCopy, Timer,
  ChevronUp, Eye, PieChart, Send, History, Truck, CalendarDays,
  CheckSquare, Snowflake, Sun, Leaf, Cloud, Zap, Save, RotateCcw
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

interface BuyingSheetRow {
  sku: string;
  itemName: string;
  totalNeeded: number;
  stockOnHand: number;
  onPurchaseOrder: number;
  toOrder: number;
  orders: { orderNumber: string; customerName: string; quantity: number; urgency?: string }[];
  supplierName: string;
  supplierId: string | null;
  supplierEmail?: string;
  daysWaiting: number;
  priorityScore: number;
  coveragePercent: number;
  hasUrgent: boolean;
  demandTrend: "up" | "down" | "stable" | "new";
  lastMonthQty: number;
  prevMonthQty: number;
  stockoutRiskDays: number | null;
  lastPurchasedDate: string | null;
  seasonalPattern: "peak" | "low" | "normal" | null;
  avgLeadTimeDays: number | null;
}

interface SuggestedRestockRow {
  sku: string;
  itemName: string;
  monthsAppeared: number;
  avgMonthlyQty: number;
  totalOrders: number;
  lastOrderedDate: string;
}

interface ZohoStockData {
  [sku: string]: { stockOnHand: number; onPurchaseOrder: number; vendorName?: string; vendorEmail?: string };
}

type SortField = "sku" | "itemName" | "totalNeeded" | "stockOnHand" | "onPurchaseOrder" | "toOrder" | "supplierName" | "daysWaiting" | "priorityScore" | "stockoutRiskDays";
type SortDirection = "asc" | "desc";
type PriorityFilter = "all" | "critical" | "high" | "medium" | "low";

const NOTES_KEY = "buying-sheet-notes";
const loadNotes = (): Record<string, string> => {
  try { return JSON.parse(localStorage.getItem(NOTES_KEY) || "{}"); } catch { return {}; }
};
const saveNotes = (notes: Record<string, string>) => {
  localStorage.setItem(NOTES_KEY, JSON.stringify(notes));
};

export default function BuyingSheetPage() {
  const { toast } = useToast();
  const [rows, setRows] = useState<BuyingSheetRow[]>([]);
  const [suggestedRows, setSuggestedRows] = useState<SuggestedRestockRow[]>([]);
  const [suggestedOpen, setSuggestedOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [zohoLoading, setZohoLoading] = useState(false);
  const [zohoData, setZohoData] = useState<ZohoStockData | null>(null);
  const [search, setSearch] = useState("");
  const [supplierFilter, setSupplierFilter] = useState<string>("all");
  const [showOnlyNeedOrder, setShowOnlyNeedOrder] = useState(true);
  const [sortField, setSortField] = useState<SortField>("priorityScore");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [groupBySupplier, setGroupBySupplier] = useState(false);
  const [selectedSkus, setSelectedSkus] = useState<Set<string>>(new Set());
  const [priorityFilter, setPriorityFilter] = useState<PriorityFilter>("all");
  const [notes, setNotes] = useState<Record<string, string>>(loadNotes);
  const [editingNote, setEditingNote] = useState<string | null>(null);
  const [noteText, setNoteText] = useState("");
  const [demandHistory, setDemandHistory] = useState<Map<string, { lastMonth: number; prevMonth: number }>>(new Map());
  const [expandedSkus, setExpandedSkus] = useState<Set<string>>(new Set());
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showSupplierChart, setShowSupplierChart] = useState(false);
  const [lastPurchaseMap, setLastPurchaseMap] = useState<Map<string, string>>(new Map());
  const [leadTimeMap, setLeadTimeMap] = useState<Map<string, number>>(new Map());
  const [seasonalMap, setSeasonalMap] = useState<Map<string, "peak" | "low" | "normal">>(new Map());
  const [emailDraftOpen, setEmailDraftOpen] = useState(false);
  const [emailDraftSupplier, setEmailDraftSupplier] = useState<string | null>(null);
  const [emailDraftBody, setEmailDraftBody] = useState("");
  const [snapshotSaved, setSnapshotSaved] = useState(false);
  const [showSnapshot, setShowSnapshot] = useState(false);
  const [snapshotData, setSnapshotData] = useState<{ date: string; rows: { sku: string; toOrder: number }[] } | null>(null);
  const [bulkOrdering, setBulkOrdering] = useState(false);
  const printRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchDemandHistory();
    fetchLastPurchaseDates();
    fetchLeadTimes();
    fetchSeasonalPatterns();
    loadSnapshot();
    fetchLocalData();
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === "f" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        document.querySelector<HTMLInputElement>('[placeholder*="Search"]')?.focus();
      }
      if (e.key === "Escape" && isFullscreen) setIsFullscreen(false);
      if (e.key === "g" && !e.metaKey && !e.ctrlKey) setGroupBySupplier(v => !v);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isFullscreen]);

  const getAuthHeaders = async () => {
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData?.session?.access_token;
    return {
      'Authorization': `Bearer ${token}`,
      'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
    };
  };

  const fetchDemandHistory = async () => {
    try {
      const now = new Date();
      const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);
      const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 2, 1);
      const prevMonthEnd = new Date(now.getFullYear(), now.getMonth() - 1, 0);

      const [lastRes, prevRes] = await Promise.all([
        supabase.from("order_items").select("code, quantity")
          .not("code", "is", null)
          .gte("created_at", lastMonthStart.toISOString())
          .lte("created_at", lastMonthEnd.toISOString()),
        supabase.from("order_items").select("code, quantity")
          .not("code", "is", null)
          .gte("created_at", prevMonthStart.toISOString())
          .lte("created_at", prevMonthEnd.toISOString()),
      ]);

      const lastMap = new Map<string, number>();
      const prevMap = new Map<string, number>();
      (lastRes.data || []).forEach(i => {
        const sku = (i.code || "").toUpperCase();
        lastMap.set(sku, (lastMap.get(sku) || 0) + (i.quantity || 1));
      });
      (prevRes.data || []).forEach(i => {
        const sku = (i.code || "").toUpperCase();
        prevMap.set(sku, (prevMap.get(sku) || 0) + (i.quantity || 1));
      });

      const history = new Map<string, { lastMonth: number; prevMonth: number }>();
      const allSkus = new Set([...lastMap.keys(), ...prevMap.keys()]);
      allSkus.forEach(sku => {
        history.set(sku, { lastMonth: lastMap.get(sku) || 0, prevMonth: prevMap.get(sku) || 0 });
      });
      setDemandHistory(history);
    } catch (err) {
      console.error("Failed to fetch demand history:", err);
    }
  };

  // Fetch lead times per supplier (avg days from order creation to completion)
  const fetchLeadTimes = async () => {
    try {
      const { data } = await supabase
        .from("order_items")
        .select("code, created_at, completed_at, order_id")
        .eq("progress_stage", "completed")
        .not("code", "is", null)
        .not("completed_at", "is", null);
      
      const skuLeadTimes = new Map<string, number[]>();
      (data || []).forEach(item => {
        if (!item.created_at || !item.completed_at) return;
        const sku = (item.code || "").toUpperCase();
        const days = Math.max(0, Math.round((new Date(item.completed_at).getTime() - new Date(item.created_at).getTime()) / (1000 * 60 * 60 * 24)));
        const arr = skuLeadTimes.get(sku) || [];
        arr.push(days);
        skuLeadTimes.set(sku, arr);
      });

      const map = new Map<string, number>();
      skuLeadTimes.forEach((days, sku) => {
        map.set(sku, Math.round(days.reduce((a, b) => a + b, 0) / days.length));
      });
      setLeadTimeMap(map);
    } catch (err) {
      console.error("Failed to fetch lead times:", err);
    }
  };

  // Fetch seasonal patterns (compare current month historically)
  const fetchSeasonalPatterns = async () => {
    try {
      const now = new Date();
      const currentMonth = now.getMonth();
      const { data } = await supabase
        .from("order_items")
        .select("code, quantity, created_at")
        .not("code", "is", null);

      const skuMonthlyTotals = new Map<string, Map<number, number[]>>();
      (data || []).forEach(item => {
        const sku = (item.code || "").toUpperCase();
        const month = new Date(item.created_at).getMonth();
        if (!skuMonthlyTotals.has(sku)) skuMonthlyTotals.set(sku, new Map());
        const monthMap = skuMonthlyTotals.get(sku)!;
        const arr = monthMap.get(month) || [];
        arr.push(item.quantity || 1);
        monthMap.set(month, arr);
      });

      const map = new Map<string, "peak" | "low" | "normal">();
      skuMonthlyTotals.forEach((monthMap, sku) => {
        const allMonthAvgs: number[] = [];
        monthMap.forEach((qtys) => {
          allMonthAvgs.push(qtys.reduce((a, b) => a + b, 0) / qtys.length);
        });
        const overallAvg = allMonthAvgs.length > 0 ? allMonthAvgs.reduce((a, b) => a + b, 0) / allMonthAvgs.length : 0;
        const currentMonthQtys = monthMap.get(currentMonth) || [];
        const currentAvg = currentMonthQtys.length > 0 ? currentMonthQtys.reduce((a, b) => a + b, 0) / currentMonthQtys.length : 0;
        
        if (overallAvg > 0 && currentAvg > overallAvg * 1.3) map.set(sku, "peak");
        else if (overallAvg > 0 && currentAvg < overallAvg * 0.7) map.set(sku, "low");
        else if (monthMap.size >= 2) map.set(sku, "normal");
      });
      setSeasonalMap(map);
    } catch (err) {
      console.error("Failed to fetch seasonal patterns:", err);
    }
  };

  // Snapshot management
  const SNAPSHOT_KEY = "buying-sheet-snapshot";
  const loadSnapshot = () => {
    try {
      const raw = localStorage.getItem(SNAPSHOT_KEY);
      if (raw) setSnapshotData(JSON.parse(raw));
    } catch { /* ignore */ }
  };
  const saveSnapshot = () => {
    const snapshot = { date: new Date().toISOString(), rows: sortedRows.map(r => ({ sku: r.sku, toOrder: r.toOrder })) };
    localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(snapshot));
    setSnapshotData(snapshot);
    setSnapshotSaved(true);
    setTimeout(() => setSnapshotSaved(false), 2000);
    toast({ title: "Snapshot Saved", description: `${snapshot.rows.length} items saved for comparison` });
  };
  const getSnapshotDiff = (sku: string, currentToOrder: number): { diff: number; isNew: boolean } | null => {
    if (!snapshotData || !showSnapshot) return null;
    const prev = snapshotData.rows.find(r => r.sku === sku);
    if (!prev) return { diff: currentToOrder, isNew: true };
    const diff = currentToOrder - prev.toOrder;
    if (diff === 0) return null;
    return { diff, isNew: false };
  };

  // Bulk mark as ordered
  const handleBulkMarkOrdered = async () => {
    if (selectedSkus.size === 0) return;
    setBulkOrdering(true);
    try {
      const targetRows = sortedRows.filter(r => selectedSkus.has(r.sku));
      const orderItemIds: string[] = [];
      for (const row of targetRows) {
        const { data } = await supabase
          .from("order_items")
          .select("id")
          .eq("progress_stage", "awaiting-stock")
          .ilike("code", row.sku);
        if (data) orderItemIds.push(...data.map(d => d.id));
      }
      if (orderItemIds.length > 0) {
        const { error } = await supabase
          .from("order_items")
          .update({ stock_status: "ordered" as any, notes: `Marked ordered from buying sheet on ${new Date().toLocaleDateString()}` })
          .in("id", orderItemIds);
        if (error) throw error;
        toast({ title: "Updated", description: `${orderItemIds.length} items marked as ordered` });
        setSelectedSkus(new Set());
        fetchLocalData();
      }
    } catch (err) {
      console.error("Bulk order failed:", err);
      toast({ title: "Error", description: "Failed to update items", variant: "destructive" });
    } finally {
      setBulkOrdering(false);
    }
  };

  // Email draft generator
  const generateEmailDraft = (supplierName: string) => {
    const items = sortedRows.filter(r => r.supplierName === supplierName && r.toOrder > 0);
    if (items.length === 0) return;
    const itemLines = items.map(r => `  • ${r.sku} — ${r.itemName} — Qty: ${r.toOrder}`).join("\n");
    const totalQty = items.reduce((s, r) => s + r.toOrder, 0);
    const body = `Dear ${supplierName},\n\nPlease find below our purchase order requirements:\n\n${itemLines}\n\nTotal items: ${items.length}\nTotal quantity: ${totalQty}\n\nPlease confirm availability and expected delivery date.\n\nKind regards`;
    setEmailDraftBody(body);
    setEmailDraftSupplier(supplierName);
    setEmailDraftOpen(true);
  };

  const fetchLastPurchaseDates = async () => {
    try {
      const { data } = await supabase
        .from("order_items")
        .select("code, completed_at")
        .eq("progress_stage", "completed")
        .not("code", "is", null)
        .not("completed_at", "is", null)
        .order("completed_at", { ascending: false });

      const map = new Map<string, string>();
      (data || []).forEach(item => {
        const sku = (item.code || "").toUpperCase();
        if (!map.has(sku) && item.completed_at) map.set(sku, item.completed_at);
      });
      setLastPurchaseMap(map);
    } catch (err) {
      console.error("Failed to fetch last purchase dates:", err);
    }
  };

  const fetchZohoData = async (): Promise<ZohoStockData | null> => {
    setZohoLoading(true);
    try {
      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
      const headers = await getAuthHeaders();
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/buying-sheet-data`,
        { headers }
      );
      const result = await response.json();
      if (result.success && result.data) {
        setZohoData(result.data);
        return result.data;
      } else {
        console.error("Zoho data fetch failed:", result.error);
        toast({ title: "Zoho Data", description: result.error || "Could not fetch stock data from Zoho", variant: "destructive" });
        return null;
      }
    } catch (error) {
      console.error("Failed to fetch Zoho data:", error);
      toast({ title: "Error", description: "Failed to connect to Zoho Books", variant: "destructive" });
      return null;
    } finally {
      setZohoLoading(false);
    }
  };

  const fetchSuggestedRestock = async (activeSkus: Set<string>) => {
    try {
      const threeMonthsAgo = new Date();
      threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);

      const { data: completedItems, error } = await supabase
        .from("order_items")
        .select("code, name, quantity, completed_at, order_id")
        .eq("progress_stage", "completed")
        .not("code", "is", null)
        .gte("completed_at", threeMonthsAgo.toISOString())
        .order("completed_at", { ascending: false });

      if (error || !completedItems?.length) return;

      const skuMonthMap = new Map<string, {
        itemName: string;
        months: Map<string, number>;
        totalOrders: number;
        lastDate: string;
      }>();

      for (const item of completedItems) {
        const sku = (item.code || "").toUpperCase();
        if (!sku || activeSkus.has(sku)) continue;
        const monthKey = (item.completed_at || "").substring(0, 7);
        if (!monthKey) continue;

        const existing = skuMonthMap.get(sku);
        if (existing) {
          const currentMonthQty = existing.months.get(monthKey) || 0;
          existing.months.set(monthKey, currentMonthQty + (item.quantity || 1));
          existing.totalOrders++;
        } else {
          const months = new Map<string, number>();
          months.set(monthKey, item.quantity || 1);
          skuMonthMap.set(sku, { itemName: item.name, months, totalOrders: 1, lastDate: item.completed_at || "" });
        }
      }

      const suggested: SuggestedRestockRow[] = [];
      for (const [sku, data] of skuMonthMap.entries()) {
        if (data.months.size < 2) continue;
        const totalQty = Array.from(data.months.values()).reduce((a, b) => a + b, 0);
        suggested.push({
          sku,
          itemName: data.itemName,
          monthsAppeared: data.months.size,
          avgMonthlyQty: Math.round(totalQty / data.months.size),
          totalOrders: data.totalOrders,
          lastOrderedDate: data.lastDate,
        });
      }

      suggested.sort((a, b) => b.monthsAppeared - a.monthsAppeared || b.avgMonthlyQty - a.avgMonthlyQty);
      setSuggestedRows(suggested);
    } catch (err) {
      console.error("Failed to fetch suggested restock:", err);
    }
  };

  const getDemandTrend = (sku: string): { trend: "up" | "down" | "stable" | "new"; lastMonth: number; prevMonth: number } => {
    const history = demandHistory.get(sku);
    if (!history) return { trend: "new", lastMonth: 0, prevMonth: 0 };
    if (history.prevMonth === 0 && history.lastMonth > 0) return { trend: "up", ...history };
    if (history.lastMonth === 0 && history.prevMonth === 0) return { trend: "new", ...history };
    const change = history.lastMonth - history.prevMonth;
    const percentChange = history.prevMonth > 0 ? (change / history.prevMonth) * 100 : 0;
    if (percentChange > 15) return { trend: "up", ...history };
    if (percentChange < -15) return { trend: "down", ...history };
    return { trend: "stable", ...history };
  };

  // Calculate stockout risk: days of stock remaining based on daily demand rate
  const getStockoutRiskDays = (sku: string, stockOnHand: number, onPO: number): number | null => {
    const history = demandHistory.get(sku);
    if (!history || (history.lastMonth === 0 && history.prevMonth === 0)) return null;
    const avgMonthlyDemand = (history.lastMonth + history.prevMonth) / 2;
    if (avgMonthlyDemand === 0) return null;
    const dailyDemand = avgMonthlyDemand / 30;
    const totalAvailable = stockOnHand + onPO;
    return Math.round(totalAvailable / dailyDemand);
  };

  const fetchLocalData = async () => {
    setLoading(true);
    try {
      const { data: orderItems, error: itemsError } = await supabase
        .from("order_items")
        .select("id, name, code, quantity, progress_stage, order_id, created_at")
        .in("progress_stage", ["awaiting-stock"])
        .order("created_at", { ascending: false });

      if (itemsError) throw itemsError;

      const activeSkus = new Set<string>();
      if (!orderItems?.length) {
        setRows([]);
        setLoading(false);
        fetchSuggestedRestock(activeSkus);
        return;
      }

      const orderIds = [...new Set(orderItems.map((i) => i.order_id))];

      const { data: orders } = await supabase
        .from("orders")
        .select("id, order_number, company_id, supplier_id, urgency")
        .in("id", orderIds);

      const companyIds = [...new Set((orders || []).map((o) => o.company_id).filter(Boolean))] as string[];
      const supplierIdsFromOrders = [...new Set((orders || []).map((o) => o.supplier_id).filter(Boolean))] as string[];

      const { data: orderPOs } = await supabase
        .from("order_purchase_orders")
        .select("order_id, supplier_id")
        .in("order_id", orderIds);

      const allSupplierIds = [...new Set([
        ...supplierIdsFromOrders,
        ...(orderPOs || []).map((p) => p.supplier_id),
      ])];

      const [companiesRes, suppliersRes] = await Promise.all([
        companyIds.length > 0 ? supabase.from("companies").select("id, name").in("id", companyIds) : { data: [] },
        allSupplierIds.length > 0 ? supabase.from("suppliers").select("id, name, email").in("id", allSupplierIds) : { data: [] },
      ]);

      const companiesMap = new Map((companiesRes.data || []).map((c) => [c.id, c.name]));
      const suppliersMap = new Map((suppliersRes.data || []).map((s) => [s.id, { name: s.name, email: s.email }]));
      const ordersMap = new Map((orders || []).map((o) => [o.id, o]));
      const orderSupplierMap = new Map<string, { name: string; id: string | null; email?: string }>();
      (orderPOs || []).forEach((po) => {
        const supplier = suppliersMap.get(po.supplier_id);
        orderSupplierMap.set(po.order_id, {
          name: supplier?.name || "Unknown",
          id: po.supplier_id,
          email: supplier?.email || undefined,
        });
      });

      const skuMap = new Map<string, {
        sku: string;
        itemName: string;
        totalNeeded: number;
        orders: { orderNumber: string; customerName: string; quantity: number; urgency?: string }[];
        supplierName: string;
        supplierId: string | null;
        supplierEmail?: string;
        oldestCreatedAt: string;
        hasUrgent: boolean;
      }>();

      for (const item of orderItems) {
        const sku = (item.code || "NO-SKU").toUpperCase();
        activeSkus.add(sku);
        const order = ordersMap.get(item.order_id);
        const customerName = order?.company_id ? companiesMap.get(order.company_id) || "Unknown" : "Unknown";
        const urgency = order?.urgency || "normal";

        let supplierName = "No Supplier";
        let supplierId: string | null = null;
        let supplierEmail: string | undefined;
        const poSupplier = orderSupplierMap.get(item.order_id);
        if (poSupplier) {
          supplierName = poSupplier.name;
          supplierId = poSupplier.id;
          supplierEmail = poSupplier.email;
        } else if (order?.supplier_id) {
          const supplier = suppliersMap.get(order.supplier_id);
          supplierName = supplier?.name || "Unknown";
          supplierId = order.supplier_id;
          supplierEmail = supplier?.email || undefined;
        }

        const existing = skuMap.get(sku);
        if (existing) {
          existing.totalNeeded += item.quantity;
          existing.orders.push({ orderNumber: order?.order_number || "—", customerName, quantity: item.quantity, urgency });
          if (item.created_at < existing.oldestCreatedAt) existing.oldestCreatedAt = item.created_at;
          if (urgency === "urgent" || urgency === "critical") existing.hasUrgent = true;
        } else {
          skuMap.set(sku, {
            sku,
            itemName: item.name,
            totalNeeded: item.quantity,
            orders: [{ orderNumber: order?.order_number || "—", customerName, quantity: item.quantity, urgency }],
            supplierName,
            supplierId,
            supplierEmail,
            oldestCreatedAt: item.created_at,
            hasUrgent: urgency === "urgent" || urgency === "critical",
          });
        }
      }

      const zohoStock = zohoData || {};
      const now = Date.now();
      const buyingRows: BuyingSheetRow[] = Array.from(skuMap.values()).map((entry) => {
        const zohoEntry = zohoStock[entry.sku] || { stockOnHand: 0, onPurchaseOrder: 0, vendorName: '', vendorEmail: '' };
        const toOrder = Math.max(0, entry.totalNeeded - zohoEntry.stockOnHand - zohoEntry.onPurchaseOrder);
        const supplierName = entry.supplierName === "No Supplier" && zohoEntry.vendorName
          ? zohoEntry.vendorName : entry.supplierName;
        const supplierEmail = entry.supplierEmail || zohoEntry.vendorEmail || undefined;
        const daysWaiting = Math.floor((now - new Date(entry.oldestCreatedAt).getTime()) / (1000 * 60 * 60 * 24));
        const covered = zohoEntry.stockOnHand + zohoEntry.onPurchaseOrder;
        const coveragePercent = entry.totalNeeded > 0 ? Math.min(100, Math.round((covered / entry.totalNeeded) * 100)) : 100;
        const { trend, lastMonth, prevMonth } = getDemandTrend(entry.sku);
        const stockoutRiskDays = getStockoutRiskDays(entry.sku, zohoEntry.stockOnHand, zohoEntry.onPurchaseOrder);
        const lastPurchasedDate = lastPurchaseMap.get(entry.sku) || null;
        const seasonalPattern = seasonalMap.get(entry.sku) || null;
        const avgLeadTimeDays = leadTimeMap.get(entry.sku) ?? null;

        let priorityScore = 0;
        if (toOrder > 0) priorityScore += 30;
        if (entry.hasUrgent) priorityScore += 40;
        if (daysWaiting > 7) priorityScore += 15;
        if (daysWaiting > 3) priorityScore += 10;
        if (coveragePercent < 25) priorityScore += 15;
        else if (coveragePercent < 50) priorityScore += 10;
        priorityScore += Math.min(20, entry.orders.length * 5);
        if (stockoutRiskDays !== null && stockoutRiskDays <= 7) priorityScore += 15;
        else if (stockoutRiskDays !== null && stockoutRiskDays <= 14) priorityScore += 5;
        if (seasonalPattern === "peak") priorityScore += 10;

        return {
          ...entry,
          supplierName,
          supplierEmail,
          stockOnHand: zohoEntry.stockOnHand,
          onPurchaseOrder: zohoEntry.onPurchaseOrder,
          toOrder,
          daysWaiting,
          priorityScore,
          coveragePercent,
          demandTrend: trend,
          lastMonthQty: lastMonth,
          prevMonthQty: prevMonth,
          stockoutRiskDays,
          lastPurchasedDate,
          seasonalPattern,
          avgLeadTimeDays,
        };
      });

      buyingRows.sort((a, b) => b.priorityScore - a.priorityScore);
      setRows(buyingRows);
      fetchSuggestedRestock(activeSkus);
    } catch (error) {
      console.error("Failed to fetch buying sheet data:", error);
    } finally {
      setLoading(false);
    }

    fetchZohoData().then((zoho) => {
      if (zoho) {
        setRows((prev) =>
          prev.map((row) => {
            const zohoEntry = zoho[row.sku] || { stockOnHand: 0, onPurchaseOrder: 0, vendorName: '', vendorEmail: '' };
            const toOrder = Math.max(0, row.totalNeeded - zohoEntry.stockOnHand - zohoEntry.onPurchaseOrder);
            const supplierName = row.supplierName === "No Supplier" && zohoEntry.vendorName
              ? zohoEntry.vendorName : row.supplierName;
            const supplierEmail = row.supplierEmail || zohoEntry.vendorEmail || undefined;
            const covered = zohoEntry.stockOnHand + zohoEntry.onPurchaseOrder;
            const coveragePercent = row.totalNeeded > 0 ? Math.min(100, Math.round((covered / row.totalNeeded) * 100)) : 100;
            const stockoutRiskDays = getStockoutRiskDays(row.sku, zohoEntry.stockOnHand, zohoEntry.onPurchaseOrder);
            let priorityScore = 0;
            if (toOrder > 0) priorityScore += 30;
            if (row.hasUrgent) priorityScore += 40;
            if (row.daysWaiting > 7) priorityScore += 15;
            if (row.daysWaiting > 3) priorityScore += 10;
            if (coveragePercent < 25) priorityScore += 15;
            else if (coveragePercent < 50) priorityScore += 10;
            priorityScore += Math.min(20, row.orders.length * 5);
            if (stockoutRiskDays !== null && stockoutRiskDays <= 7) priorityScore += 15;
            else if (stockoutRiskDays !== null && stockoutRiskDays <= 14) priorityScore += 5;
            return { ...row, supplierName, supplierEmail, stockOnHand: zohoEntry.stockOnHand, onPurchaseOrder: zohoEntry.onPurchaseOrder, toOrder, coveragePercent, priorityScore, stockoutRiskDays };
          })
        );
        toast({ title: "Updated", description: "Zoho stock & PO data loaded" });
      }
    });
  };

  const handleRefreshZoho = async () => {
    const zoho = await fetchZohoData();
    if (zoho) {
      setRows((prev) =>
        prev.map((row) => {
          const zohoEntry = zoho[row.sku] || { stockOnHand: 0, onPurchaseOrder: 0, vendorName: '', vendorEmail: '' };
          const toOrder = Math.max(0, row.totalNeeded - zohoEntry.stockOnHand - zohoEntry.onPurchaseOrder);
          const supplierName = row.supplierName === "No Supplier" && zohoEntry.vendorName
            ? zohoEntry.vendorName : row.supplierName;
          const covered = zohoEntry.stockOnHand + zohoEntry.onPurchaseOrder;
          const coveragePercent = row.totalNeeded > 0 ? Math.min(100, Math.round((covered / row.totalNeeded) * 100)) : 100;
          const stockoutRiskDays = getStockoutRiskDays(row.sku, zohoEntry.stockOnHand, zohoEntry.onPurchaseOrder);
          let priorityScore = 0;
          if (toOrder > 0) priorityScore += 30;
          if (row.hasUrgent) priorityScore += 40;
          if (row.daysWaiting > 7) priorityScore += 15;
          if (row.daysWaiting > 3) priorityScore += 10;
          if (coveragePercent < 25) priorityScore += 15;
          else if (coveragePercent < 50) priorityScore += 10;
          priorityScore += Math.min(20, row.orders.length * 5);
          if (stockoutRiskDays !== null && stockoutRiskDays <= 7) priorityScore += 15;
          else if (stockoutRiskDays !== null && stockoutRiskDays <= 14) priorityScore += 5;
          return { ...row, supplierName, stockOnHand: zohoEntry.stockOnHand, onPurchaseOrder: zohoEntry.onPurchaseOrder, toOrder, coveragePercent, priorityScore, stockoutRiskDays };
        })
      );
      toast({ title: "Updated", description: "Stock & PO data refreshed from Zoho Books" });
    }
  };

  const handleSort = useCallback((field: SortField) => {
    setSortField((prev) => {
      if (prev === field) {
        setSortDirection((d) => (d === "asc" ? "desc" : "asc"));
        return prev;
      }
      setSortDirection(field === "sku" || field === "itemName" || field === "supplierName" ? "asc" : "desc");
      return field;
    });
  }, []);

  const uniqueSuppliers = useMemo(() => {
    const suppliers = new Map<string, { name: string; count: number; totalToOrder: number; email?: string }>();
    rows.forEach((r) => {
      if (r.supplierId) {
        const existing = suppliers.get(r.supplierId);
        if (existing) {
          existing.count++;
          existing.totalToOrder += r.toOrder;
        } else {
          suppliers.set(r.supplierId, { name: r.supplierName, count: 1, totalToOrder: r.toOrder, email: r.supplierEmail });
        }
      }
    });
    return Array.from(suppliers.entries()).sort((a, b) => a[1].name.localeCompare(b[1].name));
  }, [rows]);

  // Supplier concentration data for chart
  const supplierConcentration = useMemo(() => {
    const map = new Map<string, number>();
    rows.forEach(r => {
      const name = r.supplierName || "No Supplier";
      map.set(name, (map.get(name) || 0) + r.toOrder);
    });
    const sorted = Array.from(map.entries())
      .sort((a, b) => b[1] - a[1]);
    const total = sorted.reduce((s, [, v]) => s + v, 0);
    const colors = [
      "hsl(var(--primary))",
      "hsl(var(--chart-2))",
      "hsl(var(--chart-3))",
      "hsl(var(--chart-4))",
      "hsl(var(--chart-5))",
      "hsl(var(--muted-foreground))",
    ];
    return sorted.map(([name, qty], i) => ({
      name,
      qty,
      percent: total > 0 ? Math.round((qty / total) * 100) : 0,
      color: colors[i % colors.length],
    }));
  }, [rows]);

  const getPriorityLevel = (score: number): PriorityFilter => {
    if (score >= 70) return "critical";
    if (score >= 50) return "high";
    if (score >= 30) return "medium";
    return "low";
  };

  const priorityCounts = useMemo(() => {
    const counts = { critical: 0, high: 0, medium: 0, low: 0 };
    rows.forEach(r => {
      const level = getPriorityLevel(r.priorityScore);
      counts[level]++;
    });
    return counts;
  }, [rows]);

  const filteredRows = useMemo(() => {
    return rows.filter((row) => {
      const matchesSearch = !search ||
        row.itemName.toLowerCase().includes(search.toLowerCase()) ||
        row.sku.toLowerCase().includes(search.toLowerCase()) ||
        row.supplierName.toLowerCase().includes(search.toLowerCase()) ||
        row.orders.some((o) => o.orderNumber.toLowerCase().includes(search.toLowerCase()) || o.customerName.toLowerCase().includes(search.toLowerCase()));
      const matchesSupplier = supplierFilter === "all" || row.supplierId === supplierFilter;
      const matchesNeedOrder = !showOnlyNeedOrder || row.toOrder > 0;
      const matchesPriority = priorityFilter === "all" || getPriorityLevel(row.priorityScore) === priorityFilter;
      return matchesSearch && matchesSupplier && matchesNeedOrder && matchesPriority;
    });
  }, [rows, search, supplierFilter, showOnlyNeedOrder, priorityFilter]);

  const sortedRows = useMemo(() => {
    const sorted = [...filteredRows];
    sorted.sort((a, b) => {
      let aVal: any = a[sortField];
      let bVal: any = b[sortField];
      // Handle nulls for stockoutRiskDays
      if (aVal === null) aVal = sortDirection === "asc" ? Infinity : -Infinity;
      if (bVal === null) bVal = sortDirection === "asc" ? Infinity : -Infinity;
      if (typeof aVal === "string") aVal = aVal.toLowerCase();
      if (typeof bVal === "string") bVal = bVal.toLowerCase();
      if (aVal < bVal) return sortDirection === "asc" ? -1 : 1;
      if (aVal > bVal) return sortDirection === "asc" ? 1 : -1;
      return 0;
    });
    return sorted;
  }, [filteredRows, sortField, sortDirection]);

  const groupedRows = useMemo(() => {
    if (!groupBySupplier) return null;
    const groups = new Map<string, BuyingSheetRow[]>();
    for (const row of sortedRows) {
      const key = row.supplierName || "No Supplier";
      const existing = groups.get(key) || [];
      existing.push(row);
      groups.set(key, existing);
    }
    return Array.from(groups.entries()).sort((a, b) => {
      const aTotalPriority = a[1].reduce((s, r) => s + r.priorityScore, 0);
      const bTotalPriority = b[1].reduce((s, r) => s + r.priorityScore, 0);
      return bTotalPriority - aTotalPriority;
    });
  }, [sortedRows, groupBySupplier]);

  const totals = useMemo(() => {
    return filteredRows.reduce((acc, r) => ({
      needed: acc.needed + r.totalNeeded,
      inStock: acc.inStock + r.stockOnHand,
      onPO: acc.onPO + r.onPurchaseOrder,
      toOrder: acc.toOrder + r.toOrder,
      urgent: acc.urgent + (r.hasUrgent ? 1 : 0),
      avgDays: acc.avgDays + r.daysWaiting,
      stockoutRisk: acc.stockoutRisk + (r.stockoutRiskDays !== null && r.stockoutRiskDays <= 7 ? 1 : 0),
    }), { needed: 0, inStock: 0, onPO: 0, toOrder: 0, urgent: 0, avgDays: 0, stockoutRisk: 0 });
  }, [filteredRows]);

  const avgDaysWaiting = filteredRows.length > 0 ? Math.round(totals.avgDays / filteredRows.length) : 0;

  const toggleSelect = (sku: string) => {
    setSelectedSkus((prev) => {
      const next = new Set(prev);
      if (next.has(sku)) next.delete(sku);
      else next.add(sku);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedSkus.size === sortedRows.length) {
      setSelectedSkus(new Set());
    } else {
      setSelectedSkus(new Set(sortedRows.map((r) => r.sku)));
    }
  };

  const toggleExpand = (sku: string) => {
    setExpandedSkus(prev => {
      const next = new Set(prev);
      if (next.has(sku)) next.delete(sku);
      else next.add(sku);
      return next;
    });
  };

  const handleSaveNote = (sku: string) => {
    const updated = { ...notes, [sku]: noteText };
    if (!noteText.trim()) delete updated[sku];
    setNotes(updated);
    saveNotes(updated);
    setEditingNote(null);
    setNoteText("");
  };

  const handleOpenNote = (sku: string) => {
    setEditingNote(sku);
    setNoteText(notes[sku] || "");
  };

  const handleCopySupplierEmails = () => {
    const emails = new Set<string>();
    const targetRows = selectedSkus.size > 0 ? sortedRows.filter(r => selectedSkus.has(r.sku)) : sortedRows;
    targetRows.forEach(r => {
      if (r.supplierEmail) emails.add(r.supplierEmail);
    });
    if (emails.size === 0) {
      toast({ title: "No emails", description: "No supplier emails found for selected items", variant: "destructive" });
      return;
    }
    navigator.clipboard.writeText(Array.from(emails).join("; "));
    toast({ title: "Copied!", description: `${emails.size} supplier email${emails.size !== 1 ? "s" : ""} copied to clipboard` });
  };

  // Copy a formatted PO line to clipboard
  const handleCopyPOLine = (row: BuyingSheetRow) => {
    const line = `${row.sku}\t${row.itemName}\t${row.toOrder}\t${row.supplierName}`;
    navigator.clipboard.writeText(line);
    toast({ title: "Copied", description: `PO line for ${row.sku} copied` });
  };

  // Copy all selected as PO lines
  const handleCopySelectedPOLines = () => {
    const targetRows = sortedRows.filter(r => selectedSkus.has(r.sku));
    const header = "SKU\tItem Name\tQty to Order\tSupplier";
    const lines = targetRows.map(r => `${r.sku}\t${r.itemName}\t${r.toOrder}\t${r.supplierName}`);
    navigator.clipboard.writeText([header, ...lines].join("\n"));
    toast({ title: "Copied", description: `${targetRows.length} PO lines copied` });
  };

  const handlePrint = () => {
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;

    const targetRows = selectedSkus.size > 0 ? sortedRows.filter(r => selectedSkus.has(r.sku)) : sortedRows;
    const date = new Date().toLocaleDateString();

    const groups = new Map<string, BuyingSheetRow[]>();
    for (const row of targetRows) {
      const key = row.supplierName || "No Supplier";
      const existing = groups.get(key) || [];
      existing.push(row);
      groups.set(key, existing);
    }

    let html = `<!DOCTYPE html><html><head><title>Buying Sheet - ${date}</title>
    <style>
      body { font-family: Arial, sans-serif; font-size: 11px; padding: 20px; color: #333; }
      h1 { font-size: 18px; margin-bottom: 5px; }
      h2 { font-size: 14px; margin: 20px 0 8px; padding: 5px 8px; background: #f0f0f0; border-radius: 4px; }
      .date { color: #666; font-size: 12px; margin-bottom: 15px; }
      .summary { display: flex; gap: 20px; margin-bottom: 15px; padding: 10px; background: #f8f8f8; border-radius: 6px; }
      .summary-item { text-align: center; }
      .summary-label { font-size: 10px; color: #666; text-transform: uppercase; }
      .summary-value { font-size: 16px; font-weight: bold; }
      table { width: 100%; border-collapse: collapse; margin-bottom: 15px; }
      th { text-align: left; padding: 6px 8px; border-bottom: 2px solid #333; font-size: 10px; text-transform: uppercase; color: #666; }
      td { padding: 5px 8px; border-bottom: 1px solid #ddd; }
      .text-right { text-align: right; }
      .bold { font-weight: bold; }
      .urgent { color: #dc2626; font-weight: bold; }
      .total-row { border-top: 2px solid #333; font-weight: bold; background: #f8f8f8; }
      .note { font-style: italic; color: #666; font-size: 10px; }
      .risk { font-size: 10px; padding: 2px 6px; border-radius: 3px; }
      .risk-critical { background: #fde2e2; color: #dc2626; }
      .risk-warning { background: #fef3c7; color: #d97706; }
      @media print { body { padding: 0; } }
    </style></head><body>
    <h1>📋 Buying Sheet</h1>
    <p class="date">Generated: ${date} | ${targetRows.length} SKUs | To Order: ${totals.toOrder.toLocaleString()} units</p>
    <div class="summary">
      <div class="summary-item"><div class="summary-label">Total Needed</div><div class="summary-value">${totals.needed.toLocaleString()}</div></div>
      <div class="summary-item"><div class="summary-label">In Stock</div><div class="summary-value">${totals.inStock.toLocaleString()}</div></div>
      <div class="summary-item"><div class="summary-label">On PO</div><div class="summary-value">${totals.onPO.toLocaleString()}</div></div>
      <div class="summary-item"><div class="summary-label">To Order</div><div class="summary-value" style="color:#2563eb">${totals.toOrder.toLocaleString()}</div></div>
      <div class="summary-item"><div class="summary-label">Stockout Risk</div><div class="summary-value" style="color:#dc2626">${totals.stockoutRisk}</div></div>
    </div>`;

    for (const [supplier, items] of groups.entries()) {
      const supplierTotal = items.reduce((s, r) => s + r.toOrder, 0);
      const supplierEmail = items.find(i => i.supplierEmail)?.supplierEmail;
      html += `<h2>${supplier}${supplierEmail ? ` (${supplierEmail})` : ""}</h2>`;
      html += `<table><thead><tr>
        <th>SKU</th><th>Item</th><th class="text-right">Needed</th>
        <th class="text-right">Stock</th><th class="text-right">On PO</th>
        <th class="text-right">To Order</th><th>Risk</th><th>Orders</th><th>Notes</th>
      </tr></thead><tbody>`;
      for (const item of items) {
        const note = notes[item.sku] || "";
        const riskLabel = item.stockoutRiskDays !== null
          ? (item.stockoutRiskDays <= 7 ? `<span class="risk risk-critical">${item.stockoutRiskDays}d</span>` : item.stockoutRiskDays <= 14 ? `<span class="risk risk-warning">${item.stockoutRiskDays}d</span>` : `${item.stockoutRiskDays}d`)
          : "—";
        html += `<tr>
          <td style="font-family:monospace;font-size:10px">${item.sku}</td>
          <td>${item.itemName}</td>
          <td class="text-right">${item.totalNeeded}</td>
          <td class="text-right">${item.stockOnHand}</td>
          <td class="text-right">${item.onPurchaseOrder}</td>
          <td class="text-right ${item.toOrder > 0 ? "urgent" : ""}">${item.toOrder}</td>
          <td>${riskLabel}</td>
          <td style="font-size:10px">${item.orders.map(o => `${o.orderNumber} (${o.customerName})`).join(", ")}</td>
          <td class="note">${note}</td>
        </tr>`;
      }
      html += `<tr class="total-row"><td colspan="5">Total for ${supplier}</td><td class="text-right">${supplierTotal}</td><td colspan="3"></td></tr>`;
      html += `</tbody></table>`;
    }

    html += `</body></html>`;
    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.print();
  };

  const handleExportCSV = () => {
    const targetRows = selectedSkus.size > 0 ? sortedRows.filter((r) => selectedSkus.has(r.sku)) : sortedRows;
    const headers = ["SKU", "Item Name", "Total Needed", "In Stock (Zoho)", "On PO (Zoho)", "To Order", "Coverage %", "Days Waiting", "Stockout Risk (days)", "Priority", "Supplier", "Demand Trend", "Last Purchased", "Notes", "Orders"];
    const csvRows = targetRows.map((r) => [
      r.sku, r.itemName, r.totalNeeded.toString(), r.stockOnHand.toString(),
      r.onPurchaseOrder.toString(), r.toOrder.toString(), r.coveragePercent.toString(),
      r.daysWaiting.toString(), r.stockoutRiskDays?.toString() || "N/A", r.priorityScore.toString(), r.supplierName,
      r.demandTrend, r.lastPurchasedDate ? new Date(r.lastPurchasedDate).toLocaleDateString() : "N/A",
      notes[r.sku] || "",
      r.orders.map((o) => `${o.orderNumber} (${o.customerName}: ${o.quantity})`).join("; "),
    ]);
    const csv = [headers, ...csvRows].map((r) => r.map((c) => `"${c}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `buying-sheet-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportBySupplier = () => {
    const targetRows = selectedSkus.size > 0 ? sortedRows.filter((r) => selectedSkus.has(r.sku)) : sortedRows;
    const groups = new Map<string, BuyingSheetRow[]>();
    for (const row of targetRows) {
      const key = row.supplierName || "No Supplier";
      const existing = groups.get(key) || [];
      existing.push(row);
      groups.set(key, existing);
    }

    let csv = "";
    for (const [supplier, items] of groups.entries()) {
      csv += `\n"SUPPLIER: ${supplier}"\n`;
      csv += `"SKU","Item Name","Qty to Order","Currently in Stock","On PO","Stockout Risk","Notes"\n`;
      const totalToOrder = items.reduce((s, r) => s + r.toOrder, 0);
      for (const item of items) {
        csv += `"${item.sku}","${item.itemName}","${item.toOrder}","${item.stockOnHand}","${item.onPurchaseOrder}","${item.stockoutRiskDays ?? 'N/A'}","${notes[item.sku] || ""}"\n`;
      }
      csv += `"","TOTAL","${totalToOrder}","","","",""\n`;
    }

    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `buying-sheet-by-supplier-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const SortableHeader = ({ field, children, className = "" }: { field: SortField; children: React.ReactNode; className?: string }) => (
    <TableHead className={`cursor-pointer select-none hover:bg-muted/50 transition-colors ${className}`} onClick={() => handleSort(field)}>
      <div className="flex items-center gap-1">
        {children}
        {sortField === field ? (
          sortDirection === "asc" ? <ArrowUp className="h-3 w-3 text-primary" /> : <ArrowDown className="h-3 w-3 text-primary" />
        ) : (
          <ArrowUpDown className="h-3 w-3 text-muted-foreground/40" />
        )}
      </div>
    </TableHead>
  );

  const PriorityBadge = ({ score }: { score: number }) => {
    if (score >= 70) return <Badge className="bg-destructive text-destructive-foreground gap-1 text-xs"><Flame className="h-3 w-3" />Critical</Badge>;
    if (score >= 50) return <Badge className="bg-orange-500 text-white gap-1 text-xs"><AlertTriangle className="h-3 w-3" />High</Badge>;
    if (score >= 30) return <Badge variant="secondary" className="gap-1 text-xs"><Clock className="h-3 w-3" />Medium</Badge>;
    return <Badge variant="outline" className="gap-1 text-xs"><CheckCircle2 className="h-3 w-3" />Low</Badge>;
  };

  const CoverageBar = ({ percent }: { percent: number }) => (
    <div className="flex items-center gap-2 min-w-[100px]">
      <Progress
        value={percent}
        className={`h-2 flex-1 ${percent >= 100 ? "[&>div]:bg-emerald-500" : percent >= 50 ? "[&>div]:bg-amber-500" : "[&>div]:bg-destructive"}`}
      />
      <span className="text-xs text-muted-foreground w-8 text-right">{percent}%</span>
    </div>
  );

  const DemandTrendIcon = ({ trend, lastMonth, prevMonth }: { trend: string; lastMonth: number; prevMonth: number }) => {
    const label = trend === "up" ? `↑ Demand rising (${prevMonth} → ${lastMonth})` :
                  trend === "down" ? `↓ Demand falling (${prevMonth} → ${lastMonth})` :
                  trend === "new" ? "New item" :
                  `Stable (${lastMonth}/mo)`;
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex items-center">
            {trend === "up" && <TrendingUp className="h-3.5 w-3.5 text-emerald-500" />}
            {trend === "down" && <TrendingDown className="h-3.5 w-3.5 text-destructive" />}
            {trend === "stable" && <Minus className="h-3.5 w-3.5 text-muted-foreground" />}
            {trend === "new" && <BarChart3 className="h-3.5 w-3.5 text-primary" />}
          </span>
        </TooltipTrigger>
        <TooltipContent><p className="text-xs">{label}</p></TooltipContent>
      </Tooltip>
    );
  };

  const StockoutRiskBadge = ({ days }: { days: number | null }) => {
    if (days === null) return <span className="text-xs text-muted-foreground/50">—</span>;
    if (days <= 7) return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge variant="destructive" className="text-xs gap-1 animate-pulse"><Timer className="h-3 w-3" />{days}d</Badge>
        </TooltipTrigger>
        <TooltipContent><p className="text-xs">⚠️ Stock runs out in ~{days} days at current demand rate</p></TooltipContent>
      </Tooltip>
    );
    if (days <= 14) return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge className="text-xs gap-1 bg-orange-500 text-white"><Timer className="h-3 w-3" />{days}d</Badge>
        </TooltipTrigger>
        <TooltipContent><p className="text-xs">Stock runs out in ~{days} days at current demand rate</p></TooltipContent>
      </Tooltip>
    );
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="text-xs text-muted-foreground">{days}d</span>
        </TooltipTrigger>
        <TooltipContent><p className="text-xs">~{days} days of stock remaining at current demand</p></TooltipContent>
      </Tooltip>
    );
  };

  const renderExpandedRow = (row: BuyingSheetRow) => (
    <TableRow key={`expanded-${row.sku}`} className="bg-muted/30">
      <TableCell colSpan={16}>
        <div className="py-2 px-4 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {/* Order Breakdown */}
            <div>
              <p className="text-xs font-semibold text-muted-foreground mb-1.5">Order Breakdown</p>
              <div className="space-y-1">
                {row.orders.map((o, i) => (
                  <div key={i} className="flex items-center justify-between text-xs p-1.5 rounded bg-background/60">
                    <div className="flex items-center gap-1.5">
                      <span className="font-mono font-medium text-foreground">{o.orderNumber}</span>
                      {(o.urgency === "urgent" || o.urgency === "critical") && <Flame className="h-3 w-3 text-destructive" />}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground">{o.customerName}</span>
                      <Badge variant="outline" className="text-[10px]">×{o.quantity}</Badge>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Stock & Demand Info */}
            <div>
              <p className="text-xs font-semibold text-muted-foreground mb-1.5">Stock & Demand</p>
              <div className="space-y-1.5 text-xs">
                <div className="flex justify-between"><span className="text-muted-foreground">Last Month Demand:</span><span className="font-medium">{row.lastMonthQty}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Previous Month:</span><span className="font-medium">{row.prevMonthQty}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Coverage:</span><CoverageBar percent={row.coveragePercent} /></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Stockout Risk:</span><StockoutRiskBadge days={row.stockoutRiskDays} /></div>
                {row.avgLeadTimeDays !== null && (
                  <div className="flex justify-between"><span className="text-muted-foreground">Avg Lead Time:</span><span className="font-medium">{row.avgLeadTimeDays}d</span></div>
                )}
                {row.seasonalPattern && (
                  <div className="flex justify-between"><span className="text-muted-foreground">Season:</span>
                    <span className="flex items-center gap-1 font-medium">
                      {row.seasonalPattern === "peak" && <><Sun className="h-3 w-3 text-orange-500" />Peak</>}
                      {row.seasonalPattern === "low" && <><Snowflake className="h-3 w-3 text-blue-500" />Low</>}
                      {row.seasonalPattern === "normal" && <><Leaf className="h-3 w-3 text-emerald-500" />Normal</>}
                    </span>
                  </div>
                )}
                {row.lastPurchasedDate && (
                  <div className="flex justify-between"><span className="text-muted-foreground">Last Purchased:</span><span className="font-medium">{new Date(row.lastPurchasedDate).toLocaleDateString()}</span></div>
                )}
              </div>
            </div>

            {/* Quick Actions & Note */}
            <div>
              <p className="text-xs font-semibold text-muted-foreground mb-1.5">Quick Actions</p>
              <div className="space-y-1.5">
                <Button variant="outline" size="sm" className="w-full justify-start gap-2 text-xs" onClick={() => handleCopyPOLine(row)}>
                  <ClipboardCopy className="h-3 w-3" />Copy PO Line
                </Button>
                {row.supplierEmail && (
                  <Button variant="outline" size="sm" className="w-full justify-start gap-2 text-xs" onClick={() => {
                    navigator.clipboard.writeText(row.supplierEmail!);
                    toast({ title: "Copied", description: `${row.supplierEmail} copied` });
                  }}>
                    <Mail className="h-3 w-3" />Copy Supplier Email
                  </Button>
                )}
                <Button variant="outline" size="sm" className="w-full justify-start gap-2 text-xs" onClick={() => generateEmailDraft(row.supplierName)}>
                  <Send className="h-3 w-3" />Draft Email to {row.supplierName}
                </Button>
                {notes[row.sku] && (
                  <div className="p-2 rounded bg-primary/5 border border-primary/10">
                    <p className="text-[10px] font-medium text-primary mb-0.5">Note:</p>
                    <p className="text-xs text-muted-foreground">{notes[row.sku]}</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </TableCell>
    </TableRow>
  );

  const renderRow = (row: BuyingSheetRow) => {
    const isExpanded = expandedSkus.has(row.sku);
    return (
      <Fragment key={row.sku}>
        <TableRow
          className={`cursor-pointer transition-colors ${row.toOrder > 0 ? "" : "opacity-60"} ${selectedSkus.has(row.sku) ? "bg-primary/5" : ""} ${row.hasUrgent ? "border-l-2 border-l-destructive" : ""} ${isExpanded ? "bg-muted/20" : ""}`}
        >
          <TableCell className="w-8" onClick={(e) => e.stopPropagation()}>
            <Checkbox checked={selectedSkus.has(row.sku)} onCheckedChange={() => toggleSelect(row.sku)} />
          </TableCell>
          <TableCell onClick={() => toggleExpand(row.sku)}>
            <div className="flex items-center gap-1">
              {isExpanded ? <ChevronUp className="h-3 w-3 text-muted-foreground" /> : <ChevronDown className="h-3 w-3 text-muted-foreground/40" />}
              <PriorityBadge score={row.priorityScore} />
            </div>
          </TableCell>
          <TableCell className="font-mono text-xs text-muted-foreground" onClick={() => toggleExpand(row.sku)}>{row.sku}</TableCell>
          <TableCell className="font-medium max-w-[180px] truncate" onClick={() => toggleExpand(row.sku)}>{row.itemName}</TableCell>
          <TableCell className="text-right font-semibold" onClick={() => toggleExpand(row.sku)}>{row.totalNeeded}</TableCell>
          <TableCell className="text-right font-medium" onClick={() => toggleExpand(row.sku)}>{row.stockOnHand}</TableCell>
          <TableCell className="text-right font-medium" onClick={() => toggleExpand(row.sku)}>{row.onPurchaseOrder}</TableCell>
          <TableCell onClick={() => toggleExpand(row.sku)}><CoverageBar percent={row.coveragePercent} /></TableCell>
          <TableCell className="text-right" onClick={() => toggleExpand(row.sku)}>
            {row.toOrder > 0 ? (
              <Badge variant="destructive" className="font-bold">{row.toOrder}</Badge>
            ) : (
              <Badge variant="outline" className="text-accent-foreground">0</Badge>
            )}
          </TableCell>
          <TableCell className="text-center" onClick={() => toggleExpand(row.sku)}>
            <StockoutRiskBadge days={row.stockoutRiskDays} />
          </TableCell>
          <TableCell className="text-center" onClick={() => toggleExpand(row.sku)}>
            <DemandTrendIcon trend={row.demandTrend} lastMonth={row.lastMonthQty} prevMonth={row.prevMonthQty} />
          </TableCell>
          <TableCell className="text-center" onClick={() => toggleExpand(row.sku)}>
            <span className={`text-sm font-medium ${row.daysWaiting > 7 ? "text-destructive" : row.daysWaiting > 3 ? "text-orange-500" : "text-muted-foreground"}`}>
              {row.daysWaiting}d
            </span>
          </TableCell>
          <TableCell className="text-sm" onClick={() => toggleExpand(row.sku)}>{row.supplierName}</TableCell>
          <TableCell onClick={() => toggleExpand(row.sku)}>
            <span className="text-xs text-muted-foreground">
              {row.orders.length} order{row.orders.length !== 1 ? "s" : ""}
            </span>
          </TableCell>
          <TableCell className="w-8" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-0.5">
              <Popover open={editingNote === row.sku} onOpenChange={(open) => { if (!open) setEditingNote(null); }}>
                <PopoverTrigger asChild>
                  <button
                    onClick={() => handleOpenNote(row.sku)}
                    className={`p-1 rounded hover:bg-muted transition-colors ${notes[row.sku] ? "text-primary" : "text-muted-foreground/40"}`}
                  >
                    <StickyNote className="h-3.5 w-3.5" />
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-64 p-3" side="left">
                  <div className="space-y-2">
                    <p className="text-xs font-medium text-muted-foreground">Note for {row.sku}</p>
                    <Textarea
                      value={noteText}
                      onChange={(e) => setNoteText(e.target.value)}
                      placeholder="Add procurement note..."
                      className="min-h-[60px] text-sm"
                      autoFocus
                    />
                    <div className="flex gap-1 justify-end">
                      {notes[row.sku] && (
                        <Button variant="ghost" size="sm" onClick={() => { setNoteText(""); handleSaveNote(row.sku); }}>
                          <X className="h-3 w-3 mr-1" />Clear
                        </Button>
                      )}
                      <Button size="sm" onClick={() => handleSaveNote(row.sku)}>Save</Button>
                    </div>
                  </div>
                </PopoverContent>
              </Popover>
              <button
                onClick={() => handleCopyPOLine(row)}
                className="p-1 rounded hover:bg-muted transition-colors text-muted-foreground/40 hover:text-foreground"
              >
                <ClipboardCopy className="h-3.5 w-3.5" />
              </button>
            </div>
          </TableCell>
        </TableRow>
        {isExpanded && renderExpandedRow(row)}
      </Fragment>
    );
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-64" />
        <div className="grid grid-cols-6 gap-2">{[1,2,3,4,5,6].map(i => <Skeleton key={i} className="h-20" />)}</div>
        <Skeleton className="h-[400px] w-full" />
      </div>
    );
  }

  const colSpanCount = 15;

  return (
    <TooltipProvider>
      <div className={`space-y-4 ${isFullscreen ? "fixed inset-0 z-50 bg-background p-4 overflow-auto" : ""}`} ref={printRef}>
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2 flex-wrap">
            <ShoppingCart className="h-5 w-5 text-primary" />
            <h2 className="text-lg sm:text-xl font-bold text-foreground">Buying Sheet</h2>
            <Badge variant="outline">{filteredRows.length} SKUs</Badge>
            {zohoLoading && <Badge variant="secondary" className="gap-1"><Loader2 className="h-3 w-3 animate-spin" />Loading Zoho...</Badge>}
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Button variant="outline" size="sm" onClick={() => setIsFullscreen(!isFullscreen)} className="gap-2">
              {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
              {isFullscreen ? "Exit" : "Focus"}
            </Button>
            <Button variant={showSupplierChart ? "default" : "outline"} size="sm" onClick={() => setShowSupplierChart(!showSupplierChart)} className="gap-2">
              <PieChart className="h-4 w-4" />
              Suppliers
            </Button>
            <Button variant={groupBySupplier ? "default" : "outline"} size="sm" onClick={() => setGroupBySupplier(!groupBySupplier)} className="gap-2">
              <Layers className="h-4 w-4" />
              {groupBySupplier ? "Grouped" : "Group"}
            </Button>
            <Button variant="outline" size="sm" onClick={handleRefreshZoho} disabled={zohoLoading} className="gap-2">
              {zohoLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              Zoho
            </Button>
            <Button variant="outline" size="sm" onClick={handlePrint} className="gap-2">
              <Printer className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" onClick={handleCopySupplierEmails} className="gap-2">
              <Mail className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" onClick={handleExportCSV} className="gap-2">
              <Download className="h-4 w-4" />
              {selectedSkus.size > 0 ? `(${selectedSkus.size})` : "CSV"}
            </Button>
            <Button variant="outline" size="sm" onClick={handleExportBySupplier} className="gap-2">
              <FileSpreadsheet className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Priority Filter Tabs */}
        <Tabs value={priorityFilter} onValueChange={(v) => setPriorityFilter(v as PriorityFilter)}>
          <TabsList className="bg-muted/50">
            <TabsTrigger value="all" className="gap-1.5 text-xs">
              <Filter className="h-3 w-3" />All
              <Badge variant="outline" className="text-[10px] px-1.5 py-0">{rows.length}</Badge>
            </TabsTrigger>
            <TabsTrigger value="critical" className="gap-1.5 text-xs">
              <Flame className="h-3 w-3" />Critical
              <Badge variant={priorityCounts.critical > 0 ? "destructive" : "outline"} className="text-[10px] px-1.5 py-0">{priorityCounts.critical}</Badge>
            </TabsTrigger>
            <TabsTrigger value="high" className="gap-1.5 text-xs">
              <AlertTriangle className="h-3 w-3" />High
              <Badge className="text-[10px] px-1.5 py-0 bg-orange-500 text-white">{priorityCounts.high}</Badge>
            </TabsTrigger>
            <TabsTrigger value="medium" className="gap-1.5 text-xs">
              <Clock className="h-3 w-3" />Medium
              <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{priorityCounts.medium}</Badge>
            </TabsTrigger>
            <TabsTrigger value="low" className="gap-1.5 text-xs">
              <CheckCircle2 className="h-3 w-3" />Low
              <Badge variant="outline" className="text-[10px] px-1.5 py-0">{priorityCounts.low}</Badge>
            </TabsTrigger>
          </TabsList>
        </Tabs>

        {/* Summary Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
          <Card className="bg-card/60">
            <CardContent className="p-3">
              <p className="text-xs text-muted-foreground">Total Needed</p>
              <p className="text-xl font-bold text-foreground">{totals.needed.toLocaleString()}</p>
            </CardContent>
          </Card>
          <Card className="bg-card/60">
            <CardContent className="p-3">
              <p className="text-xs text-muted-foreground">In Stock</p>
              <p className="text-xl font-bold text-accent-foreground">{totals.inStock.toLocaleString()}</p>
            </CardContent>
          </Card>
          <Card className="bg-card/60">
            <CardContent className="p-3">
              <p className="text-xs text-muted-foreground">On PO</p>
              <p className="text-xl font-bold text-primary">{totals.onPO.toLocaleString()}</p>
            </CardContent>
          </Card>
          <Card className="bg-primary/10 border-primary/20">
            <CardContent className="p-3">
              <p className="text-xs text-primary">To Order</p>
              <p className="text-xl font-bold text-primary">{totals.toOrder.toLocaleString()}</p>
            </CardContent>
          </Card>
          <Card className={`${totals.urgent > 0 ? "bg-destructive/10 border-destructive/20" : "bg-card/60"}`}>
            <CardContent className="p-3">
              <p className="text-xs text-muted-foreground">Urgent</p>
              <p className={`text-xl font-bold ${totals.urgent > 0 ? "text-destructive" : "text-foreground"}`}>{totals.urgent}</p>
            </CardContent>
          </Card>
          <Card className={`${totals.stockoutRisk > 0 ? "bg-destructive/10 border-destructive/20" : "bg-card/60"}`}>
            <CardContent className="p-3">
              <p className="text-xs text-muted-foreground">Stockout Risk</p>
              <p className={`text-xl font-bold ${totals.stockoutRisk > 0 ? "text-destructive" : "text-foreground"}`}>{totals.stockoutRisk}</p>
            </CardContent>
          </Card>
          <Card className="bg-card/60">
            <CardContent className="p-3">
              <p className="text-xs text-muted-foreground">Avg Wait</p>
              <p className={`text-xl font-bold ${avgDaysWaiting > 7 ? "text-destructive" : avgDaysWaiting > 3 ? "text-orange-500" : "text-foreground"}`}>
                {avgDaysWaiting}d
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Supplier Concentration Chart */}
        {showSupplierChart && supplierConcentration.length > 0 && (
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-3">
                <PieChart className="h-4 w-4 text-primary" />
                <span className="font-semibold text-sm text-foreground">Supplier Concentration (To Order)</span>
              </div>
              <div className="flex items-center gap-6 flex-wrap">
                {/* Visual bar chart */}
                <div className="flex-1 min-w-[300px] space-y-1.5">
                  {supplierConcentration.slice(0, 8).map((s, i) => (
                    <div key={s.name} className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground w-32 truncate text-right">{s.name}</span>
                      <div className="flex-1 h-5 bg-muted/40 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-500"
                          style={{ width: `${Math.max(2, s.percent)}%`, backgroundColor: s.color }}
                        />
                      </div>
                      <span className="text-xs font-medium w-16 text-right">{s.qty} ({s.percent}%)</span>
                    </div>
                  ))}
                </div>
                {/* Concentration warning */}
                {supplierConcentration.length > 0 && supplierConcentration[0].percent > 50 && (
                  <div className="p-3 rounded-lg bg-orange-500/10 border border-orange-500/20 max-w-[200px]">
                    <div className="flex items-center gap-1.5 mb-1">
                      <AlertTriangle className="h-3.5 w-3.5 text-orange-500" />
                      <span className="text-xs font-semibold text-orange-600">High Concentration</span>
                    </div>
                    <p className="text-[10px] text-muted-foreground">
                      {supplierConcentration[0].percent}% of orders depend on {supplierConcentration[0].name}. Consider diversifying.
                    </p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Suggested Restock */}
        {suggestedRows.length > 0 && (
          <Collapsible open={suggestedOpen} onOpenChange={setSuggestedOpen}>
            <Card className="border-dashed border-primary/30 bg-primary/5">
              <CollapsibleTrigger asChild>
                <button className="w-full flex items-center justify-between p-3 hover:bg-primary/10 transition-colors rounded-t-lg">
                  <div className="flex items-center gap-2">
                    <TrendingUp className="h-4 w-4 text-primary" />
                    <span className="font-semibold text-sm text-foreground">Suggested Restock</span>
                    <Badge variant="secondary" className="text-xs">{suggestedRows.length}</Badge>
                    <span className="text-xs text-muted-foreground">Items frequently ordered over the last 3 months (avg monthly qty)</span>
                  </div>
                  {suggestedOpen ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                </button>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>SKU</TableHead>
                          <TableHead>Item Name</TableHead>
                          <TableHead className="text-right">Avg Monthly Qty</TableHead>
                          <TableHead className="text-right">Months Active</TableHead>
                          <TableHead className="text-right">Total Orders</TableHead>
                          <TableHead>Last Ordered</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {suggestedRows.map((row) => (
                          <TableRow key={row.sku} className="bg-primary/5">
                            <TableCell className="font-mono text-xs text-muted-foreground">{row.sku}</TableCell>
                            <TableCell className="font-medium max-w-[200px] truncate">{row.itemName}</TableCell>
                            <TableCell className="text-right"><Badge variant="outline" className="font-bold">{row.avgMonthlyQty}</Badge></TableCell>
                            <TableCell className="text-right text-sm">{row.monthsAppeared}/3</TableCell>
                            <TableCell className="text-right text-sm text-muted-foreground">{row.totalOrders}</TableCell>
                            <TableCell className="text-xs text-muted-foreground">{row.lastOrderedDate ? new Date(row.lastOrderedDate).toLocaleDateString() : "—"}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </CollapsibleContent>
            </Card>
          </Collapsible>
        )}

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search items, SKU, order, customer... (Ctrl+F)" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
          </div>
          <Select value={supplierFilter} onValueChange={setSupplierFilter}>
            <SelectTrigger className="w-full sm:w-[220px]">
              <Package className="h-4 w-4 mr-2" />
              <SelectValue placeholder="Supplier" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Suppliers</SelectItem>
              {uniqueSuppliers.map(([id, info]) => (
                <SelectItem key={id} value={id}>
                  {info.name} ({info.count} items, {info.totalToOrder} to order)
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant={showOnlyNeedOrder ? "default" : "outline"} size="sm" onClick={() => setShowOnlyNeedOrder(!showOnlyNeedOrder)} className="gap-2 whitespace-nowrap">
            <AlertTriangle className="h-4 w-4" />
            {showOnlyNeedOrder ? "Needs Ordering" : "Show All"}
          </Button>
        </div>

        {/* Batch Actions Bar */}
        {selectedSkus.size > 0 && (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-primary/10 border border-primary/20 flex-wrap">
            <span className="text-sm font-medium text-foreground">{selectedSkus.size} selected</span>
            <Button variant="outline" size="sm" onClick={handleExportCSV} className="gap-1"><Download className="h-3 w-3" />Export</Button>
            <Button variant="outline" size="sm" onClick={handleExportBySupplier} className="gap-1"><FileSpreadsheet className="h-3 w-3" />By Supplier</Button>
            <Button variant="outline" size="sm" onClick={handleCopySelectedPOLines} className="gap-1"><ClipboardCopy className="h-3 w-3" />Copy PO Lines</Button>
            <Button variant="outline" size="sm" onClick={handleCopySupplierEmails} className="gap-1"><Copy className="h-3 w-3" />Emails</Button>
            <Button variant="outline" size="sm" onClick={handlePrint} className="gap-1"><Printer className="h-3 w-3" />Print</Button>
            <Button variant="ghost" size="sm" onClick={() => setSelectedSkus(new Set())}>Clear</Button>
          </div>
        )}

        {/* Keyboard shortcut hints */}
        <div className="flex items-center gap-3 text-[10px] text-muted-foreground/50">
          <span><kbd className="px-1 py-0.5 rounded bg-muted text-[10px]">Ctrl+F</kbd> Search</span>
          <span><kbd className="px-1 py-0.5 rounded bg-muted text-[10px]">G</kbd> Group</span>
          <span><kbd className="px-1 py-0.5 rounded bg-muted text-[10px]">Esc</kbd> Exit Focus</span>
          <span>Click row to expand details</span>
        </div>

        {/* Table */}
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-8">
                      <Checkbox checked={selectedSkus.size === sortedRows.length && sortedRows.length > 0} onCheckedChange={toggleSelectAll} />
                    </TableHead>
                    <SortableHeader field="priorityScore">Priority</SortableHeader>
                    <SortableHeader field="sku">SKU</SortableHeader>
                    <SortableHeader field="itemName">Item</SortableHeader>
                    <SortableHeader field="totalNeeded" className="text-right">Needed</SortableHeader>
                    <SortableHeader field="stockOnHand" className="text-right">Stock</SortableHeader>
                    <SortableHeader field="onPurchaseOrder" className="text-right">On PO</SortableHeader>
                    <TableHead>Coverage</TableHead>
                    <SortableHeader field="toOrder" className="text-right">Order</SortableHeader>
                    <SortableHeader field="stockoutRiskDays" className="text-center">Risk</SortableHeader>
                    <TableHead className="text-center">Trend</TableHead>
                    <SortableHeader field="daysWaiting" className="text-center">Wait</SortableHeader>
                    <SortableHeader field="supplierName">Supplier</SortableHeader>
                    <TableHead>Orders</TableHead>
                    <TableHead className="w-16">
                      <div className="flex items-center gap-1">
                        <StickyNote className="h-3 w-3 text-muted-foreground" />
                      </div>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedRows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={colSpanCount} className="text-center py-8 text-muted-foreground">
                        {showOnlyNeedOrder ? "All items are covered by stock and POs!" : "No items found"}
                      </TableCell>
                    </TableRow>
                  ) : groupedRows ? (
                    groupedRows.map(([supplier, items]) => (
                      <Fragment key={`group-${supplier}`}>
                        <TableRow className="bg-muted/50 hover:bg-muted/70">
                          <TableCell colSpan={colSpanCount}>
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <Users className="h-4 w-4 text-primary" />
                                <span className="font-semibold text-foreground">{supplier}</span>
                                <Badge variant="secondary" className="text-xs">{items.length} items</Badge>
                                {items[0]?.supplierEmail && (
                                  <span className="text-xs text-muted-foreground">({items[0].supplierEmail})</span>
                                )}
                              </div>
                              <div className="flex items-center gap-3 text-sm">
                                <span className="text-muted-foreground">To Order: <strong className="text-primary">{items.reduce((s, r) => s + r.toOrder, 0)}</strong></span>
                              </div>
                            </div>
                          </TableCell>
                        </TableRow>
                        {items.map(renderRow)}
                      </Fragment>
                    ))
                  ) : (
                    sortedRows.map(renderRow)
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>
    </TooltipProvider>
  );
}
