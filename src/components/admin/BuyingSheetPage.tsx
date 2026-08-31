import { useState, useEffect, useMemo, useCallback, useRef, Fragment } from "react";
import { useLiveData } from "@/hooks/useLiveData";
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
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { MoreHorizontal } from "lucide-react";
import {
  Search, Download, ShoppingCart, Package, Loader2,
  AlertTriangle, TrendingUp, TrendingDown, Minus, ChevronDown, ChevronRight,
  ArrowUpDown, ArrowUp, ArrowDown, Layers, Clock, Flame, CheckCircle2,
  FileSpreadsheet, Users, Printer, Mail, StickyNote, Copy, X,
  BarChart3, Filter, Maximize2, Minimize2, ClipboardCopy, Timer,
  ChevronUp, PieChart, Send, History, CheckSquare, Snowflake, Sun,
  Save, LayoutGrid, TableIcon, Zap, Pin, PinOff, AlignJustify, AlignCenter,
  Eye, Star, Sparkles
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { getItemDisplayName, getItemIdentityKey, isMiscellaneousItem } from "@/lib/itemDisplay";

import type { BuyingSheetRow, SuggestedRestockRow, ZohoStockData, SortField, SortDirection, PriorityFilter, ViewMode, ViewDensity, RecentlyOrderedItem } from "./buying-sheet/types";
import { getPriorityLevel, NOTES_KEY, SNAPSHOT_KEY, loadNotes, saveNotes, loadPinned, savePinned, loadDensity, saveDensity, loadRecentlyOrdered, saveRecentlyOrdered } from "./buying-sheet/types";
import { BuyingSheetSummary } from "./buying-sheet/BuyingSheetSummary";
import { SupplierCardsView } from "./buying-sheet/SupplierCardsView";
import { QuickOrderView } from "./buying-sheet/QuickOrderView";
import ProcurementSuggestionsPanel from "./buying-sheet/ProcurementSuggestionsPanel";

const MS_PER_DAY = 86_400_000;

/** Calendar-day age, independent of time-of-day, DST and browser timezone offsets. */
const calendarDaysSince = (isoDate: string) => {
  const start = new Date(isoDate);
  if (Number.isNaN(start.getTime())) return 0;
  const today = new Date();
  const startDay = Date.UTC(start.getFullYear(), start.getMonth(), start.getDate());
  const todayDay = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.max(0, Math.round((todayDay - startDay) / MS_PER_DAY));
};

const earliestTimestamp = (...dates: Array<string | null | undefined>) => {
  const valid = dates.filter((date): date is string => Boolean(date) && !Number.isNaN(new Date(date as string).getTime()));
  return valid.sort((a, b) => new Date(a).getTime() - new Date(b).getTime())[0] || new Date().toISOString();
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
  const [showOnlyPOMismatches, setShowOnlyPOMismatches] = useState(false);
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
  const [emailDraftSubject, setEmailDraftSubject] = useState("");
  const [collapsedSuppliers, setCollapsedSuppliers] = useState<Set<string>>(new Set());
  const lastSelectedSkuRef = useRef<string | null>(null);
  const [snapshotSaved, setSnapshotSaved] = useState(false);
  const [showSnapshot, setShowSnapshot] = useState(false);
  const [snapshotData, setSnapshotData] = useState<{ date: string; rows: { sku: string; toOrder: number }[] } | null>(null);
  const [bulkOrdering, setBulkOrdering] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("quick");
  const [pinnedSkus, setPinnedSkus] = useState<string[]>(loadPinned);
  const [viewDensity, setViewDensity] = useState<ViewDensity>(loadDensity);
  const [recentlyOrdered, setRecentlyOrdered] = useState<RecentlyOrderedItem[]>(loadRecentlyOrdered);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<Date | null>(null);
  const [showRecentlyOrdered, setShowRecentlyOrdered] = useState(false);
  const [adjustedQtys, setAdjustedQtys] = useState<Record<string, number>>({});
  const [supplierReliabilityMap, setSupplierReliabilityMap] = useState<Map<string, number>>(new Map());
  const [weeklyHistory, setWeeklyHistory] = useState<Map<string, { thisWeek: number; lastWeek: number }>>(new Map());
  const [costHistory, setCostHistory] = useState<Map<string, number>>(new Map());
  const [insightsReady, setInsightsReady] = useState(false);
  const fetchLocalDataRef = useRef<() => Promise<void>>(async () => undefined);
  const printRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadSnapshot();
    // These independent reports used to run as a burst of uncoordinated requests
    // while the sheet calculated against empty maps. Load them concurrently, then
    // build the sheet once so the first result is both faster and correct.
    Promise.all([
      fetchDemandHistory(),
      fetchLastPurchaseDates(),
      fetchLeadTimes(),
      fetchSeasonalPatterns(),
      fetchWeeklyHistory(),
      fetchCostHistory(),
    ]).finally(() => setInsightsReady(true));
  }, []);

  useEffect(() => {
    if (insightsReady) void fetchLocalDataRef.current();
  }, [insightsReady]);

  // Live feed: re-pull local demand whenever orders / items / POs change
  useLiveData(["orders", "order_items", "order_purchase_orders"], () => {
    void fetchLocalDataRef.current();
    fetchLastPurchaseDates();
  }, { enabled: insightsReady, fallbackIntervalMs: 0, debounceMs: 1500, channelName: "buying-sheet-local-live-data" });

  // Zoho document webhooks update one shared cache row. Realtime broadcasts
  // that single change to every app, so no browser needs to poll Zoho.
  useEffect(() => {
    const channel = supabase
      .channel("buying-sheet-event-cache")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "buying_sheet_cache", filter: "id=eq.buying-sheet" },
        (change) => {
          const next = change.new as { payload?: ZohoStockData; fetched_at?: string };
          if (!next?.payload) return;
          setZohoData(next.payload);
          setLastRefreshedAt(next.fetched_at ? new Date(next.fetched_at) : new Date());
          void fetchLocalDataRef.current();
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === "f" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); document.querySelector<HTMLInputElement>('[placeholder*="Search"]')?.focus(); }
      if (e.key === "Escape" && isFullscreen) setIsFullscreen(false);
      if (e.key === "g" && !e.metaKey && !e.ctrlKey) setGroupBySupplier(v => !v);
      if (e.key === "p" && !e.metaKey && !e.ctrlKey) setViewDensity(v => { const next = v === "compact" ? "comfortable" : "compact"; saveDensity(next); return next; });
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isFullscreen]);

  useEffect(() => {
    const syncFullscreenState = () => {
      if (document.fullscreenElement) setIsFullscreen(document.fullscreenElement === printRef.current);
    };
    document.addEventListener("fullscreenchange", syncFullscreenState);
    return () => document.removeEventListener("fullscreenchange", syncFullscreenState);
  }, []);

  const toggleFullscreen = useCallback(async () => {
    const target = printRef.current;
    if (!target) return;
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
        setIsFullscreen(false);
      } else if (target.requestFullscreen) {
        await target.requestFullscreen();
        setIsFullscreen(true);
      } else {
        // iOS/PWA fallback when the browser Fullscreen API is unavailable.
        setIsFullscreen(value => !value);
      }
    } catch (error) {
      console.warn("Fullscreen API unavailable, using app fullscreen:", error);
      setIsFullscreen(value => !value);
    }
  }, []);

  // ── Data Fetching ──────────────────────────────────────────────────────

  const fetchDemandHistory = async () => {
    try {
      const now = new Date();
      const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);
      const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 2, 1);
      const prevMonthEnd = new Date(now.getFullYear(), now.getMonth() - 1, 0);
      const [lastRes, prevRes] = await Promise.all([
        supabase.from("order_items").select("code, quantity").not("code", "is", null).gte("created_at", lastMonthStart.toISOString()).lte("created_at", lastMonthEnd.toISOString()),
        supabase.from("order_items").select("code, quantity").not("code", "is", null).gte("created_at", prevMonthStart.toISOString()).lte("created_at", prevMonthEnd.toISOString()),
      ]);
      const lastMap = new Map<string, number>();
      const prevMap = new Map<string, number>();
      (lastRes.data || []).forEach(i => { const sku = (i.code || "").trim().toUpperCase(); lastMap.set(sku, (lastMap.get(sku) || 0) + (i.quantity || 1)); });
      (prevRes.data || []).forEach(i => { const sku = (i.code || "").trim().toUpperCase(); prevMap.set(sku, (prevMap.get(sku) || 0) + (i.quantity || 1)); });
      const history = new Map<string, { lastMonth: number; prevMonth: number }>();
      new Set([...lastMap.keys(), ...prevMap.keys()]).forEach(sku => { history.set(sku, { lastMonth: lastMap.get(sku) || 0, prevMonth: prevMap.get(sku) || 0 }); });
      setDemandHistory(history);
    } catch (err) { console.error("Failed to fetch demand history:", err); }
  };

  const fetchLeadTimes = async () => {
    try {
      const oneYearAgo = new Date(); oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
      const { data } = await supabase.from("order_items").select("code, created_at, completed_at, order_id").eq("progress_stage", "completed").not("code", "is", null).not("completed_at", "is", null).gte("completed_at", oneYearAgo.toISOString());
      const skuLeadTimes = new Map<string, number[]>();
      (data || []).forEach(item => {
        if (!item.created_at || !item.completed_at) return;
        const sku = (item.code || "").trim().toUpperCase();
        const days = Math.max(0, Math.round((new Date(item.completed_at).getTime() - new Date(item.created_at).getTime()) / (1000 * 60 * 60 * 24)));
        const arr = skuLeadTimes.get(sku) || []; arr.push(days); skuLeadTimes.set(sku, arr);
      });
      const map = new Map<string, number>();
      skuLeadTimes.forEach((days, sku) => { map.set(sku, Math.round(days.reduce((a, b) => a + b, 0) / days.length)); });
      setLeadTimeMap(map);
      const reliability = new Map<string, number>();
      skuLeadTimes.forEach((days, sku) => {
        const average = map.get(sku) || 14;
        const onTime = days.filter((daysTaken) => daysTaken <= average * 1.2).length;
        reliability.set(sku, Math.round((onTime / days.length) * 100));
      });
      setSupplierReliabilityMap(reliability);
    } catch (err) { console.error("Failed to fetch lead times:", err); }
  };

  const fetchSeasonalPatterns = async () => {
    try {
      const currentMonth = new Date().getMonth();
      const oneYearAgo = new Date(); oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
      const { data } = await supabase.from("order_items").select("code, quantity, created_at").not("code", "is", null).gte("created_at", oneYearAgo.toISOString());
      const skuMonthlyTotals = new Map<string, Map<number, number[]>>();
      (data || []).forEach(item => {
        const sku = (item.code || "").trim().toUpperCase();
        const month = new Date(item.created_at).getMonth();
        if (!skuMonthlyTotals.has(sku)) skuMonthlyTotals.set(sku, new Map());
        const monthMap = skuMonthlyTotals.get(sku)!;
        const arr = monthMap.get(month) || []; arr.push(item.quantity || 1); monthMap.set(month, arr);
      });
      const map = new Map<string, "peak" | "low" | "normal">();
      skuMonthlyTotals.forEach((monthMap, sku) => {
        const allMonthAvgs: number[] = [];
        monthMap.forEach(qtys => allMonthAvgs.push(qtys.reduce((a, b) => a + b, 0) / qtys.length));
        const overallAvg = allMonthAvgs.length > 0 ? allMonthAvgs.reduce((a, b) => a + b, 0) / allMonthAvgs.length : 0;
        const currentQtys = monthMap.get(currentMonth) || [];
        const currentAvg = currentQtys.length > 0 ? currentQtys.reduce((a, b) => a + b, 0) / currentQtys.length : 0;
        if (overallAvg > 0 && currentAvg > overallAvg * 1.3) map.set(sku, "peak");
        else if (overallAvg > 0 && currentAvg < overallAvg * 0.7) map.set(sku, "low");
        else if (monthMap.size >= 2) map.set(sku, "normal");
      });
      setSeasonalMap(map);
    } catch (err) { console.error("Failed to fetch seasonal patterns:", err); }
  };

  const loadSnapshot = () => {
    try { const raw = localStorage.getItem(SNAPSHOT_KEY); if (raw) setSnapshotData(JSON.parse(raw)); } catch { /* ignore */ }
  };

  const fetchLastPurchaseDates = async () => {
    try {
      const { data } = await supabase.from("order_items").select("code, completed_at").eq("progress_stage", "completed").not("code", "is", null).not("completed_at", "is", null).order("completed_at", { ascending: false });
      const map = new Map<string, string>();
      (data || []).forEach(item => { const sku = (item.code || "").trim().toUpperCase(); if (!map.has(sku) && item.completed_at) map.set(sku, item.completed_at); });
      setLastPurchaseMap(map);
    } catch (err) { console.error("Failed to fetch last purchase dates:", err); }
  };

  const fetchZohoData = async (): Promise<ZohoStockData | null> => {
    setZohoLoading(true);
    try {
      const { data: cached, error: cacheError } = await supabase
        .from("buying_sheet_cache")
        .select("payload, fetched_at")
        .eq("id", "buying-sheet")
        .maybeSingle();
      if (cacheError) throw cacheError;

      let payload = cached;
      if (!payload?.payload) {
        // One-time bootstrap for a new environment. Once this row exists,
        // normal page loads never call Zoho again.
        const { data, error } = await supabase.functions.invoke("buying-sheet-data", { body: { force: false } });
        if (error) throw error;
        if (data?.error) throw new Error(data.error);
        payload = { payload: data?.data || {}, fetched_at: data?.fetchedAt || new Date().toISOString() } as typeof cached;
      }

      const next = (payload?.payload || {}) as unknown as ZohoStockData;
      setZohoData(next);
      setLastRefreshedAt(payload?.fetched_at ? new Date(payload.fetched_at) : new Date());
      return next;
    } catch (error) {
      toast({ title: "Error", description: "Failed to load the shared Zoho snapshot", variant: "destructive" });
      return null;
    } finally { setZohoLoading(false); }
  };

  const fetchSuggestedRestock = async (activeSkus: Set<string>) => {
    try {
      const threeMonthsAgo = new Date(); threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
      const { data: completedItems, error } = await supabase.from("order_items").select("code, name, quantity, completed_at, order_id").eq("progress_stage", "completed").not("code", "is", null).gte("completed_at", threeMonthsAgo.toISOString()).order("completed_at", { ascending: false });
      if (error || !completedItems?.length) return;
      const skuMonthMap = new Map<string, { itemName: string; months: Map<string, number>; totalOrders: number; lastDate: string }>();
      for (const item of completedItems) {
        const sku = (item.code || "").trim().toUpperCase();
        if (!sku || activeSkus.has(sku)) continue;
        const monthKey = (item.completed_at || "").substring(0, 7);
        if (!monthKey) continue;
        const existing = skuMonthMap.get(sku);
        if (existing) { const m = existing.months.get(monthKey) || 0; existing.months.set(monthKey, m + (item.quantity || 1)); existing.totalOrders++; }
        else { const months = new Map<string, number>(); months.set(monthKey, item.quantity || 1); skuMonthMap.set(sku, { itemName: item.name, months, totalOrders: 1, lastDate: item.completed_at || "" }); }
      }
      const suggested: SuggestedRestockRow[] = [];
      for (const [sku, data] of skuMonthMap.entries()) {
        if (data.months.size < 2) continue;
        const totalQty = Array.from(data.months.values()).reduce((a, b) => a + b, 0);
        suggested.push({ sku, itemName: data.itemName, monthsAppeared: data.months.size, avgMonthlyQty: Math.round(totalQty / data.months.size), totalOrders: data.totalOrders, lastOrderedDate: data.lastDate });
      }
      suggested.sort((a, b) => b.monthsAppeared - a.monthsAppeared || b.avgMonthlyQty - a.avgMonthlyQty);
      setSuggestedRows(suggested);
    } catch (err) { console.error("Failed to fetch suggested restock:", err); }
  };

  const getDemandTrend = (sku: string): { trend: "up" | "down" | "stable" | "new"; lastMonth: number; prevMonth: number } => {
    const h = demandHistory.get(sku);
    if (!h) return { trend: "new", lastMonth: 0, prevMonth: 0 };
    if (h.prevMonth === 0 && h.lastMonth > 0) return { trend: "up", ...h };
    if (h.lastMonth === 0 && h.prevMonth === 0) return { trend: "new", ...h };
    const pct = h.prevMonth > 0 ? ((h.lastMonth - h.prevMonth) / h.prevMonth) * 100 : 0;
    if (pct > 15) return { trend: "up", ...h };
    if (pct < -15) return { trend: "down", ...h };
    return { trend: "stable", ...h };
  };

  const getStockoutRiskDays = (sku: string, stockOnHand: number, onPO: number): number | null => {
    const h = demandHistory.get(sku);
    if (!h || (h.lastMonth === 0 && h.prevMonth === 0)) return null;
    // Use daily burn rate for more accurate prediction
    const dailyBurnRate = getDailyBurnRate(sku);
    if (dailyBurnRate <= 0) return null;
    return Math.round((stockOnHand + onPO) / dailyBurnRate);
  };

  // Daily burn rate: weighted average favoring recent month
  const getDailyBurnRate = (sku: string): number => {
    const h = demandHistory.get(sku);
    if (!h) return 0;
    // Weight last month 70%, previous 30% for recency bias
    const weightedMonthly = (h.lastMonth * 0.7) + (h.prevMonth * 0.3);
    return weightedMonthly / 30;
  };

  // Safety stock: based on demand variability and lead time
  const getSafetyStock = (sku: string, avgLeadTimeDays: number | null): number => {
    const h = demandHistory.get(sku);
    if (!h || (h.lastMonth === 0 && h.prevMonth === 0)) return 0;
    // Demand variability = standard deviation of monthly demand
    const avg = (h.lastMonth + h.prevMonth) / 2;
    const variance = ((h.lastMonth - avg) ** 2 + (h.prevMonth - avg) ** 2) / 2;
    const stdDev = Math.sqrt(variance);
    // Safety stock = Z-score (1.65 for 95% service level) × stdDev × sqrt(lead time in months)
    const leadTimeMonths = (avgLeadTimeDays || 14) / 30;
    return Math.ceil(1.65 * stdDev * Math.sqrt(leadTimeMonths));
  };

  // Demand variability coefficient (CV) - higher = more erratic
  const getDemandVariability = (sku: string): "stable" | "moderate" | "erratic" => {
    const h = demandHistory.get(sku);
    if (!h || (h.lastMonth === 0 && h.prevMonth === 0)) return "stable";
    const avg = (h.lastMonth + h.prevMonth) / 2;
    if (avg === 0) return "stable";
    const cv = Math.abs(h.lastMonth - h.prevMonth) / avg;
    if (cv > 0.5) return "erratic";
    if (cv > 0.2) return "moderate";
    return "stable";
  };

  // Weekly velocity history
  const fetchWeeklyHistory = async () => {
    try {
      const now = new Date();
      const thisWeekStart = new Date(now); thisWeekStart.setDate(now.getDate() - now.getDay());
      const lastWeekStart = new Date(thisWeekStart); lastWeekStart.setDate(lastWeekStart.getDate() - 7);
      const [thisRes, lastRes] = await Promise.all([
        supabase.from("order_items").select("code, quantity").not("code", "is", null).gte("created_at", thisWeekStart.toISOString()),
        supabase.from("order_items").select("code, quantity").not("code", "is", null).gte("created_at", lastWeekStart.toISOString()).lt("created_at", thisWeekStart.toISOString()),
      ]);
      const thisMap = new Map<string, number>();
      const lastMap = new Map<string, number>();
      (thisRes.data || []).forEach(i => { const sku = (i.code || "").trim().toUpperCase(); thisMap.set(sku, (thisMap.get(sku) || 0) + (i.quantity || 1)); });
      (lastRes.data || []).forEach(i => { const sku = (i.code || "").trim().toUpperCase(); lastMap.set(sku, (lastMap.get(sku) || 0) + (i.quantity || 1)); });
      const map = new Map<string, { thisWeek: number; lastWeek: number }>();
      new Set([...thisMap.keys(), ...lastMap.keys()]).forEach(sku => {
        map.set(sku, { thisWeek: thisMap.get(sku) || 0, lastWeek: lastMap.get(sku) || 0 });
      });
      setWeeklyHistory(map);
    } catch (err) { console.error("Failed to fetch weekly history:", err); }
  };

  // Cost estimation from historical order amounts
  const fetchCostHistory = async () => {
    try {
      const oneYearAgo = new Date(); oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
      const { data } = await supabase.from("orders").select("id, total_amount").not("total_amount", "is", null).gt("total_amount", 0).gte("created_at", oneYearAgo.toISOString());
      if (!data?.length) return;
      const orderAmounts = new Map(data.map(o => [o.id, o.total_amount as number]));
      const { data: items } = await supabase.from("order_items").select("code, quantity, order_id").not("code", "is", null).gte("created_at", oneYearAgo.toISOString());
      if (!items?.length) return;
      // Rough unit cost: order total / total items in order
      const skuCosts = new Map<string, number[]>();
      const orderItemCounts = new Map<string, number>();
      items.forEach(i => { orderItemCounts.set(i.order_id, (orderItemCounts.get(i.order_id) || 0) + (i.quantity || 1)); });
      items.forEach(i => {
        const orderTotal = orderAmounts.get(i.order_id);
        const itemCount = orderItemCounts.get(i.order_id) || 1;
        if (orderTotal && itemCount > 0) {
          const sku = (i.code || "").trim().toUpperCase();
          const unitCost = (orderTotal / itemCount) * (i.quantity || 1) / (i.quantity || 1);
          const arr = skuCosts.get(sku) || []; arr.push(unitCost); skuCosts.set(sku, arr);
        }
      });
      const map = new Map<string, number>();
      skuCosts.forEach((costs, sku) => { map.set(sku, Math.round(costs.reduce((a, b) => a + b, 0) / costs.length * 100) / 100); });
      setCostHistory(map);
    } catch (err) { console.error("Failed to fetch cost history:", err); }
  };

  // Helper: compute new analytical fields for a row
  const computeAnalyticalFields = (sku: string, toOrder: number, daysWaiting: number, avgLeadTimeDays: number | null, orders: { urgency?: string }[], recommendedOrderQty: number, billUnitCost: number | null = null, costSource: "bill" | "item" | null = null) => {
    // Age escalation
    const leadRef = avgLeadTimeDays || 14;
    const ageRatio = daysWaiting / leadRef;
    const ageEscalation: "green" | "yellow" | "orange" | "red" = ageRatio > 2 ? "red" : ageRatio > 1.5 ? "orange" : ageRatio > 1 ? "yellow" : "green";

    // Conflicting urgency
    const urgencies = new Set(orders.map(o => o.urgency || "normal"));
    const conflictingUrgency = urgencies.size > 1 && (urgencies.has("urgent") || urgencies.has("critical"));

    // Forecast next month (linear extrapolation)
    const h = demandHistory.get(sku);
    const forecastNextMonth = h ? Math.max(0, Math.round(h.lastMonth + (h.lastMonth - h.prevMonth))) : 0;

    // Reorder point: (daily burn × lead time) + safety stock
    const dailyBurn = getDailyBurnRate(sku);
    const safetyStock = getSafetyStock(sku, avgLeadTimeDays);
    const reorderPoint = Math.ceil(dailyBurn * (avgLeadTimeDays || 14)) + safetyStock;

    // Supplier reliability
    const supplierReliability = supplierReliabilityMap.get(sku) ?? null;

    // Velocity score (orders per week)
    const wh = weeklyHistory.get(sku);
    const velocityScore = wh ? Math.round(((wh.thisWeek + wh.lastWeek) / 2) * 10) / 10 : 0;

    // Weekly trend %
    const weeklyTrend = wh && wh.lastWeek > 0 ? Math.round(((wh.thisWeek - wh.lastWeek) / wh.lastWeek) * 100) : 0;

    // Cost: real vendor-bill cost first, local history only as a last resort
    const unitCost = billUnitCost ?? costHistory.get(sku) ?? null;
    const qtyForCost = toOrder > 0 ? toOrder : recommendedOrderQty;
    const estimatedCost = unitCost !== null ? Math.round(unitCost * qtyForCost * 100) / 100 : null;

    // Adjusted qty (user override or recommended)
    const adjustedOrderQty = adjustedQtys[sku] ?? recommendedOrderQty;

    return { ageEscalation, conflictingUrgency, forecastNextMonth, reorderPoint, supplierReliability, velocityScore, weeklyTrend, estimatedCost, unitCost, costSource: billUnitCost !== null ? (costSource ?? "bill") : null, adjustedOrderQty, abcClass: "C" as "A" | "B" | "C" };
  };

  const fetchLocalData = async () => {
    setLoading(true);
    try {
      const { data: orderItems, error: itemsError } = await supabase.from("order_items").select("id, name, code, description, notes, quantity, qty_on_po, progress_stage, order_id, created_at").in("progress_stage", ["awaiting-stock"]).order("created_at", { ascending: false });
      if (itemsError) throw itemsError;
      const activeSkus = new Set<string>();
      if (!orderItems?.length) { setRows([]); setLoading(false); fetchSuggestedRestock(activeSkus); return; }

      const orderIds = [...new Set(orderItems.map(i => i.order_id))];
      const [ordersResult, poResult] = await Promise.all([
        supabase.from("orders").select("id, order_number, company_id, supplier_id, urgency, created_at").in("id", orderIds),
        supabase.from("order_purchase_orders").select("order_id, supplier_id").in("order_id", orderIds),
      ]);
      if (ordersResult.error) throw ordersResult.error;
      if (poResult.error) throw poResult.error;
      const orders = ordersResult.data || [];
      const orderPOs = poResult.data || [];
      const companyIds = [...new Set((orders || []).map(o => o.company_id).filter(Boolean))] as string[];
      const supplierIdsFromOrders = [...new Set((orders || []).map(o => o.supplier_id).filter(Boolean))] as string[];
      const allSupplierIds = [...new Set([...supplierIdsFromOrders, ...(orderPOs || []).map(p => p.supplier_id)])];
      const [companiesRes, suppliersRes] = await Promise.all([
        companyIds.length > 0 ? supabase.from("companies").select("id, name").in("id", companyIds) : { data: [] },
        allSupplierIds.length > 0 ? supabase.from("suppliers").select("id, name, email").in("id", allSupplierIds) : { data: [] },
      ]);
      const companiesMap = new Map((companiesRes.data || []).map(c => [c.id, c.name]));
      const suppliersMap = new Map((suppliersRes.data || []).map(s => [s.id, { name: s.name, email: s.email }]));
      const ordersMap = new Map((orders || []).map(o => [o.id, o]));
      const orderSupplierMap = new Map<string, { name: string; id: string | null; email?: string }>();
      (orderPOs || []).forEach(po => {
        const supplier = suppliersMap.get(po.supplier_id);
        orderSupplierMap.set(po.order_id, { name: supplier?.name || "Unknown", id: po.supplier_id, email: supplier?.email || undefined });
      });

      const skuMap = new Map<string, { rowKey: string; sku: string; itemName: string; isMiscellaneous: boolean; orderItemIds: string[]; totalNeeded: number; allocatedOnPurchaseOrder: number; orders: { orderNumber: string; customerName: string; quantity: number; urgency?: string }[]; supplierName: string; supplierId: string | null; supplierEmail?: string; oldestCreatedAt: string; hasUrgent: boolean }>();
      for (const item of orderItems) {
        const requested = Math.max(0, item.quantity || 0);
        const allocatedOnPO = Math.min(requested, Math.max(0, item.qty_on_po || 0));
        if (requested <= 0) continue;
        const sku = (item.code || "NO-SKU").trim().toUpperCase(); activeSkus.add(sku);
        const itemName = getItemDisplayName(item);
        const rowKey = getItemIdentityKey(item);
        const miscellaneous = isMiscellaneousItem(sku) || isMiscellaneousItem(item.name);
        const order = ordersMap.get(item.order_id);
        const waitingSince = earliestTimestamp(order?.created_at, item.created_at);
        const customerName = order?.company_id ? companiesMap.get(order.company_id) || "Unknown" : "Unknown";
        const urgency = order?.urgency || "normal";
        let supplierName = "No Supplier", supplierId: string | null = null, supplierEmail: string | undefined;
        const poSupplier = orderSupplierMap.get(item.order_id);
        if (poSupplier) { supplierName = poSupplier.name; supplierId = poSupplier.id; supplierEmail = poSupplier.email; }
        else if (order?.supplier_id) { const s = suppliersMap.get(order.supplier_id); supplierName = s?.name || "Unknown"; supplierId = order.supplier_id; supplierEmail = s?.email || undefined; }
        const existing = skuMap.get(rowKey);
        if (existing) {
          existing.totalNeeded += requested;
          existing.allocatedOnPurchaseOrder += allocatedOnPO;
          existing.orderItemIds.push(item.id);
          existing.orders.push({ orderNumber: order?.order_number || "—", customerName, quantity: requested, urgency });
          existing.oldestCreatedAt = earliestTimestamp(existing.oldestCreatedAt, waitingSince);
          if (urgency === "urgent" || urgency === "critical") existing.hasUrgent = true;
        } else {
          skuMap.set(rowKey, { rowKey, sku, itemName, isMiscellaneous: miscellaneous, orderItemIds: [item.id], totalNeeded: requested, allocatedOnPurchaseOrder: allocatedOnPO, orders: [{ orderNumber: order?.order_number || "—", customerName, quantity: requested, urgency }], supplierName, supplierId, supplierEmail, oldestCreatedAt: waitingSince, hasUrgent: urgency === "urgent" || urgency === "critical" });
        }
      }

      const zohoStock = zohoData || {};
      const buyingRows: BuyingSheetRow[] = Array.from(skuMap.values()).map(entry => {
        // Shared miscellaneous SKUs are not fungible inventory. Applying the
        // catalogue's combined stock to every custom line would falsely hide
        // demand, so only exact order-linked allocations cover those rows.
        const z = entry.isMiscellaneous ? { stockOnHand: 0, onPurchaseOrder: 0, vendorName: '', vendorEmail: '', unitCost: null, costSource: null, lastPurchasedDate: null } : (zohoStock[entry.sku] || { stockOnHand: 0, onPurchaseOrder: 0, vendorName: '', vendorEmail: '' });
        // Only demand-linked PO allocations reduce this buying requirement.
        // Zoho's SKU total can include POs belonging to other customer orders,
        // so it is shown for reconciliation but never silently double-counted.
        const zohoOnPurchaseOrder = Math.max(0, z.onPurchaseOrder || 0);
        const onPurchaseOrder = entry.allocatedOnPurchaseOrder;
        const poVariance = Math.abs(zohoOnPurchaseOrder - onPurchaseOrder);
        const toOrder = Math.max(0, entry.totalNeeded - z.stockOnHand - onPurchaseOrder);
        // Zoho vendor (from historical POs) takes priority as the suggested supplier
        const supplierName = z.vendorName || entry.supplierName;
        const supplierEmail = z.vendorEmail || entry.supplierEmail || undefined;
        const daysWaiting = calendarDaysSince(entry.oldestCreatedAt);
        const covered = z.stockOnHand + onPurchaseOrder;
        const coveragePercent = entry.totalNeeded > 0 ? Math.min(100, Math.round((covered / entry.totalNeeded) * 100)) : 100;
        const { trend, lastMonth, prevMonth } = getDemandTrend(entry.sku);
        const stockoutRiskDays = getStockoutRiskDays(entry.sku, z.stockOnHand, onPurchaseOrder);
        const lastPurchasedDate = z.lastPurchasedDate || lastPurchaseMap.get(entry.sku) || null;
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
        // Distinct customers affected - more customers = higher priority
        const distinctCustomers = new Set(entry.orders.map(o => o.customerName)).size;
        if (distinctCustomers >= 3) priorityScore += 10;
        else if (distinctCustomers >= 2) priorityScore += 5;
        // Age escalation: if waiting longer than avg lead time, boost priority
        if (avgLeadTimeDays !== null && daysWaiting > avgLeadTimeDays) priorityScore += 10;
        // Demand variability penalty for erratic items
        const demandVar = getDemandVariability(entry.sku);
        if (demandVar === "erratic") priorityScore += 5;
        // Safety stock & recommended order qty
        const safetyStock = getSafetyStock(entry.sku, avgLeadTimeDays);
        const dailyBurn = getDailyBurnRate(entry.sku);
        const recommendedOrderQty = toOrder > 0 ? toOrder + safetyStock : 0;
        const analytical = computeAnalyticalFields(entry.sku, toOrder, daysWaiting, avgLeadTimeDays, entry.orders, recommendedOrderQty, z.unitCost ?? null, z.costSource ?? null);
        return { ...entry, supplierName, supplierEmail, stockOnHand: z.stockOnHand, onPurchaseOrder, zohoOnPurchaseOrder, poVariance, waitingSince: entry.oldestCreatedAt, toOrder, daysWaiting, priorityScore, coveragePercent, demandTrend: trend, lastMonthQty: lastMonth, prevMonthQty: prevMonth, stockoutRiskDays, lastPurchasedDate, seasonalPattern, avgLeadTimeDays, safetyStock, dailyBurnRate: dailyBurn, demandVariability: demandVar, distinctCustomers, recommendedOrderQty, ...analytical };
      });
      buyingRows.sort((a, b) => b.priorityScore - a.priorityScore);
      // ABC classification: top 80% of total demand = A, next 15% = B, rest = C
      const totalDemand = buyingRows.reduce((s, r) => s + r.totalNeeded, 0);
      let cumulative = 0;
      const sortedByDemand = [...buyingRows].sort((a, b) => b.totalNeeded - a.totalNeeded);
      for (const row of sortedByDemand) {
        cumulative += row.totalNeeded;
        const pct = totalDemand > 0 ? cumulative / totalDemand : 1;
        row.abcClass = pct <= 0.8 ? "A" : pct <= 0.95 ? "B" : "C";
      }
      setRows(buyingRows);
      fetchSuggestedRestock(activeSkus);
    } catch (error) { console.error("Failed to fetch buying sheet data:", error); } finally { setLoading(false); }

    fetchZohoData().then(zoho => {
      if (zoho) {
        setRows(prev => prev.map(row => {
          const z = row.isMiscellaneous ? { stockOnHand: 0, onPurchaseOrder: 0, vendorName: '', vendorEmail: '', unitCost: null, costSource: null, lastPurchasedDate: null } : (zoho[row.sku] || { stockOnHand: 0, onPurchaseOrder: 0, vendorName: '', vendorEmail: '' });
          const zohoOnPurchaseOrder = Math.max(0, z.onPurchaseOrder || 0);
          const onPurchaseOrder = row.allocatedOnPurchaseOrder;
          const poVariance = Math.abs(zohoOnPurchaseOrder - onPurchaseOrder);
          const toOrder = Math.max(0, row.totalNeeded - z.stockOnHand - onPurchaseOrder);
          // Zoho vendor (from historical POs) takes priority as the suggested supplier
          const supplierName = z.vendorName || row.supplierName;
          const supplierEmail = z.vendorEmail || row.supplierEmail || undefined;
          const covered = z.stockOnHand + onPurchaseOrder;
          const coveragePercent = row.totalNeeded > 0 ? Math.min(100, Math.round((covered / row.totalNeeded) * 100)) : 100;
          const stockoutRiskDays = getStockoutRiskDays(row.sku, z.stockOnHand, onPurchaseOrder);
          let priorityScore = 0;
          if (toOrder > 0) priorityScore += 30; if (row.hasUrgent) priorityScore += 40;
          if (row.daysWaiting > 7) priorityScore += 15; if (row.daysWaiting > 3) priorityScore += 10;
          if (coveragePercent < 25) priorityScore += 15; else if (coveragePercent < 50) priorityScore += 10;
          priorityScore += Math.min(20, row.orders.length * 5);
          if (stockoutRiskDays !== null && stockoutRiskDays <= 7) priorityScore += 15;
          else if (stockoutRiskDays !== null && stockoutRiskDays <= 14) priorityScore += 5;
          if (row.distinctCustomers >= 3) priorityScore += 10;
          else if (row.distinctCustomers >= 2) priorityScore += 5;
          if (row.avgLeadTimeDays !== null && row.daysWaiting > row.avgLeadTimeDays) priorityScore += 10;
          const safetyStock = getSafetyStock(row.sku, row.avgLeadTimeDays);
          const recommendedOrderQty = toOrder > 0 ? toOrder + safetyStock : 0;
          const analytical = computeAnalyticalFields(row.sku, toOrder, row.daysWaiting, row.avgLeadTimeDays, row.orders, recommendedOrderQty, z.unitCost ?? null, z.costSource ?? null);
          return { ...row, supplierName, supplierEmail, stockOnHand: z.stockOnHand, onPurchaseOrder, zohoOnPurchaseOrder, poVariance, toOrder, coveragePercent, priorityScore, stockoutRiskDays, safetyStock, recommendedOrderQty, lastPurchasedDate: z.lastPurchasedDate || row.lastPurchasedDate, ...analytical };
        }));
        toast({ title: "Live data ready", description: "Stock, PO and vendor-bill data loaded from the shared event cache" });
      }
    });
  };

  // Realtime callbacks are registered once, but always execute the newest
  // calculation closure with the current insight maps and Zoho snapshot.
  fetchLocalDataRef.current = fetchLocalData;

  // ── Actions ──────────────────────────────────────────────────────────
  const handleSort = useCallback((field: SortField) => {
    setSortField(prev => { if (prev === field) { setSortDirection(d => d === "asc" ? "desc" : "asc"); return prev; } setSortDirection(field === "sku" || field === "itemName" || field === "supplierName" ? "asc" : "desc"); return field; });
  }, []);

  const saveSnapshot = () => {
    const snapshot = { date: new Date().toISOString(), rows: sortedRows.map(r => ({ sku: r.rowKey, toOrder: r.toOrder })) };
    localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(snapshot));
    setSnapshotData(snapshot); setSnapshotSaved(true); setTimeout(() => setSnapshotSaved(false), 2000);
    toast({ title: "Snapshot Saved", description: `${snapshot.rows.length} items saved for comparison` });
  };

  const getSnapshotDiff = (sku: string, currentToOrder: number) => {
    if (!snapshotData || !showSnapshot) return null;
    const prev = snapshotData.rows.find(r => r.sku === sku);
    if (!prev) return { diff: currentToOrder, isNew: true };
    const diff = currentToOrder - prev.toOrder;
    return diff === 0 ? null : { diff, isNew: false };
  };

  const handleBulkMarkOrdered = async (skus?: string[]) => {
    const targetSkus = skus || Array.from(selectedSkus);
    if (targetSkus.length === 0) return;
    setBulkOrdering(true);
    try {
      const targetRows = sortedRows.filter(r => targetSkus.includes(r.rowKey));
      const orderItemIds = [...new Set(targetRows.flatMap((row) => row.orderItemIds))];
      if (orderItemIds.length > 0) {
        const { error } = await supabase.from("order_items").update({ stock_status: "ordered", notes: `Marked ordered from buying sheet on ${new Date().toLocaleDateString()}` }).in("id", orderItemIds);
        if (error) throw error;
        // Track recently ordered
        const newRecent: RecentlyOrderedItem[] = targetRows.map(r => ({ sku: r.sku, itemName: r.itemName, quantity: r.toOrder, orderedAt: new Date().toISOString(), supplier: r.supplierName }));
        const updated = [...newRecent, ...recentlyOrdered].slice(0, 50);
        setRecentlyOrdered(updated);
        saveRecentlyOrdered(updated);
        toast({ title: "Updated", description: `${orderItemIds.length} items marked as ordered` });
        setSelectedSkus(new Set());
        fetchLocalData();
      }
    } catch (err) { toast({ title: "Error", description: "Failed to update items", variant: "destructive" }); } finally { setBulkOrdering(false); }
  };

  const generateEmailDraft = (supplierName: string) => {
    const items = sortedRows.filter(r => r.supplierName === supplierName && r.toOrder > 0);
    if (items.length === 0) return;
    const itemLines = items.map(r => {
      const recQty = r.recommendedOrderQty > r.toOrder ? `${r.toOrder} (+ ${r.safetyStock} safety stock = ${r.recommendedOrderQty})` : `${r.toOrder}`;
      return `  • ${r.sku} — ${r.itemName} — Qty: ${recQty}`;
    }).join("\n");
    const totalQty = items.reduce((s, r) => s + r.recommendedOrderQty, 0);
    const urgentItems = items.filter(r => r.hasUrgent);
    const urgentNote = urgentItems.length > 0 ? `\n⚠️ URGENT: ${urgentItems.map(r => r.sku).join(", ")} — Please prioritize these items.\n` : "";
    setEmailDraftBody(`Dear ${supplierName},\n\nPlease find below our purchase order requirements:\n${urgentNote}\n${itemLines}\n\nTotal items: ${items.length}\nTotal quantity (incl. safety stock): ${totalQty}\n\nPlease confirm availability and expected delivery date.\n\nKind regards`);
    setEmailDraftSubject(`Purchase Order — ${supplierName} — ${new Date().toLocaleDateString()} (${items.length} items${urgentItems.length > 0 ? ", URGENT" : ""})`);
    setEmailDraftSupplier(supplierName);
    setEmailDraftOpen(true);
  };

  // Batch email ALL suppliers at once — copies all drafts to clipboard
  const handleBatchEmailAllSuppliers = () => {
    const supplierGroups = new Map<string, BuyingSheetRow[]>();
    sortedRows.filter(r => r.toOrder > 0).forEach(r => {
      const key = r.supplierName || "No Supplier";
      supplierGroups.set(key, [...(supplierGroups.get(key) || []), r]);
    });
    if (supplierGroups.size === 0) { toast({ title: "Nothing to order", variant: "destructive" }); return; }
    const allDrafts: string[] = [];
    for (const [supplier, items] of supplierGroups) {
      if (supplier === "No Supplier") continue;
      const itemLines = items.map(r => `  • ${r.sku} — ${r.itemName} — Qty: ${r.recommendedOrderQty}`).join("\n");
      const totalQty = items.reduce((s, r) => s + r.recommendedOrderQty, 0);
      allDrafts.push(`═══ ${supplier} ═══\n\nDear ${supplier},\n\nPlease find below our purchase order requirements:\n\n${itemLines}\n\nTotal items: ${items.length} | Total qty: ${totalQty}\n\nPlease confirm availability and expected delivery date.\n\nKind regards\n`);
    }
    navigator.clipboard.writeText(allDrafts.join("\n\n"));
    toast({ title: "All Drafts Copied", description: `${allDrafts.length} supplier emails copied to clipboard` });
  };

  const handleSaveNote = (sku: string) => {
    const updated = { ...notes, [sku]: noteText };
    if (!noteText.trim()) delete updated[sku];
    setNotes(updated); saveNotes(updated); setEditingNote(null); setNoteText("");
  };

  const handleCopyPOLine = (row: BuyingSheetRow) => {
    navigator.clipboard.writeText(`${row.sku}\t${row.itemName}\t${row.toOrder}\t${row.supplierName}`);
    toast({ title: "Copied", description: `PO line for ${row.sku} copied` });
  };

  const handleCopySelectedPOLines = () => {
    const target = sortedRows.filter(r => selectedSkus.has(r.rowKey));
    navigator.clipboard.writeText(["SKU\tItem Name\tQty to Order\tSupplier", ...target.map(r => `${r.sku}\t${r.itemName}\t${r.toOrder}\t${r.supplierName}`)].join("\n"));
    toast({ title: "Copied", description: `${target.length} PO lines copied` });
  };

  const handleCopySupplierEmails = () => {
    const emails = new Set<string>();
    const target = selectedSkus.size > 0 ? sortedRows.filter(r => selectedSkus.has(r.rowKey)) : sortedRows;
    target.forEach(r => { if (r.supplierEmail) emails.add(r.supplierEmail); });
    if (emails.size === 0) { toast({ title: "No emails", description: "No supplier emails found", variant: "destructive" }); return; }
    navigator.clipboard.writeText(Array.from(emails).join("; "));
    toast({ title: "Copied!", description: `${emails.size} email${emails.size !== 1 ? "s" : ""} copied` });
  };

  const handlePrint = () => {
    const printWindow = window.open("", "_blank"); if (!printWindow) return;
    const target = selectedSkus.size > 0 ? sortedRows.filter(r => selectedSkus.has(r.rowKey)) : sortedRows;
    const date = new Date().toLocaleDateString();
    const groups = new Map<string, BuyingSheetRow[]>();
    for (const row of target) { const key = row.supplierName || "No Supplier"; groups.set(key, [...(groups.get(key) || []), row]); }
    let html = `<!DOCTYPE html><html><head><title>Buying Sheet - ${date}</title><style>body{font-family:Arial,sans-serif;font-size:11px;padding:20px;color:#333}h1{font-size:18px}h2{font-size:14px;margin:20px 0 8px;padding:5px 8px;background:#f0f0f0;border-radius:4px}.summary{display:flex;gap:20px;margin-bottom:15px;padding:10px;background:#f8f8f8;border-radius:6px}.summary-item{text-align:center}.summary-label{font-size:10px;color:#666;text-transform:uppercase}.summary-value{font-size:16px;font-weight:bold}table{width:100%;border-collapse:collapse;margin-bottom:15px}th{text-align:left;padding:6px 8px;border-bottom:2px solid #333;font-size:10px;text-transform:uppercase;color:#666}td{padding:5px 8px;border-bottom:1px solid #ddd}.text-right{text-align:right}.urgent{color:#dc2626;font-weight:bold}.total-row{border-top:2px solid #333;font-weight:bold;background:#f8f8f8}@media print{body{padding:0}}</style></head><body><h1>📋 Buying Sheet</h1><p style="color:#666;font-size:12px">Generated: ${date} | ${target.length} SKUs | To Order: ${totals.toOrder.toLocaleString()} units</p><div class="summary"><div class="summary-item"><div class="summary-label">Total Needed</div><div class="summary-value">${totals.needed.toLocaleString()}</div></div><div class="summary-item"><div class="summary-label">In Stock</div><div class="summary-value">${totals.inStock.toLocaleString()}</div></div><div class="summary-item"><div class="summary-label">On PO</div><div class="summary-value">${totals.onPO.toLocaleString()}</div></div><div class="summary-item"><div class="summary-label">To Order</div><div class="summary-value" style="color:#2563eb">${totals.toOrder.toLocaleString()}</div></div></div>`;
    for (const [supplier, items] of groups.entries()) {
      const st = items.reduce((s, r) => s + r.toOrder, 0);
      html += `<h2>${supplier}</h2><table><thead><tr><th>SKU</th><th>Item</th><th class="text-right">Needed</th><th class="text-right">Stock</th><th class="text-right">Allocated PO</th><th class="text-right">Zoho Open PO</th><th class="text-right">To Order</th><th>Orders</th><th>Notes</th></tr></thead><tbody>`;
      for (const item of items) html += `<tr><td style="font-family:monospace;font-size:10px">${item.sku}</td><td>${item.itemName}</td><td class="text-right">${item.totalNeeded}</td><td class="text-right">${item.stockOnHand}</td><td class="text-right">${item.onPurchaseOrder}</td><td class="text-right ${item.poVariance > 0.01 ? "urgent" : ""}">${item.zohoOnPurchaseOrder}</td><td class="text-right ${item.toOrder > 0 ? "urgent" : ""}">${item.toOrder}</td><td style="font-size:10px">${item.orders.map(o => `${o.orderNumber} (${o.customerName})`).join(", ")}</td><td style="font-style:italic;color:#666;font-size:10px">${notes[item.rowKey] || ""}</td></tr>`;
      html += `<tr class="total-row"><td colspan="6">Total for ${supplier}</td><td class="text-right">${st}</td><td colspan="2"></td></tr></tbody></table>`;
    }
    html += `</body></html>`;
    printWindow.document.write(html); printWindow.document.close(); printWindow.print();
  };

  const handleExportCSV = () => {
    const target = selectedSkus.size > 0 ? sortedRows.filter(r => selectedSkus.has(r.rowKey)) : sortedRows;
    const headers = ["SKU","Item Name","Total Needed","In Stock","Allocated On PO","Zoho Open PO","PO Variance","To Order","Safety Stock","Recommended Qty","Coverage %","Waiting Since","Calendar Days Waiting","Stockout Risk Days","Daily Burn Rate","Demand Variability","Distinct Customers","Priority","Supplier","Lead Time","Trend","Season","Notes","Orders"];
    const csvRows = target.map(r => [r.sku, r.itemName, r.totalNeeded, r.stockOnHand, r.onPurchaseOrder, r.zohoOnPurchaseOrder, r.poVariance, r.toOrder, r.safetyStock, r.recommendedOrderQty, r.coveragePercent, r.waitingSince, r.daysWaiting, r.stockoutRiskDays ?? "N/A", r.dailyBurnRate.toFixed(1), r.demandVariability, r.distinctCustomers, r.priorityScore, r.supplierName, r.avgLeadTimeDays ?? "N/A", r.demandTrend, r.seasonalPattern || "N/A", notes[r.sku] || "", r.orders.map(o => `${o.orderNumber}(${o.customerName}:${o.quantity})`).join("; ")]);
    const csv = [headers, ...csvRows].map(r => r.map(c => `"${c}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" }); const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `buying-sheet-${new Date().toISOString().split("T")[0]}.csv`; a.click(); URL.revokeObjectURL(url);
  };

  const handleExportBySupplier = () => {
    const target = selectedSkus.size > 0 ? sortedRows.filter(r => selectedSkus.has(r.rowKey)) : sortedRows;
    const groups = new Map<string, BuyingSheetRow[]>();
    for (const row of target) { const key = row.supplierName || "No Supplier"; groups.set(key, [...(groups.get(key) || []), row]); }
    let csv = "";
    for (const [supplier, items] of groups.entries()) {
      csv += `\n"SUPPLIER: ${supplier}"\n"SKU","Item Name","Qty to Order","In Stock","Allocated On PO","Zoho Open PO","PO Variance","Notes"\n`;
      for (const item of items) csv += `"${item.sku}","${item.itemName}","${item.toOrder}","${item.stockOnHand}","${item.onPurchaseOrder}","${item.zohoOnPurchaseOrder}","${item.poVariance}","${notes[item.rowKey] || ""}"\n`;
      csv += `"","TOTAL","${items.reduce((s, r) => s + r.toOrder, 0)}","","","","",""\n`;
    }
    const blob = new Blob([csv], { type: "text/csv" }); const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `buying-sheet-by-supplier-${new Date().toISOString().split("T")[0]}.csv`; a.click(); URL.revokeObjectURL(url);
  };

  // ── Computed Data ──────────────────────────────────────────────────────
  const uniqueSuppliers = useMemo(() => {
    const suppliers = new Map<string, { name: string; count: number; totalToOrder: number; email?: string }>();
    rows.forEach(r => { if (r.supplierId) { const e = suppliers.get(r.supplierId); if (e) { e.count++; e.totalToOrder += r.toOrder; } else suppliers.set(r.supplierId, { name: r.supplierName, count: 1, totalToOrder: r.toOrder, email: r.supplierEmail }); } });
    return Array.from(suppliers.entries()).sort((a, b) => a[1].name.localeCompare(b[1].name));
  }, [rows]);

  const supplierConcentration = useMemo(() => {
    const map = new Map<string, number>();
    rows.forEach(r => map.set(r.supplierName || "No Supplier", (map.get(r.supplierName || "No Supplier") || 0) + r.toOrder));
    const sorted = Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
    const total = sorted.reduce((s, [, v]) => s + v, 0);
    const colors = ["hsl(var(--primary))","hsl(var(--chart-2))","hsl(var(--chart-3))","hsl(var(--chart-4))","hsl(var(--chart-5))","hsl(var(--muted-foreground))"];
    return sorted.map(([name, qty], i) => ({ name, qty, percent: total > 0 ? Math.round((qty / total) * 100) : 0, color: colors[i % colors.length] }));
  }, [rows]);

  const priorityCounts = useMemo(() => {
    const c = { critical: 0, high: 0, medium: 0, low: 0 };
    rows.forEach(r => { c[getPriorityLevel(r.priorityScore)]++; });
    return c;
  }, [rows]);

  // Coverage gaps: items needing order but with no supplier
  const coverageGaps = useMemo(() => {
    return rows.filter(r => r.toOrder > 0 && (r.supplierName === "No Supplier" || !r.supplierName));
  }, [rows]);

  const poIntegrity = useMemo(() => ({
    mismatches: rows.filter(row => row.poVariance > 0.01),
    unallocated: rows.filter(row => row.zohoOnPurchaseOrder > row.allocatedOnPurchaseOrder + 0.01).length,
    overAllocated: rows.filter(row => row.allocatedOnPurchaseOrder > row.zohoOnPurchaseOrder + 0.01).length,
  }), [rows]);

  const filteredRows = useMemo(() => rows.filter(row => {
    const matchesSearch = !search || row.itemName.toLowerCase().includes(search.toLowerCase()) || row.sku.toLowerCase().includes(search.toLowerCase()) || row.supplierName.toLowerCase().includes(search.toLowerCase()) || row.orders.some(o => o.orderNumber.toLowerCase().includes(search.toLowerCase()) || o.customerName.toLowerCase().includes(search.toLowerCase()));
    return matchesSearch && (supplierFilter === "all" || row.supplierId === supplierFilter) && (!showOnlyNeedOrder || row.toOrder > 0) && (!showOnlyPOMismatches || row.poVariance > 0.01) && (priorityFilter === "all" || getPriorityLevel(row.priorityScore) === priorityFilter);
  }), [rows, search, supplierFilter, showOnlyNeedOrder, showOnlyPOMismatches, priorityFilter]);

  const sortedRows = useMemo(() => {
    const sorted = [...filteredRows];
    sorted.sort((a, b) => {
      // Pinned items always on top
      const aPinned = pinnedSkus.includes(a.rowKey);
      const bPinned = pinnedSkus.includes(b.rowKey);
      if (aPinned && !bPinned) return -1;
      if (!aPinned && bPinned) return 1;
      let aVal: string | number | null = a[sortField];
      let bVal: string | number | null = b[sortField];
      if (aVal === null) aVal = sortDirection === "asc" ? Infinity : -Infinity;
      if (bVal === null) bVal = sortDirection === "asc" ? Infinity : -Infinity;
      if (typeof aVal === "string") aVal = aVal.toLowerCase();
      if (typeof bVal === "string") bVal = bVal.toLowerCase();
      return aVal < bVal ? (sortDirection === "asc" ? -1 : 1) : aVal > bVal ? (sortDirection === "asc" ? 1 : -1) : 0;
    });
    return sorted;
  }, [filteredRows, sortField, sortDirection, pinnedSkus]);

  // Detect items appearing with multiple suppliers
  const multiSupplierSkus = useMemo(() => {
    const skuSuppliers = new Map<string, Set<string>>();
    rows.forEach(r => {
      if (!skuSuppliers.has(r.sku)) skuSuppliers.set(r.sku, new Set());
      skuSuppliers.get(r.sku)!.add(r.supplierName);
    });
    const multi = new Set<string>();
    skuSuppliers.forEach((suppliers, sku) => { if (suppliers.size > 1) multi.add(sku); });
    return multi;
  }, [rows]);

  const groupedRows = useMemo(() => {
    if (!groupBySupplier) return null;
    const groups = new Map<string, BuyingSheetRow[]>();
    for (const row of sortedRows) groups.set(row.supplierName || "No Supplier", [...(groups.get(row.supplierName || "No Supplier") || []), row]);
    return Array.from(groups.entries()).sort((a, b) => b[1].reduce((s, r) => s + r.priorityScore, 0) - a[1].reduce((s, r) => s + r.priorityScore, 0));
  }, [sortedRows, groupBySupplier]);

  const totals = useMemo(() => filteredRows.reduce((acc, r) => ({
    needed: acc.needed + r.totalNeeded, inStock: acc.inStock + r.stockOnHand, onPO: acc.onPO + r.onPurchaseOrder,
    toOrder: acc.toOrder + r.toOrder, urgent: acc.urgent + (r.hasUrgent ? 1 : 0), avgDays: acc.avgDays + r.daysWaiting,
    stockoutRisk: acc.stockoutRisk + (r.stockoutRiskDays !== null && r.stockoutRiskDays <= 7 ? 1 : 0),
    estimatedCost: acc.estimatedCost + (r.estimatedCost || 0),
    abcA: acc.abcA + (r.abcClass === "A" ? 1 : 0),
  }), { needed: 0, inStock: 0, onPO: 0, toOrder: 0, urgent: 0, avgDays: 0, stockoutRisk: 0, estimatedCost: 0, abcA: 0 }), [filteredRows]);

  const avgDaysWaiting = filteredRows.length > 0 ? Math.round(totals.avgDays / filteredRows.length) : 0;

  // Total recommended order qty (including safety stock)
  const totalRecommendedQty = useMemo(() => filteredRows.reduce((s, r) => s + r.recommendedOrderQty, 0), [filteredRows]);
  const totalSafetyBuffer = useMemo(() => filteredRows.reduce((s, r) => s + r.safetyStock, 0), [filteredRows]);

  // ── Inline Helpers ────────────────────────────────────────────────────
  const toggleSelect = (sku: string, shiftKey = false) => setSelectedSkus(prev => {
    const next = new Set(prev);
    // Shift-click: select range between last selected and current
    if (shiftKey && lastSelectedSkuRef.current && lastSelectedSkuRef.current !== sku) {
      const skus = sortedRows.map(r => r.rowKey);
      const a = skus.indexOf(lastSelectedSkuRef.current);
      const b = skus.indexOf(sku);
      if (a >= 0 && b >= 0) {
        const [start, end] = a < b ? [a, b] : [b, a];
        for (let i = start; i <= end; i++) next.add(skus[i]);
        lastSelectedSkuRef.current = sku;
        return next;
      }
    }
    if (next.has(sku)) next.delete(sku); else next.add(sku);
    lastSelectedSkuRef.current = sku;
    return next;
  });
  const toggleSelectAll = () => setSelectedSkus(selectedSkus.size === sortedRows.length ? new Set() : new Set(sortedRows.map(r => r.rowKey)));
  const selectAllNeedingOrder = () => setSelectedSkus(new Set(sortedRows.filter(r => r.toOrder > 0).map(r => r.rowKey)));
  const fillRecommendedForSelected = () => {
    const target = sortedRows.filter(r => selectedSkus.has(r.rowKey));
    if (target.length === 0) return;
    setAdjustedQtys(prev => {
      const next = { ...prev };
      target.forEach(r => { next[r.rowKey] = r.recommendedOrderQty; });
      return next;
    });
    toast({ title: "Filled", description: `Recommended qty applied to ${target.length} item${target.length !== 1 ? "s" : ""}` });
  };
  const toggleSupplierCollapse = (supplier: string) => setCollapsedSuppliers(prev => {
    const next = new Set(prev);
    if (next.has(supplier)) next.delete(supplier); else next.add(supplier);
    return next;
  });
  const toggleExpand = (sku: string) => setExpandedSkus(prev => { const next = new Set(prev); if (next.has(sku)) next.delete(sku); else next.add(sku); return next; });
  const togglePin = (rowKey: string, label: string) => {
    const updated = pinnedSkus.includes(rowKey) ? pinnedSkus.filter(s => s !== rowKey) : [...pinnedSkus, rowKey];
    setPinnedSkus(updated); savePinned(updated);
    toast({ title: pinnedSkus.includes(rowKey) ? "Unpinned" : "Pinned", description: `${label} ${pinnedSkus.includes(rowKey) ? "removed from" : "pinned to"} top` });
  };

  // Selection totals (running summary for sticky action bar)
  const selectionTotals = useMemo(() => {
    const sel = sortedRows.filter(r => selectedSkus.has(r.rowKey));
    const suppliers = new Set(sel.map(r => r.supplierName));
    return {
      count: sel.length,
      qty: sel.reduce((s, r) => s + (adjustedQtys[r.rowKey] ?? r.recommendedOrderQty), 0),
      cost: sel.reduce((s, r) => s + (r.estimatedCost || 0), 0),
      suppliers: suppliers.size,
      urgent: sel.filter(r => r.hasUrgent).length,
    };
  }, [sortedRows, selectedSkus, adjustedQtys]);

  const getWaitHeatColor = (days: number) => {
    if (days > 14) return "bg-destructive/10";
    if (days > 7) return "bg-orange-500/5";
    if (days > 3) return "bg-amber-500/5";
    return "";
  };

  const highlightText = (text: string) => {
    if (!search) return text;
    const idx = text.toLowerCase().indexOf(search.toLowerCase());
    if (idx === -1) return text;
    return <>{text.slice(0, idx)}<mark className="bg-primary/20 text-foreground rounded px-0.5">{text.slice(idx, idx + search.length)}</mark>{text.slice(idx + search.length)}</>;
  };

  const todayOrdered = useMemo(() => {
    const today = new Date().toISOString().split("T")[0];
    return recentlyOrdered.filter(r => r.orderedAt.startsWith(today));
  }, [recentlyOrdered]);

  const SortableHeader = ({ field, children, className = "" }: { field: SortField; children: React.ReactNode; className?: string }) => (
    <TableHead className={`cursor-pointer select-none hover:bg-muted/50 transition-colors ${className}`} onClick={() => handleSort(field)}>
      <div className={`flex items-center gap-1 ${className.includes("text-right") ? "justify-end" : className.includes("text-center") ? "justify-center" : "justify-start"}`}>{children}{sortField === field ? (sortDirection === "asc" ? <ArrowUp className="h-3 w-3 text-primary" /> : <ArrowDown className="h-3 w-3 text-primary" />) : <ArrowUpDown className="h-3 w-3 text-muted-foreground/40" />}</div>
    </TableHead>
  );

  const PriorityBadge = ({ score }: { score: number }) => {
    if (score >= 70) return <Badge className="bg-destructive text-destructive-foreground gap-1 text-xs"><Flame className="h-3 w-3" />Critical</Badge>;
    if (score >= 50) return <Badge className="bg-orange-500 text-white gap-1 text-xs"><AlertTriangle className="h-3 w-3" />High</Badge>;
    if (score >= 30) return <Badge variant="secondary" className="gap-1 text-xs"><Clock className="h-3 w-3" />Medium</Badge>;
    return <Badge variant="outline" className="gap-1 text-xs"><CheckCircle2 className="h-3 w-3" />Low</Badge>;
  };

  const CoverageBar = ({ percent }: { percent: number }) => (
    <div className="flex items-center gap-2 min-w-[80px]">
      <Progress value={percent} className={`h-1.5 flex-1 ${percent >= 100 ? "[&>div]:bg-emerald-500" : percent >= 50 ? "[&>div]:bg-amber-500" : "[&>div]:bg-destructive"}`} />
      <span className="text-[10px] text-muted-foreground w-7 text-right">{percent}%</span>
    </div>
  );

  const DemandTrendIcon = ({ trend, lastMonth, prevMonth }: { trend: string; lastMonth: number; prevMonth: number }) => (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex items-center">
          {trend === "up" && <TrendingUp className="h-3.5 w-3.5 text-emerald-500" />}
          {trend === "down" && <TrendingDown className="h-3.5 w-3.5 text-destructive" />}
          {trend === "stable" && <Minus className="h-3.5 w-3.5 text-muted-foreground" />}
          {trend === "new" && <BarChart3 className="h-3.5 w-3.5 text-primary" />}
        </span>
      </TooltipTrigger>
      <TooltipContent><p className="text-xs">{trend === "up" ? `↑ Rising (${prevMonth}→${lastMonth})` : trend === "down" ? `↓ Falling (${prevMonth}→${lastMonth})` : trend === "new" ? "New item" : `Stable (${lastMonth}/mo)`}</p></TooltipContent>
    </Tooltip>
  );

  const StockoutRiskBadge = ({ days }: { days: number | null }) => {
    if (days === null) return <span className="text-xs text-muted-foreground/50">—</span>;
    if (days <= 7) return <Tooltip><TooltipTrigger asChild><Badge variant="destructive" className="text-xs gap-1 animate-pulse"><Timer className="h-3 w-3" />{days}d</Badge></TooltipTrigger><TooltipContent><p className="text-xs">⚠️ Stock runs out in ~{days} days</p></TooltipContent></Tooltip>;
    if (days <= 14) return <Tooltip><TooltipTrigger asChild><Badge className="text-xs gap-1 bg-orange-500 text-white"><Timer className="h-3 w-3" />{days}d</Badge></TooltipTrigger><TooltipContent><p className="text-xs">Stock runs out in ~{days} days</p></TooltipContent></Tooltip>;
    return <span className="text-xs text-muted-foreground">{days}d</span>;
  };

  // ── Row Renderers ─────────────────────────────────────────────────────
  const renderExpandedRow = (row: BuyingSheetRow) => (
    <TableRow key={`expanded-${row.rowKey}`} className="bg-muted/30">
      <TableCell colSpan={15}>
        <div className="py-2 px-4 grid grid-cols-1 sm:grid-cols-3 gap-4">
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
          <div>
            <p className="text-xs font-semibold text-muted-foreground mb-1.5">Stock & Demand Analysis</p>
            <div className="space-y-1.5 text-xs">
              <div className="flex justify-between"><span className="text-muted-foreground">ABC Class:</span><Badge variant={row.abcClass === "A" ? "destructive" : row.abcClass === "B" ? "secondary" : "outline"} className="text-[10px]">{row.abcClass}</Badge></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Last Month:</span><span className="font-medium">{row.lastMonthQty}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Previous:</span><span className="font-medium">{row.prevMonthQty}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Forecast Next:</span><span className="font-bold text-primary">{row.forecastNextMonth}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Daily Burn Rate:</span><span className="font-medium">{row.dailyBurnRate.toFixed(1)}/day</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Weekly Velocity:</span><span className="font-medium">{row.velocityScore}/wk {row.weeklyTrend !== 0 && <span className={row.weeklyTrend > 0 ? "text-emerald-600" : "text-destructive"}>({row.weeklyTrend > 0 ? "+" : ""}{row.weeklyTrend}%)</span>}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Demand Pattern:</span><span className={`font-medium ${row.demandVariability === "erratic" ? "text-destructive" : row.demandVariability === "moderate" ? "text-orange-500" : "text-emerald-500"}`}>{row.demandVariability}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Reorder Point:</span><span className="font-medium">{row.reorderPoint}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Safety Stock:</span><span className="font-medium">{row.safetyStock > 0 ? `+${row.safetyStock} buffer` : "—"}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Recommended Qty:</span><span className="font-bold text-primary">{row.recommendedOrderQty}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Demand-linked PO:</span><span className="font-medium">{row.allocatedOnPurchaseOrder}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Zoho open PO:</span><span className={`font-medium ${row.poVariance > 0.01 ? "text-amber-600" : "text-emerald-600"}`}>{row.zohoOnPurchaseOrder}{row.poVariance > 0.01 ? ` (Δ ${row.poVariance})` : " ✓"}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Waiting Since:</span><span className="font-medium">{new Date(row.waitingSince).toLocaleDateString()} ({row.daysWaiting} calendar days)</span></div>
              {row.unitCost !== null && <div className="flex justify-between"><span className="text-muted-foreground">Unit Cost:</span><span className="font-medium">R{row.unitCost.toFixed(2)} <span className="text-[10px] text-muted-foreground">({row.costSource === "bill" ? "vendor bill" : "estimated"})</span></span></div>}
              {row.estimatedCost !== null && <div className="flex justify-between"><span className="text-muted-foreground">Est. Cost:</span><span className="font-bold">R{row.estimatedCost.toLocaleString()}</span></div>}

              <div className="flex justify-between"><span className="text-muted-foreground">Coverage:</span><CoverageBar percent={row.coveragePercent} /></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Stockout Risk:</span><StockoutRiskBadge days={row.stockoutRiskDays} /></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Customers Affected:</span><span className="font-medium">{row.distinctCustomers}</span></div>
              {row.supplierReliability !== null && <div className="flex justify-between"><span className="text-muted-foreground">Supplier Reliability:</span><span className={`font-medium ${row.supplierReliability >= 80 ? "text-emerald-600" : row.supplierReliability >= 60 ? "text-orange-500" : "text-destructive"}`}>{row.supplierReliability}%</span></div>}
              {row.avgLeadTimeDays !== null && <div className="flex justify-between"><span className="text-muted-foreground">Avg Lead Time:</span><span className={`font-medium ${row.daysWaiting > row.avgLeadTimeDays ? "text-destructive" : ""}`}>{row.avgLeadTimeDays}d {row.daysWaiting > row.avgLeadTimeDays ? "(overdue!)" : ""}</span></div>}
              {row.seasonalPattern && <div className="flex justify-between"><span className="text-muted-foreground">Season:</span><span className="flex items-center gap-1 font-medium">{row.seasonalPattern === "peak" ? <><Sun className="h-3 w-3 text-orange-500" />Peak</> : row.seasonalPattern === "low" ? <><Snowflake className="h-3 w-3 text-blue-500" />Low</> : "Normal"}</span></div>}
              {row.lastPurchasedDate && <div className="flex justify-between"><span className="text-muted-foreground">Last Purchased:</span><span className="font-medium">{new Date(row.lastPurchasedDate).toLocaleDateString()}</span></div>}
              {row.conflictingUrgency && <div className="p-1.5 rounded bg-destructive/10 border border-destructive/20 text-[10px] text-destructive font-medium">⚠️ Mixed urgency levels across orders</div>}
            </div>
          </div>
          <div>
            <p className="text-xs font-semibold text-muted-foreground mb-1.5">Quick Actions</p>
            <div className="space-y-1.5">
              {/* Inline qty adjustment */}
              <div className="flex items-center gap-2 p-1.5 rounded bg-background/60 border border-border">
                <span className="text-[10px] text-muted-foreground">Order Qty:</span>
                <Input type="number" min={0} value={adjustedQtys[row.rowKey] ?? row.recommendedOrderQty} onChange={e => setAdjustedQtys(prev => ({ ...prev, [row.rowKey]: Math.max(0, parseInt(e.target.value) || 0) }))} className="h-6 w-16 text-xs text-center p-0" />
                {adjustedQtys[row.rowKey] !== undefined && adjustedQtys[row.rowKey] !== row.recommendedOrderQty && (
                  <Button variant="ghost" size="sm" className="h-5 w-5 p-0" onClick={() => setAdjustedQtys(prev => { const n = { ...prev }; delete n[row.rowKey]; return n; })}><X className="h-3 w-3" /></Button>
                )}
              </div>
              <Button variant="outline" size="sm" className="w-full justify-start gap-2 text-xs" onClick={() => handleCopyPOLine(row)}><ClipboardCopy className="h-3 w-3" />Copy PO Line</Button>
              <Button variant="outline" size="sm" className="w-full justify-start gap-2 text-xs" onClick={() => generateEmailDraft(row.supplierName)}><Send className="h-3 w-3" />Draft Email to {row.supplierName}</Button>
              {row.supplierEmail && <Button variant="outline" size="sm" className="w-full justify-start gap-2 text-xs" onClick={() => { navigator.clipboard.writeText(row.supplierEmail!); toast({ title: "Copied", description: `${row.supplierEmail} copied` }); }}><Mail className="h-3 w-3" />Copy Email</Button>}
              {notes[row.rowKey] && <div className="p-2 rounded bg-primary/5 border border-primary/10"><p className="text-[10px] font-medium text-primary mb-0.5">Note:</p><p className="text-xs text-muted-foreground">{notes[row.rowKey]}</p></div>}
            </div>
          </div>
        </div>
      </TableCell>
    </TableRow>
  );

  const renderRow = (row: BuyingSheetRow) => {
    const isExpanded = expandedSkus.has(row.rowKey);
    const isPinned = pinnedSkus.includes(row.rowKey);
    const isMultiSupplier = multiSupplierSkus.has(row.sku);
    const densityPy = viewDensity === "compact" ? "py-1" : "py-2";
    return (
      <Fragment key={row.rowKey}>
        <TableRow className={`cursor-pointer transition-colors ${getWaitHeatColor(row.daysWaiting)} ${row.toOrder > 0 ? "" : "opacity-60"} ${selectedSkus.has(row.rowKey) ? "bg-primary/5" : ""} ${row.hasUrgent ? "border-l-2 border-l-destructive" : ""} ${isExpanded ? "bg-muted/20" : ""} ${isPinned ? "border-l-2 border-l-primary bg-primary/[0.02]" : ""}`}>
          <TableCell className={`w-8 ${densityPy}`} onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-0.5">
              <span onClick={(e) => { e.stopPropagation(); toggleSelect(row.rowKey, e.shiftKey); }} className="inline-flex"><Checkbox checked={selectedSkus.has(row.rowKey)} /></span>
              <button onClick={() => togglePin(row.rowKey, row.itemName)} className={`p-0.5 rounded hover:bg-muted transition-colors ${isPinned ? "text-primary" : "text-muted-foreground/20 hover:text-muted-foreground"}`}>
                {isPinned ? <Pin className="h-3 w-3" /> : <PinOff className="h-3 w-3" />}
              </button>
            </div>
          </TableCell>
          <TableCell className={densityPy} onClick={() => toggleExpand(row.rowKey)}><div className="flex items-center gap-1">{isExpanded ? <ChevronUp className="h-3 w-3 text-muted-foreground" /> : <ChevronDown className="h-3 w-3 text-muted-foreground/40" />}<PriorityBadge score={row.priorityScore} /></div></TableCell>
          <TableCell className={`font-mono text-xs text-muted-foreground ${densityPy}`} onClick={() => toggleExpand(row.rowKey)}>{highlightText(row.sku)}</TableCell>
          <TableCell className={`font-medium max-w-[180px] ${densityPy}`} onClick={() => toggleExpand(row.rowKey)}>
            <div className="flex items-center gap-1 min-w-0">
              <span className="truncate">{highlightText(row.itemName)}</span>
              <span className={`text-[9px] font-bold px-1 rounded shrink-0 ${row.abcClass === "A" ? "bg-destructive/15 text-destructive" : row.abcClass === "B" ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"}`}>{row.abcClass}</span>
              {row.conflictingUrgency && <Tooltip><TooltipTrigger asChild><AlertTriangle className="h-3 w-3 text-amber-500 shrink-0" /></TooltipTrigger><TooltipContent><p className="text-xs">⚠️ Mixed urgency levels across orders</p></TooltipContent></Tooltip>}
            </div>
          </TableCell>
          <TableCell className={`text-right font-semibold ${densityPy}`} onClick={() => toggleExpand(row.rowKey)}>{row.totalNeeded}</TableCell>
          <TableCell className={`text-right font-medium ${densityPy}`} onClick={() => toggleExpand(row.rowKey)}>{row.stockOnHand}</TableCell>
          <TableCell className={`text-right font-medium ${densityPy}`} onClick={() => toggleExpand(row.rowKey)}>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex items-center justify-end gap-1.5">
                  <span>{row.onPurchaseOrder}</span>
                  {row.poVariance > 0.01 && <span className="h-2 w-2 rounded-full bg-amber-500 ring-2 ring-amber-500/20" aria-label="PO quantity needs reconciliation" />}
                </div>
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-72">
                <p className="text-xs font-semibold">PO quantity reconciliation</p>
                <p className="text-xs">Allocated to these orders: {row.allocatedOnPurchaseOrder}</p>
                <p className="text-xs">Open in Zoho for this SKU: {row.zohoOnPurchaseOrder}</p>
                {row.poVariance > 0.01 && <p className="mt-1 text-xs text-amber-600">Difference: {row.poVariance}. Review PO links before ordering.</p>}
              </TooltipContent>
            </Tooltip>
          </TableCell>
          <TableCell className={densityPy} onClick={() => toggleExpand(row.rowKey)}><CoverageBar percent={row.coveragePercent} /></TableCell>
          <TableCell className={`text-right ${densityPy}`} onClick={() => toggleExpand(row.rowKey)}>
            <div className="flex items-center justify-end gap-1">
              {row.toOrder > 0 ? <Badge variant="destructive" className="font-bold">{row.toOrder}</Badge> : <Badge variant="outline" className="text-accent-foreground">0</Badge>}
              {(() => { const diff = getSnapshotDiff(row.rowKey, row.toOrder); if (!diff) return null; if (diff.isNew) return <span className="text-[10px] text-primary font-medium">NEW</span>; return <span className={`text-[10px] font-medium ${diff.diff > 0 ? "text-destructive" : "text-emerald-600"}`}>{diff.diff > 0 ? "+" : ""}{diff.diff}</span>; })()}
            </div>
          </TableCell>
          <TableCell className={`text-center ${densityPy}`} onClick={() => toggleExpand(row.rowKey)}><StockoutRiskBadge days={row.stockoutRiskDays} /></TableCell>
          <TableCell className={`text-center ${densityPy}`} onClick={() => toggleExpand(row.rowKey)}><DemandTrendIcon trend={row.demandTrend} lastMonth={row.lastMonthQty} prevMonth={row.prevMonthQty} /></TableCell>
          <TableCell className={`text-center ${densityPy}`} onClick={() => toggleExpand(row.rowKey)}>
            <div className="flex items-center justify-center gap-1">
              <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${row.ageEscalation === "red" ? "bg-destructive" : row.ageEscalation === "orange" ? "bg-orange-500" : row.ageEscalation === "yellow" ? "bg-amber-400" : "bg-emerald-500"}`} />
              <Tooltip><TooltipTrigger asChild><span className={`text-sm font-medium ${row.daysWaiting > 7 ? "text-destructive" : row.daysWaiting > 3 ? "text-orange-500" : "text-muted-foreground"}`}>{row.daysWaiting}d</span></TooltipTrigger><TooltipContent><p className="text-xs">Calendar days since {new Date(row.waitingSince).toLocaleDateString()}</p></TooltipContent></Tooltip>
            </div>
          </TableCell>
          <TableCell className={`text-sm ${densityPy}`} onClick={() => toggleExpand(row.rowKey)}>
            <div className="flex items-center gap-1.5">
              <span>{highlightText(row.supplierName)}</span>
              {isMultiSupplier && <Tooltip><TooltipTrigger asChild><Sparkles className="h-3 w-3 text-amber-500" /></TooltipTrigger><TooltipContent><p className="text-xs">⚠️ This item appears with multiple suppliers</p></TooltipContent></Tooltip>}
              {row.avgLeadTimeDays !== null && <Tooltip><TooltipTrigger asChild><span className="text-[10px] text-muted-foreground bg-muted px-1 rounded">{row.avgLeadTimeDays}d</span></TooltipTrigger><TooltipContent><p className="text-xs">Avg lead time: {row.avgLeadTimeDays} days</p></TooltipContent></Tooltip>}
              {row.seasonalPattern === "peak" && <Tooltip><TooltipTrigger asChild><Sun className="h-3 w-3 text-orange-500" /></TooltipTrigger><TooltipContent><p className="text-xs">🔥 Peak season</p></TooltipContent></Tooltip>}
              {row.seasonalPattern === "low" && <Tooltip><TooltipTrigger asChild><Snowflake className="h-3 w-3 text-blue-500" /></TooltipTrigger><TooltipContent><p className="text-xs">❄️ Low season</p></TooltipContent></Tooltip>}
            </div>
          </TableCell>
          <TableCell className={densityPy} onClick={() => toggleExpand(row.rowKey)}><span className="text-xs text-muted-foreground">{row.orders.length} order{row.orders.length !== 1 ? "s" : ""}</span></TableCell>
          <TableCell className="w-8" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-0.5">
              <Popover open={editingNote === row.rowKey} onOpenChange={open => { if (!open) setEditingNote(null); }}>
                <PopoverTrigger asChild>
                  <button onClick={() => { setEditingNote(row.rowKey); setNoteText(notes[row.rowKey] || ""); }} className={`p-1 rounded hover:bg-muted transition-colors ${notes[row.rowKey] ? "text-primary" : "text-muted-foreground/40"}`}><StickyNote className="h-3.5 w-3.5" /></button>
                </PopoverTrigger>
                <PopoverContent className="w-64 p-3" side="left">
                  <div className="space-y-2">
                    <p className="text-xs font-medium text-muted-foreground">Note for {row.sku}</p>
                    <Textarea value={noteText} onChange={e => setNoteText(e.target.value)} placeholder="Add procurement note..." className="min-h-[60px] text-sm" autoFocus />
                    <div className="flex gap-1 justify-end">
                      {notes[row.rowKey] && <Button variant="ghost" size="sm" onClick={() => { setNoteText(""); handleSaveNote(row.rowKey); }}><X className="h-3 w-3 mr-1" />Clear</Button>}
                      <Button size="sm" onClick={() => handleSaveNote(row.rowKey)}>Save</Button>
                    </div>
                  </div>
                </PopoverContent>
              </Popover>
              <button onClick={() => handleCopyPOLine(row)} className="p-1 rounded hover:bg-muted transition-colors text-muted-foreground/40 hover:text-foreground"><ClipboardCopy className="h-3.5 w-3.5" /></button>
            </div>
          </TableCell>
        </TableRow>
        {isExpanded && renderExpandedRow(row)}
      </Fragment>
    );
  };

  // ── Render ─────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3"><Skeleton className="h-8 w-8 rounded-lg" /><Skeleton className="h-8 w-48" /></div>
        <div className="grid grid-cols-4 gap-2">{[1,2,3,4].map(i => <Skeleton key={i} className="h-16 rounded-xl" />)}</div>
        <Skeleton className="h-10 w-full rounded-lg" />
        <Skeleton className="h-[400px] w-full rounded-xl" />
      </div>
    );
  }

  return (
    <TooltipProvider>
      <div className={`procurement-page aleph-page-workspace aleph-buying-workspace app-no-x-scroll min-w-0 w-full max-w-full space-y-5 overflow-x-hidden ${isFullscreen ? "fixed inset-0 z-[100] h-[100dvh] bg-background p-3 sm:p-5 overflow-y-auto overflow-x-hidden overscroll-contain" : ""}`} ref={printRef}>
        {/* ── Sticky Header ── */}
        <div className="sticky top-0 z-20 -mx-1 px-1 pb-3 bg-background/88 backdrop-blur-xl supports-[backdrop-filter]:bg-background/72">
          <div className="procurement-command-center rounded-[24px] border border-border/60 bg-card/92 shadow-xl shadow-black/[0.04] overflow-hidden mb-3">
            <div className="ribbon-bar" aria-hidden />
            <div className="flex flex-col gap-3 p-4">
            {/* Title + actions row */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
              <div className="flex items-center gap-2.5 flex-wrap">
                <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-primary ring-1 ring-primary/15 shadow-sm">
                  <ShoppingCart className="h-5 w-5" />
                </span>
                <div>
                  <h1 className="font-display text-xl font-bold tracking-tight leading-tight">Buying Sheet</h1>
                  <p className="text-xs text-muted-foreground">
                    {filteredRows.length} SKUs to review
                    {zohoLoading && " · loading live snapshot..."}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1.5 flex-wrap">
                <Tooltip><TooltipTrigger asChild>
                  <Button variant="outline" size="icon" onClick={toggleFullscreen} className="h-9 w-9" aria-label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}>
                    {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
                  </Button>
                </TooltipTrigger><TooltipContent><p className="text-xs">{isFullscreen ? "Exit" : "Enter"} fullscreen</p></TooltipContent></Tooltip>
                <Tooltip><TooltipTrigger asChild>
                  <Button variant="outline" size="icon" onClick={() => { const next: ViewDensity = viewDensity === "compact" ? "comfortable" : "compact"; setViewDensity(next); saveDensity(next); }} className="h-9 w-9">
                    {viewDensity === "compact" ? <AlignJustify className="h-4 w-4" /> : <AlignCenter className="h-4 w-4" />}
                  </Button>
                </TooltipTrigger><TooltipContent><p className="text-xs">{viewDensity === "compact" ? "Comfortable" : "Compact"} view</p></TooltipContent></Tooltip>
                <Button variant="outline" size="sm" onClick={handleExportCSV} className="h-9 gap-1.5">
                  <Download className="h-4 w-4" />{selectedSkus.size > 0 ? `Export (${selectedSkus.size})` : "Export CSV"}
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="icon" className="h-9 w-9"><MoreHorizontal className="h-4 w-4" /></Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56">
                    <DropdownMenuItem onClick={handlePrint}><Printer className="h-4 w-4 mr-2" />Print sheet</DropdownMenuItem>
                    <DropdownMenuItem onClick={handleExportBySupplier}><FileSpreadsheet className="h-4 w-4 mr-2" />Export by supplier</DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={saveSnapshot}>
                      <Save className="h-4 w-4 mr-2" />Save snapshot{snapshotSaved && " ✓"}
                    </DropdownMenuItem>
                    {snapshotData && (
                      <DropdownMenuItem onClick={() => setShowSnapshot(!showSnapshot)}>
                        <History className="h-4 w-4 mr-2" />{showSnapshot ? "Hide comparison" : "Compare to snapshot"}
                      </DropdownMenuItem>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>


            {/* Procurement workspaces + filters */}
            <div className="buying-mode-and-filter grid gap-3 xl:grid-cols-[minmax(420px,.9fr)_minmax(0,1.1fr)]">
              <div className="buying-mode-deck grid grid-cols-3 gap-2" role="tablist" aria-label="Buying Sheet workspace">
                {([
                  { value: "quick", label: "Order Queue", hint: "Work by urgency", icon: Zap },
                  { value: "suppliers", label: "Supplier Rooms", hint: "Prepare each PO", icon: LayoutGrid },
                  { value: "table", label: "Data Console", hint: "Detailed controls", icon: TableIcon },
                ] as const).map((mode) => {
                  const Icon = mode.icon;
                  const active = viewMode === mode.value;
                  return (
                    <button
                      key={mode.value}
                      type="button"
                      role="tab"
                      aria-selected={active}
                      onClick={() => setViewMode(mode.value)}
                      className={`flex min-w-0 items-center gap-2 rounded-2xl border p-2.5 text-left transition-all ${active ? "border-primary/30 bg-primary text-primary-foreground shadow-lg shadow-primary/20" : "border-border/60 bg-background/55 hover:border-primary/20 hover:bg-muted/60"}`}
                    >
                      <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${active ? "bg-white/16" : "bg-primary/10 text-primary"}`}><Icon className="h-4 w-4" /></span>
                      <span className="min-w-0">
                        <strong className="block truncate text-xs">{mode.label}</strong>
                        <span className={`hidden truncate text-[9px] sm:block ${active ? "text-primary-foreground/65" : "text-muted-foreground"}`}>{mode.hint}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
              <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_190px_auto_auto] xl:items-center">
                <div className="relative min-w-0">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input placeholder="Search SKU, item, order, customer..." value={search} onChange={e => setSearch(e.target.value)} className="h-11 rounded-2xl pl-9 text-sm" />
                </div>
                <Select value={supplierFilter} onValueChange={setSupplierFilter}>
                  <SelectTrigger className="h-11 w-full rounded-2xl text-xs"><Package className="mr-1.5 h-3.5 w-3.5" /><SelectValue placeholder="All Suppliers" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Suppliers</SelectItem>
                    {uniqueSuppliers.map(([id, info]) => <SelectItem key={id} value={id}>{info.name} ({info.totalToOrder})</SelectItem>)}
                  </SelectContent>
                </Select>
                <Button variant={showOnlyNeedOrder ? "default" : "outline"} size="sm" onClick={() => setShowOnlyNeedOrder(!showOnlyNeedOrder)} className="h-11 rounded-2xl gap-1.5 whitespace-nowrap">
                  <AlertTriangle className="h-3.5 w-3.5" />{showOnlyNeedOrder ? "Needs Order" : "Show All"}
                </Button>
                <Button variant={showOnlyPOMismatches ? "default" : "outline"} size="sm" onClick={() => { const next = !showOnlyPOMismatches; setShowOnlyPOMismatches(next); if (next) setShowOnlyNeedOrder(false); }} className={`h-11 rounded-2xl gap-1.5 whitespace-nowrap ${!showOnlyPOMismatches && poIntegrity.mismatches.length > 0 ? "border-amber-500/50 text-amber-700 dark:text-amber-300" : ""}`}>
                  <Eye className="h-3.5 w-3.5" />PO Audit {poIntegrity.mismatches.length > 0 && <Badge variant="secondary" className="ml-0.5 h-5 min-w-5 px-1.5">{poIntegrity.mismatches.length}</Badge>}
                </Button>
              </div>
            </div>
            </div>
          </div>
        </div>

        {/* Snapshot comparison notice */}
        {showSnapshot && snapshotData && (
          <div className="flex items-center gap-2 p-2 rounded-lg bg-muted/50 border border-border text-xs">
            <History className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-muted-foreground">Comparing to <strong>{new Date(snapshotData.date).toLocaleString()}</strong> ({snapshotData.rows.length} items)</span>
            <Button variant="ghost" size="sm" className="ml-auto h-6 text-xs" onClick={() => setShowSnapshot(false)}>Hide</Button>
          </div>
        )}

        {/* Event-driven sync status */}
        {lastRefreshedAt && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5"><Zap className="h-3.5 w-3.5 text-emerald-500" />Live webhook cache · last document event {lastRefreshedAt.toLocaleTimeString()}</span>
          </div>
        )}

        {/* PO Integrity Radar: turns silent source disagreements into an actionable queue. */}
        {poIntegrity.mismatches.length > 0 && (
          <div className="flex flex-col gap-3 rounded-2xl border border-amber-500/25 bg-gradient-to-r from-amber-500/10 via-card to-card px-4 py-3 sm:flex-row sm:items-center">
            <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-amber-500/15 text-amber-600"><Eye className="h-4 w-4" /></div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">PO Integrity Radar found {poIntegrity.mismatches.length} SKU{poIntegrity.mismatches.length === 1 ? "" : "s"} to reconcile</p>
              <p className="text-xs text-muted-foreground">{poIntegrity.unallocated} have open Zoho quantity not linked to these orders · {poIntegrity.overAllocated} have more allocated locally than Zoho reports open.</p>
            </div>
            <Button variant="outline" size="sm" className="rounded-xl border-amber-500/30" onClick={() => { setShowOnlyPOMismatches(true); setShowOnlyNeedOrder(false); setViewMode("table"); }}>Review differences</Button>
          </div>
        )}

        {/* Recently Ordered Today */}
        {todayOrdered.length > 0 && (
          <Collapsible open={showRecentlyOrdered} onOpenChange={setShowRecentlyOrdered}>
            <Card className="border-dashed border-emerald-500/30 bg-emerald-500/5">
              <CollapsibleTrigger asChild>
                <button className="w-full flex items-center justify-between p-3 hover:bg-emerald-500/10 transition-colors rounded-t-lg">
                  <div className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-emerald-500" /><span className="font-semibold text-sm text-foreground">Ordered Today</span><Badge className="text-xs bg-emerald-500/20 text-emerald-700 border-emerald-500/30">{todayOrdered.length}</Badge></div>
                  {showRecentlyOrdered ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                </button>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <CardContent className="p-0 divide-y divide-border/50">
                  {todayOrdered.map((item, i) => (
                    <div key={`${item.sku}-${i}`} className="flex items-center justify-between px-4 py-2 text-sm">
                      <div><span className="font-mono text-xs text-muted-foreground mr-2">{item.sku}</span><span className="font-medium">{item.itemName}</span></div>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        <span>{item.supplier}</span>
                        <Badge variant="outline">{item.quantity}</Badge>
                        <span>{new Date(item.orderedAt).toLocaleTimeString()}</span>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </CollapsibleContent>
            </Card>
          </Collapsible>
        )}

        <section className="buying-intelligence-grid grid gap-4 2xl:grid-cols-[minmax(0,1.35fr)_minmax(360px,.65fr)]">
          <BuyingSheetSummary totals={totals} avgDaysWaiting={avgDaysWaiting} supplierCount={uniqueSuppliers.length} />

          <ProcurementSuggestionsPanel
            items={rows
              .filter((r) => r.toOrder > 0)
              .slice(0, 80)
              .map((r) => ({
                sku: r.sku,
                name: r.itemName,
                supplier: r.supplierName,
                stock: r.stockOnHand,
                toOrder: r.toOrder,
                monthlyDemand: r.lastMonthQty,
                daysToZero: r.stockoutRiskDays ?? undefined,
                abcClass: r.abcClass,
              }))}
          />
        </section>

        {/* Priority Filter Tabs */}
        <Tabs value={priorityFilter} onValueChange={v => setPriorityFilter(v as PriorityFilter)}>
          <TabsList className="bg-muted/50 h-8">
            <TabsTrigger value="all" className="gap-1 text-xs h-7"><Filter className="h-3 w-3" />All <Badge variant="outline" className="text-[10px] px-1 py-0 ml-0.5">{rows.length}</Badge></TabsTrigger>
            <TabsTrigger value="critical" className="gap-1 text-xs h-7"><Flame className="h-3 w-3" />Critical <Badge variant={priorityCounts.critical > 0 ? "destructive" : "outline"} className="text-[10px] px-1 py-0 ml-0.5">{priorityCounts.critical}</Badge></TabsTrigger>
            <TabsTrigger value="high" className="gap-1 text-xs h-7"><AlertTriangle className="h-3 w-3" />High <Badge className="text-[10px] px-1 py-0 ml-0.5 bg-orange-500 text-white">{priorityCounts.high}</Badge></TabsTrigger>
            <TabsTrigger value="medium" className="gap-1 text-xs h-7"><Clock className="h-3 w-3" />Med <Badge variant="secondary" className="text-[10px] px-1 py-0 ml-0.5">{priorityCounts.medium}</Badge></TabsTrigger>
            <TabsTrigger value="low" className="gap-1 text-xs h-7"><CheckCircle2 className="h-3 w-3" />Low <Badge variant="outline" className="text-[10px] px-1 py-0 ml-0.5">{priorityCounts.low}</Badge></TabsTrigger>
          </TabsList>
        </Tabs>

        {/* Supplier Concentration Chart */}
        {showSupplierChart && supplierConcentration.length > 0 && (
          <Card><CardContent className="p-4">
            <div className="flex items-center gap-2 mb-3"><PieChart className="h-4 w-4 text-primary" /><span className="font-semibold text-sm text-foreground">Supplier Concentration</span></div>
            <div className="flex items-center gap-6 flex-wrap">
              <div className="flex-1 min-w-[300px] space-y-1.5">
                {supplierConcentration.slice(0, 8).map(s => (
                  <div key={s.name} className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground w-32 truncate text-right">{s.name}</span>
                    <div className="flex-1 h-4 bg-muted/40 rounded-full overflow-hidden"><div className="h-full rounded-full transition-all duration-500" style={{ width: `${Math.max(2, s.percent)}%`, backgroundColor: s.color }} /></div>
                    <span className="text-xs font-medium w-16 text-right">{s.qty} ({s.percent}%)</span>
                  </div>
                ))}
              </div>
              {supplierConcentration[0]?.percent > 50 && (
                <div className="p-3 rounded-lg bg-orange-500/10 border border-orange-500/20 max-w-[200px]">
                  <div className="flex items-center gap-1.5 mb-1"><AlertTriangle className="h-3.5 w-3.5 text-orange-500" /><span className="text-xs font-semibold text-orange-600">High Concentration</span></div>
                  <p className="text-[10px] text-muted-foreground">{supplierConcentration[0].percent}% of orders depend on {supplierConcentration[0].name}.</p>
                </div>
              )}
            </div>
          </CardContent></Card>
        )}

        {/* Suggested Restock */}
        {suggestedRows.length > 0 && (
          <Collapsible open={suggestedOpen} onOpenChange={setSuggestedOpen}>
            <Card className="border-dashed border-primary/30 bg-primary/5">
              <CollapsibleTrigger asChild>
                <button className="w-full flex items-center justify-between p-3 hover:bg-primary/10 transition-colors rounded-t-lg">
                  <div className="flex items-center gap-2"><TrendingUp className="h-4 w-4 text-primary" /><span className="font-semibold text-sm text-foreground">Suggested Restock</span><Badge variant="secondary" className="text-xs">{suggestedRows.length}</Badge><span className="text-xs text-muted-foreground hidden sm:inline">Items frequently ordered (avg monthly qty)</span></div>
                  {suggestedOpen ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                </button>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <CardContent className="p-0"><div className="overflow-hidden"><Table className="w-full table-fixed"><TableHeader><TableRow>
                  <TableHead>SKU</TableHead><TableHead>Item Name</TableHead><TableHead className="text-right">Avg Qty/mo</TableHead><TableHead className="text-right">Months</TableHead><TableHead className="text-right">Orders</TableHead><TableHead>Last Ordered</TableHead>
                </TableRow></TableHeader><TableBody>
                  {suggestedRows.map(row => (
                    <TableRow key={row.sku} className="bg-primary/5">
                      <TableCell className="font-mono text-xs text-muted-foreground">{row.sku}</TableCell>
                      <TableCell className="font-medium max-w-[200px] truncate">{row.itemName}</TableCell>
                      <TableCell className="text-right"><Badge variant="outline" className="font-bold">{row.avgMonthlyQty}</Badge></TableCell>
                      <TableCell className="text-right text-sm">{row.monthsAppeared}/3</TableCell>
                      <TableCell className="text-right text-sm text-muted-foreground">{row.totalOrders}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{row.lastOrderedDate ? new Date(row.lastOrderedDate).toLocaleDateString() : "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody></Table></div></CardContent>
              </CollapsibleContent>
            </Card>
          </Collapsible>
        )}

        {/* Batch Actions Bar */}
        {selectedSkus.size > 0 && viewMode === "table" && (
          <div className="sticky bottom-0 z-20 bg-background/95 backdrop-blur-sm border-t border-border -mx-1 px-1 pt-2 pb-1">
            <div className="flex items-center gap-2 p-2.5 rounded-lg bg-primary/10 border border-primary/20 flex-wrap">
              <div className="flex items-center gap-3 flex-wrap">
                <span className="text-sm font-semibold text-foreground">{selectionTotals.count} selected</span>
                <span className="text-xs text-muted-foreground">Qty <strong className="text-foreground">{selectionTotals.qty.toLocaleString()}</strong></span>
                {selectionTotals.cost > 0 && <span className="text-xs text-muted-foreground">Est. <strong className="text-foreground">R{selectionTotals.cost.toLocaleString()}</strong></span>}
                <span className="text-xs text-muted-foreground">{selectionTotals.suppliers} supplier{selectionTotals.suppliers !== 1 ? "s" : ""}</span>
                {selectionTotals.urgent > 0 && <Badge variant="destructive" className="text-[10px] h-4 gap-0.5"><Flame className="h-2.5 w-2.5" />{selectionTotals.urgent} urgent</Badge>}
              </div>
              <div className="flex items-center gap-1.5 ml-auto flex-wrap">
                <Tooltip><TooltipTrigger asChild>
                  <Button variant="outline" size="sm" onClick={fillRecommendedForSelected} className="h-7 text-xs gap-1"><Sparkles className="h-3 w-3" />Fill Recommended</Button>
                </TooltipTrigger><TooltipContent><p className="text-xs">Set order qty to the recommended value (incl. safety stock) for all selected items</p></TooltipContent></Tooltip>
                <Button variant="outline" size="sm" onClick={handleExportCSV} className="h-7 text-xs gap-1"><Download className="h-3 w-3" />Export</Button>
                <Button variant="outline" size="sm" onClick={handleCopySelectedPOLines} className="h-7 text-xs gap-1"><ClipboardCopy className="h-3 w-3" />PO Lines</Button>
                <Button variant="outline" size="sm" onClick={handleCopySupplierEmails} className="h-7 text-xs gap-1"><Mail className="h-3 w-3" />Emails</Button>
                <Button variant="outline" size="sm" onClick={handlePrint} className="h-7 text-xs gap-1"><Printer className="h-3 w-3" />Print</Button>
                <Button size="sm" onClick={() => handleBulkMarkOrdered()} disabled={bulkOrdering} className="h-7 text-xs gap-1">
                  {bulkOrdering ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckSquare className="h-3 w-3" />}Mark Ordered
                </Button>
                <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setSelectedSkus(new Set())}>Clear</Button>
              </div>
            </div>
          </div>
        )}


        {/* View Mode Content */}
        {viewMode === "table" && (
          <>
            {/* Table toolbar */}
            <div className="procurement-table-toolbar flex flex-col xl:flex-row xl:items-center xl:justify-between gap-2 rounded-2xl border border-border/60 bg-card/70 p-2.5">
              <div className="flex items-center gap-2 flex-wrap">
                <Button variant={groupBySupplier ? "default" : "outline"} size="sm" onClick={() => setGroupBySupplier(!groupBySupplier)} className="h-7 text-xs gap-1.5"><Layers className="h-3 w-3" />{groupBySupplier ? "Grouped" : "Group"}</Button>
                <Button variant={showSupplierChart ? "default" : "outline"} size="sm" onClick={() => setShowSupplierChart(!showSupplierChart)} className="h-7 text-xs gap-1.5"><PieChart className="h-3 w-3" />Chart</Button>
                <Button variant="outline" size="sm" onClick={handleCopySupplierEmails} className="h-7 text-xs gap-1.5"><Mail className="h-3 w-3" />Emails</Button>
                <Button variant="outline" size="sm" onClick={handleBatchEmailAllSuppliers} className="h-7 text-xs gap-1.5"><Send className="h-3 w-3" />All Drafts</Button>
                <Button variant="outline" size="sm" onClick={selectAllNeedingOrder} className="h-7 text-xs gap-1.5"><CheckSquare className="h-3 w-3" />Select Needing Order</Button>
                {coverageGaps.length > 0 && (
                  <Tooltip><TooltipTrigger asChild>
                    <Badge variant="destructive" className="text-xs gap-1 cursor-help"><AlertTriangle className="h-3 w-3" />{coverageGaps.length} no supplier</Badge>
                  </TooltipTrigger><TooltipContent><p className="text-xs">{coverageGaps.length} items need ordering but have no supplier assigned:<br/>{coverageGaps.slice(0, 5).map(r => r.sku).join(", ")}{coverageGaps.length > 5 ? "..." : ""}</p></TooltipContent></Tooltip>
                )}
                {totalSafetyBuffer > 0 && (
                  <Tooltip><TooltipTrigger asChild>
                    <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded cursor-help">+{totalSafetyBuffer} safety</span>
                  </TooltipTrigger><TooltipContent><p className="text-xs">Recommended: {totalRecommendedQty} total (incl. {totalSafetyBuffer} safety stock buffer)</p></TooltipContent></Tooltip>
                )}
              </div>
              <div className="hidden 2xl:flex items-center gap-2 text-[10px] text-muted-foreground/50">
                <span><kbd className="px-1 py-0.5 rounded bg-muted text-[10px]">Ctrl+F</kbd> Search</span>
                <span><kbd className="px-1 py-0.5 rounded bg-muted text-[10px]">G</kbd> Group</span>
                <span><kbd className="px-1 py-0.5 rounded bg-muted text-[10px]">P</kbd> Density</span>
                {pinnedSkus.length > 0 && <span className="flex items-center gap-0.5"><Pin className="h-2.5 w-2.5" />{pinnedSkus.length} pinned</span>}
                <span>Click row to expand</span>
                <span><kbd className="px-1 py-0.5 rounded bg-muted text-[10px]">Shift+Click</kbd> Range select</span>
              </div>
            </div>

            <Card className="procurement-data-card overflow-hidden rounded-[22px] border-border/60 shadow-sm">
              <CardContent className="p-0 min-w-0">
                <div className="procurement-table-scroll min-w-0 max-w-full overflow-x-auto">
                  <Table className="procurement-data-table table-fixed">
                    <colgroup>
                      {[44, 104, 105, 215, 78, 78, 96, 126, 90, 92, 68, 82, 180, 78, 54].map((width, index) => <col key={index} style={{ width }} />)}
                    </colgroup>
                    <TableHeader className="sticky top-0 z-10 bg-card/95 backdrop-blur-md">
                      <TableRow>
                        <TableHead><Checkbox checked={selectedSkus.size === sortedRows.length && sortedRows.length > 0} onCheckedChange={toggleSelectAll} /></TableHead>
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
                        <TableHead className="text-center"><StickyNote className="mx-auto h-3 w-3 text-muted-foreground" /></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {sortedRows.length === 0 ? (
                        <TableRow><TableCell colSpan={15} className="text-center py-8 text-muted-foreground">{showOnlyPOMismatches ? "No PO quantity differences match these filters." : showOnlyNeedOrder ? "All items are covered by stock and POs! 🎉" : "No items found"}</TableCell></TableRow>
                      ) : groupedRows ? (
                        groupedRows.map(([supplier, items]) => {
                          const isCollapsed = collapsedSuppliers.has(supplier);
                          const supTotalQty = items.reduce((s, r) => s + r.toOrder, 0);
                          const supTotalRec = items.reduce((s, r) => s + r.recommendedOrderQty, 0);
                          const supTotalCost = items.reduce((s, r) => s + (r.estimatedCost || 0), 0);
                          const supUrgent = items.filter(r => r.hasUrgent).length;
                          const allSelected = items.every(r => selectedSkus.has(r.rowKey));
                          const someSelected = items.some(r => selectedSkus.has(r.rowKey));
                          return (
                            <Fragment key={`group-${supplier}`}>
                              <TableRow className="bg-muted/50 hover:bg-muted/70 border-t-2 border-border/60">
                                <TableCell colSpan={15}>
                                  <div className="flex items-center justify-between gap-2 flex-wrap">
                                    <div className="flex items-center gap-2">
                                      <span onClick={(e) => { e.stopPropagation(); setSelectedSkus(prev => { const next = new Set(prev); if (allSelected) items.forEach(r => next.delete(r.sku)); else items.forEach(r => next.add(r.sku)); return next; }); }} className="inline-flex">
                                        <Checkbox checked={allSelected} data-state={someSelected && !allSelected ? "indeterminate" : allSelected ? "checked" : "unchecked"} />
                                      </span>
                                      <button onClick={() => toggleSupplierCollapse(supplier)} className="p-0.5 rounded hover:bg-background/60">
                                        {isCollapsed ? <ChevronRight className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                                      </button>
                                      <Users className="h-4 w-4 text-primary" />
                                      <span className="font-semibold text-foreground">{supplier}</span>
                                      <Badge variant="secondary" className="text-xs">{items.length} SKU{items.length !== 1 ? "s" : ""}</Badge>
                                      {supUrgent > 0 && <Badge variant="destructive" className="text-[10px] h-4 gap-0.5"><Flame className="h-2.5 w-2.5" />{supUrgent}</Badge>}
                                      {items[0]?.supplierEmail && <span className="text-xs text-muted-foreground hidden md:inline">({items[0].supplierEmail})</span>}
                                    </div>
                                    <div className="flex items-center gap-3 text-xs">
                                      <span className="text-muted-foreground">Order: <strong className="text-primary">{supTotalQty.toLocaleString()}</strong></span>
                                      {supTotalRec !== supTotalQty && <span className="text-muted-foreground">Rec: <strong className="text-foreground">{supTotalRec.toLocaleString()}</strong></span>}
                                      {supTotalCost > 0 && <span className="text-muted-foreground">Est: <strong className="text-foreground">R{supTotalCost.toLocaleString()}</strong></span>}
                                      <Button variant="ghost" size="sm" className="h-6 text-xs gap-1" onClick={() => generateEmailDraft(supplier)}><Send className="h-3 w-3" />Email</Button>
                                    </div>
                                  </div>
                                </TableCell>
                              </TableRow>
                              {!isCollapsed && items.map(renderRow)}
                            </Fragment>
                          );
                        })
                      ) : sortedRows.map(renderRow)}

                      {/* Stats Footer Row */}
                      {sortedRows.length > 0 && (
                        <TableRow className="bg-muted/60 font-semibold border-t-2 border-border">
                          <TableCell colSpan={4} className="text-xs text-muted-foreground uppercase">Totals ({sortedRows.length} SKUs)</TableCell>
                          <TableCell className="text-right font-bold">{totals.needed.toLocaleString()}</TableCell>
                          <TableCell className="text-right font-bold">{totals.inStock.toLocaleString()}</TableCell>
                          <TableCell className="text-right font-bold">{totals.onPO.toLocaleString()}</TableCell>
                          <TableCell><CoverageBar percent={totals.needed > 0 ? Math.min(100, Math.round(((totals.inStock + totals.onPO) / totals.needed) * 100)) : 100} /></TableCell>
                          <TableCell className="text-right"><Badge variant="destructive" className="font-bold">{totals.toOrder.toLocaleString()}</Badge></TableCell>
                          <TableCell className="text-center"><span className="text-xs">{totals.stockoutRisk} at risk</span></TableCell>
                          <TableCell />
                          <TableCell className="text-center"><span className="text-xs">{avgDaysWaiting}d avg</span></TableCell>
                          <TableCell colSpan={3} />
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </>
        )}

        {viewMode === "suppliers" && (
          <SupplierCardsView
            rows={sortedRows}
            notes={notes}
            onGenerateEmail={generateEmailDraft}
            onCopyEmail={email => { navigator.clipboard.writeText(email); toast({ title: "Copied", description: `${email} copied` }); }}
          />
        )}

        {viewMode === "quick" && (
          <QuickOrderView
            rows={sortedRows}
            onBulkMarkOrdered={handleBulkMarkOrdered}
            onGenerateEmail={generateEmailDraft}
          />
        )}

        {/* Email Draft Dialog */}
        <Dialog open={emailDraftOpen} onOpenChange={setEmailDraftOpen}>
          <DialogContent className="max-w-lg">
            <DialogHeader><DialogTitle className="flex items-center gap-2"><Send className="h-4 w-4 text-primary" />Email Draft — {emailDraftSupplier}</DialogTitle></DialogHeader>
            <div className="space-y-2">
              {(() => {
                const s = sortedRows.find(r => r.supplierName === emailDraftSupplier && r.supplierEmail);
                return (
                  <div className="flex items-center gap-2 text-xs">
                    <span className="text-muted-foreground w-14 shrink-0">To:</span>
                    <Input readOnly value={s?.supplierEmail || "(no email on file)"} className="h-8 text-xs" />
                  </div>
                );
              })()}
              <div className="flex items-center gap-2 text-xs">
                <span className="text-muted-foreground w-14 shrink-0">Subject:</span>
                <Input value={emailDraftSubject} onChange={e => setEmailDraftSubject(e.target.value)} className="h-8 text-xs" />
              </div>
              <Textarea value={emailDraftBody} onChange={e => setEmailDraftBody(e.target.value)} className="min-h-[250px] font-mono text-sm" />
            </div>
            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => { navigator.clipboard.writeText(`Subject: ${emailDraftSubject}\n\n${emailDraftBody}`); toast({ title: "Copied", description: "Email draft copied" }); }}><Copy className="h-4 w-4 mr-2" />Copy</Button>
              <Button onClick={() => {
                const s = sortedRows.find(r => r.supplierName === emailDraftSupplier && r.supplierEmail);
                window.open(`mailto:${s?.supplierEmail || ""}?subject=${encodeURIComponent(emailDraftSubject || `Purchase Order — ${emailDraftSupplier}`)}&body=${encodeURIComponent(emailDraftBody)}`, "_blank");
              }}><Mail className="h-4 w-4 mr-2" />Open in Email</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

      </div>
    </TooltipProvider>
  );
}
