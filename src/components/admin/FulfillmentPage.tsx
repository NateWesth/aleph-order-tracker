import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { useLiveData } from "@/hooks/useLiveData";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import EntityComments from "@/components/admin/EntityComments";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { queueOfflineOperation } from "@/services/offlineOperations";
import {
  ArrowRight,
  Archive,
  Boxes,
  CalendarClock,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  CircleAlert,
  ClipboardCheck,
  Clock3,
  FileCheck2,
  History,
  ListFilter,
  MapPinned,
  MapPin,
  Navigation,
  PackageCheck,
  Printer,
  RefreshCw,
  Route,
  Search,
  SlidersHorizontal,
  Sparkles,
  Timer,
  Truck,
  UserCheck,
  UserRound,
  Users,
  Warehouse,
  WandSparkles,
  WifiOff,
  X,
} from "lucide-react";

interface FulfillmentItem {
  id: string;
  name: string;
  code: string | null;
  quantity: number;
  qty_invoiced: number | null;
  qty_completed: number | null;
}

interface FulfillmentOrder {
  id: string;
  order_number: string;
  reference: string | null;
  urgency: string | null;
  company_id: string | null;
  created_at: string | null;
  completed_date?: string | null;
  fulfillment_method: "delivery" | "collection";
  fulfillment_status: "pending" | "scheduled" | "out-for-delivery" | "ready-for-collection" | "completed";
  fulfillment_assigned_to: string | null;
  fulfillment_scheduled_for: string | null;
  fulfillment_notes: string | null;
  fulfillment_routed_at: string | null;
  companyName: string;
  companyAddress: string | null;
  items: FulfillmentItem[];
}

interface FulfillmentTimelineEvent {
  id: string;
  entity_type: string;
  entity_id: string;
  event_type: string;
  title: string;
  description: string | null;
  actor_id: string | null;
  occurred_at: string;
}

interface TeamMember {
  id: string;
  full_name: string | null;
  email: string | null;
  position: string | null;
}

interface FulfillmentSettings {
  auto_assign_enabled: boolean;
  default_method: "delivery" | "collection";
}

interface POLine {
  sku: string;
  name: string;
  description: string;
  quantity: number;
  quantityReceived: number;
  quantityBilled: number;
  outstanding: number;
  rate: number;
}

interface ZohoPO {
  purchaseOrderId: string;
  purchaseOrderNumber: string;
  vendorId: string;
  vendorName: string;
  vendorEmail: string;
  date: string;
  expectedDeliveryDate: string | null;
  status: string;
  receivedStatus: string;
  billedStatus: string;
  total: number;
  outstandingValue: number;
  lines: POLine[];
}

interface POCollectionState {
  purchase_order_id: string;
  purchase_order_number: string;
  vendor_id: string | null;
  vendor_name: string;
  assigned_to: string | null;
  status: "pending" | "scheduled" | "collecting" | "collected";
  collection_method: "pickup" | "supplier-delivery";
  is_urgent: boolean;
  scheduled_for: string | null;
  notes: string | null;
  completed_at: string | null;
  last_seen_at: string;
}

interface CollectionEvent {
  id: string;
  purchase_order_id: string;
  purchase_order_number: string;
  vendor_id: string | null;
  vendor_name: string;
  collected_by: string;
  collected_at: string;
  total_units: number;
  fully_collected: boolean;
  notes: string | null;
}

interface CollectionEventLine {
  event_id: string;
  line_key: string;
  sku: string | null;
  name: string;
  description: string | null;
  quantity_collected: number;
  source_unbilled_quantity: number;
}

interface CollectionLineView extends POLine {
  key: string;
  collected: number;
  remaining: number;
}

interface CollectionPOView extends ZohoPO {
  state: POCollectionState | null;
  linesView: CollectionLineView[];
  remainingUnits: number;
  collectedUnits: number;
}

interface DispatchArea {
  id: string;
  name: string;
  sort_order: number;
}

interface DispatchAreaLink {
  id: string;
  source_type: "company" | "vendor";
  source_id: string;
  area_id: string;
  address_override: string | null;
}

interface DispatchPlanningStop {
  key: string;
  type: "delivery" | "collection";
  entityId: string;
  sourceType: "company" | "vendor";
  sourceId: string;
  reference: string;
  label: string;
  address: string | null;
  urgency: string | null;
  scheduledFor: string | null;
  assigneeId: string | null;
  areaId: string | null;
  areaName: string | null;
  areaSortOrder: number;
}

const PO_CACHE_ID = "00000000-0000-0000-0000-000000000003";
const FULFILLMENT_WINDOW_DAYS = 14;
const FULFILLMENT_WINDOW_MS = FULFILLMENT_WINDOW_DAYS * 86_400_000;

const isInFulfillmentWindow = (value: string | null | undefined) => {
  if (!value) return false;
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return false;
  const now = Date.now();
  return timestamp >= now - FULFILLMENT_WINDOW_MS && timestamp <= now + FULFILLMENT_WINDOW_MS;
};

const poOperationalDate = (po: Pick<ZohoPO, "expectedDeliveryDate" | "date">) =>
  po.expectedDeliveryDate || po.date;

const readyUnits = (item: FulfillmentItem) =>
  Math.max(
    0,
    Math.min(item.qty_invoiced ?? 0, item.quantity) - Math.min(item.qty_completed ?? 0, item.quantity),
  );

const poLineKey = (line: Pick<POLine, "sku" | "name" | "description">) => {
  const sku = String(line.sku || "").trim().toLowerCase();
  if (sku) return `sku:${sku}`;
  return `nm:${String(line.name || "").trim().toLowerCase()}|${String(line.description || "").trim().toLowerCase()}`;
};

const formatWhen = (value: string | null | undefined) => {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("en-ZA", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
};

const formatMoneySafe = (value: number | null | undefined) => new Intl.NumberFormat("en-ZA", {
  style: "currency",
  currency: "ZAR",
  maximumFractionDigits: 0,
}).format(Number(value || 0));

const toLocalDateTimeInput = (value: string | null | undefined) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
};

const isToday = (value: string | null | undefined) => {
  if (!value) return false;
  const date = new Date(value);
  const today = new Date();
  return date.getFullYear() === today.getFullYear() && date.getMonth() === today.getMonth() && date.getDate() === today.getDate();
};

const isOverdue = (value: string | null | undefined) => Boolean(value && new Date(value).getTime() < Date.now() && !isToday(value));

const ageInDays = (value: string | null | undefined) => value ? Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 86_400_000)) : 0;

type FocusFilter = "all" | "mine" | "today" | "late";

export default function FulfillmentPage() {
  const { toast } = useToast();
  const { user } = useAuth();

  const [deliveryOrders, setDeliveryOrders] = useState<FulfillmentOrder[]>([]);
  const [deliveryHistory, setDeliveryHistory] = useState<FulfillmentOrder[]>([]);
  const [purchaseOrders, setPurchaseOrders] = useState<ZohoPO[]>([]);
  const [collectionStates, setCollectionStates] = useState<POCollectionState[]>([]);
  const [collectionEvents, setCollectionEvents] = useState<CollectionEvent[]>([]);
  const [collectionEventLines, setCollectionEventLines] = useState<CollectionEventLine[]>([]);
  const [timelineEvents, setTimelineEvents] = useState<FulfillmentTimelineEvent[]>([]);
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [settings, setSettings] = useState<FulfillmentSettings>({ auto_assign_enabled: false, default_method: "delivery" });

  const [activeMode, setActiveMode] = useState<"delivery" | "collection" | "history">("delivery");
  const [historyMode, setHistoryMode] = useState<"delivery" | "collection">("collection");
  const [query, setQuery] = useState("");
  const [focusFilter, setFocusFilter] = useState<FocusFilter>("all");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [collectingId, setCollectingId] = useState<string | null>(null);
  const [collectionDraft, setCollectionDraft] = useState<Record<string, Record<string, number>>>({});
  const [collectionNotes, setCollectionNotes] = useState<Record<string, string>>({});
  const [selectedDeliveryId, setSelectedDeliveryId] = useState<string | null>(null);
  const [selectedCollectionId, setSelectedCollectionId] = useState<string | null>(null);
  const [confirmDeliveryId, setConfirmDeliveryId] = useState<string | null>(null);
  const [deliverySelection, setDeliverySelection] = useState<Set<string>>(new Set());
  const [collectionSelection, setCollectionSelection] = useState<Set<string>>(new Set());
  const [dispatchAreas, setDispatchAreas] = useState<DispatchArea[]>([]);
  const [dispatchAreaLinks, setDispatchAreaLinks] = useState<DispatchAreaLink[]>([]);
  const [newAreaName, setNewAreaName] = useState("");
  const [areaSavingKey, setAreaSavingKey] = useState<string | null>(null);
  const [bulkAssignee, setBulkAssignee] = useState("keep");
  const [bulkSchedule, setBulkSchedule] = useState("");
  const [bulkSaving, setBulkSaving] = useState(false);
  const [completingDeliveryId, setCompletingDeliveryId] = useState<string | null>(null);
  const [routePlannerOpen, setRoutePlannerOpen] = useState(false);
  const [routeName, setRouteName] = useState("");
  const [routeDate, setRouteDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [routeSaving, setRouteSaving] = useState(false);
  const autoAssignLock = useRef(false);
  const loadedRef = useRef(false);

  const memberName = useCallback(
    (id: string | null | undefined) => {
      if (!id) return "Unassigned";
      const member = team.find((candidate) => candidate.id === id);
      return member?.full_name || member?.email || "Team member";
    },
    [team],
  );

  const fetchData = useCallback(async () => {
    if (!loadedRef.current) setLoading(true);
    try {
      const historyCutoff = new Date(Date.now() - FULFILLMENT_WINDOW_MS).toISOString();
      const [ordersRes, deliveryHistoryRes, profilesRes, settingsRes, cacheRes, statesRes, eventsRes, areaRes, areaLinksRes, timelineRes] = await Promise.all([
        supabase
          .from("orders")
          .select("id, order_number, reference, urgency, company_id, created_at, fulfillment_method, fulfillment_status, fulfillment_assigned_to, fulfillment_scheduled_for, fulfillment_notes, fulfillment_routed_at")
          .or("status.is.null,status.neq.delivered")
          .order("created_at", { ascending: true }),
        supabase
          .from("orders")
          .select("id, order_number, reference, urgency, company_id, created_at, completed_date, fulfillment_method, fulfillment_status, fulfillment_assigned_to, fulfillment_scheduled_for, fulfillment_notes, fulfillment_routed_at")
          .eq("fulfillment_method", "delivery")
          .eq("fulfillment_status", "completed")
          .gte("completed_date", historyCutoff)
          .order("completed_date", { ascending: false })
          .limit(100),
        supabase.from("profiles").select("id, full_name, email, position").eq("approved", true).order("full_name"),
        supabase.from("fulfillment_settings").select("auto_assign_enabled, default_method").eq("id", true).maybeSingle(),
        supabase.from("po_tracking_cache").select("payload, fetched_at").eq("id", PO_CACHE_ID).maybeSingle(),
        supabase.from("po_collection_state").select("purchase_order_id, purchase_order_number, vendor_id, vendor_name, assigned_to, status, collection_method, is_urgent, scheduled_for, notes, completed_at, last_seen_at"),
        supabase
          .from("po_collection_events")
          .select("id, purchase_order_id, purchase_order_number, vendor_id, vendor_name, collected_by, collected_at, total_units, fully_collected, notes")
          .gte("collected_at", historyCutoff)
          .order("collected_at", { ascending: false })
          .limit(250),
        supabase.from("dispatch_areas").select("id,name,sort_order").order("sort_order").order("name"),
        supabase.from("dispatch_area_links").select("id,source_type,source_id,area_id,address_override"),
        supabase
          .from("fulfillment_timeline_events")
          .select("id, entity_type, entity_id, event_type, title, description, actor_id, occurred_at")
          .gte("occurred_at", historyCutoff)
          .order("occurred_at", { ascending: false })
          .limit(500),
      ]);

      if (ordersRes.error) throw ordersRes.error;
      if (deliveryHistoryRes.error) throw deliveryHistoryRes.error;
      if (profilesRes.error) throw profilesRes.error;
      if (cacheRes.error) throw cacheRes.error;
      if (statesRes.error) throw statesRes.error;
      if (eventsRes.error) throw eventsRes.error;
      if (areaRes.error) throw areaRes.error;
      if (areaLinksRes.error) throw areaLinksRes.error;
      if (timelineRes.error) throw timelineRes.error;

      const activeBase = (ordersRes.data || []).filter((order) =>
        isInFulfillmentWindow(order.fulfillment_scheduled_for || order.fulfillment_routed_at || order.created_at)
      );
      const historicBase = deliveryHistoryRes.data || [];
      const allOrderRows = [...activeBase, ...historicBase];
      const ids = [...new Set(allOrderRows.map((order) => order.id))];
      const companyIds = [...new Set(allOrderRows.map((order) => order.company_id).filter(Boolean))] as string[];

      const [itemsRes, companiesRes] = await Promise.all([
        ids.length
          ? supabase.from("order_items").select("id, order_id, name, code, quantity, qty_invoiced, qty_completed").in("order_id", ids)
          : Promise.resolve({ data: [], error: null } as any),
        companyIds.length
          ? supabase.from("companies").select("id, name, address").in("id", companyIds)
          : Promise.resolve({ data: [], error: null } as any),
      ]);
      if (itemsRes.error) throw itemsRes.error;
      if (companiesRes.error) throw companiesRes.error;

      const itemMap = new Map<string, FulfillmentItem[]>();
      (itemsRes.data || []).forEach((item: any) => {
        const existing = itemMap.get(item.order_id) || [];
        existing.push(item);
        itemMap.set(item.order_id, existing);
      });
      const companyMap = new Map<string, { name: string; address: string | null }>((companiesRes.data || []).map((company: any) => [company.id, { name: company.name, address: company.address || null }]));

      const decorateOrder = (order: any): FulfillmentOrder => ({
        ...order,
        fulfillment_method: (order.fulfillment_method || "delivery") as "delivery" | "collection",
        fulfillment_status: (order.fulfillment_status || "pending") as FulfillmentOrder["fulfillment_status"],
        companyName: order.company_id ? companyMap.get(order.company_id)?.name || "Unknown client" : "No client",
        companyAddress: order.company_id ? companyMap.get(order.company_id)?.address || null : null,
        items: itemMap.get(order.id) || [],
      });

      const readyDeliveries = activeBase
        .map(decorateOrder)
        .filter((order) =>
          order.fulfillment_method === "delivery"
          && order.items.some((item) => readyUnits(item) > 0)
          && order.fulfillment_status !== "completed"
          && isInFulfillmentWindow(order.fulfillment_scheduled_for || order.fulfillment_routed_at || order.created_at)
        )
        .sort((a, b) => Number(b.urgency === "urgent") - Number(a.urgency === "urgent"));

      const historyDeliveries = historicBase.map(decorateOrder);
      const poPayload = Array.isArray(cacheRes.data?.payload) ? (cacheRes.data?.payload as unknown as ZohoPO[]) : [];
      const focusedPOPayload = poPayload.filter((po) => isInFulfillmentWindow(poOperationalDate(po)));
      // The archive is intentionally capped, but active PO calculations must
      // include every older partial pickup for those current purchase orders.
      const activePOIds = focusedPOPayload.map((po) => po.purchaseOrderId).filter(Boolean);
      const activeEventsRes = activePOIds.length
        ? await supabase
            .from("po_collection_events")
            .select("id, purchase_order_id, purchase_order_number, vendor_id, vendor_name, collected_by, collected_at, total_units, fully_collected, notes")
            .in("purchase_order_id", activePOIds)
        : ({ data: [], error: null } as any);
      if (activeEventsRes.error) throw activeEventsRes.error;
      const eventById = new Map<string, CollectionEvent>();
      [...(eventsRes.data || []), ...(activeEventsRes.data || [])].forEach((event: any) => eventById.set(event.id, event as CollectionEvent));
      const eventRows = [...eventById.values()].sort((a, b) => b.collected_at.localeCompare(a.collected_at));
      const eventIds = eventRows.map((event) => event.id);
      const linesRes = eventIds.length
        ? await supabase
            .from("po_collection_event_lines")
            .select("event_id, line_key, sku, name, description, quantity_collected, source_unbilled_quantity")
            .in("event_id", eventIds)
        : ({ data: [], error: null } as any);
      if (linesRes.error) throw linesRes.error;

      setDeliveryOrders(readyDeliveries);
      setDeliveryHistory(historyDeliveries);
      setPurchaseOrders(focusedPOPayload);
      setCollectionStates((statesRes.data || []) as POCollectionState[]);
      setCollectionEvents(eventRows);
      setCollectionEventLines((linesRes.data || []) as CollectionEventLine[]);
      setTimelineEvents((timelineRes.data || []) as FulfillmentTimelineEvent[]);
      setTeam((profilesRes.data || []) as TeamMember[]);
      setDispatchAreas((areaRes.data || []) as DispatchArea[]);
      setDispatchAreaLinks((areaLinksRes.data || []) as DispatchAreaLink[]);
      if (settingsRes.data) setSettings(settingsRes.data as FulfillmentSettings);

      // Ensure every current unbilled PO has a persistent assignment/state row.
      const knownIds = new Set((statesRes.data || []).map((row: any) => row.purchase_order_id));
      const missing = focusedPOPayload.filter((po) => !knownIds.has(po.purchaseOrderId));
      if (missing.length) {
        await supabase.from("po_collection_state").upsert(
          missing.map((po) => ({
            purchase_order_id: po.purchaseOrderId,
            purchase_order_number: po.purchaseOrderNumber,
            vendor_id: po.vendorId || null,
            vendor_name: po.vendorName || "Unknown supplier",
            status: "pending",
            last_seen_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })) as any,
          { onConflict: "purchase_order_id" },
        );
      }
    } catch (error: any) {
      console.error("Fulfillment load failed", error);
      toast({ title: "Could not load fulfillment", description: error.message || "Please try again.", variant: "destructive" });
    } finally {
      loadedRef.current = true;
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  useLiveData(["orders", "order_items", "po_tracking_cache", "po_collection_state", "po_collection_events", "po_collection_event_lines", "fulfillment_timeline_events", "dispatch_routes", "dispatch_areas", "dispatch_area_links"], fetchData, {
    debounceMs: 900,
    fallbackIntervalMs: 0,
    channelName: "fulfillment-workspace-v3-live",
  });

  const collectedByLine = useMemo(() => {
    const eventToPO = new Map(collectionEvents.map((event) => [event.id, event.purchase_order_id]));
    const totals = new Map<string, number>();
    collectionEventLines.forEach((line) => {
      const poId = eventToPO.get(line.event_id);
      if (!poId) return;
      const key = `${poId}::${line.line_key}`;
      totals.set(key, (totals.get(key) || 0) + Number(line.quantity_collected || 0));
    });
    return totals;
  }, [collectionEvents, collectionEventLines]);

  const sourceQuantityByLine = useMemo(() => {
    const eventToPO = new Map(collectionEvents.map((event) => [event.id, event.purchase_order_id]));
    const maximums = new Map<string, number>();
    collectionEventLines.forEach((line) => {
      const poId = eventToPO.get(line.event_id);
      if (!poId) return;
      const key = `${poId}::${line.line_key}`;
      maximums.set(key, Math.max(maximums.get(key) || 0, Number(line.source_unbilled_quantity || 0)));
    });
    return maximums;
  }, [collectionEvents, collectionEventLines]);

  const collectionQueue = useMemo<CollectionPOView[]>(() => {
    const stateMap = new Map(collectionStates.map((state) => [state.purchase_order_id, state]));
    return purchaseOrders
      .map((po) => {
        const linesView = (po.lines || []).map((line) => {
          const key = poLineKey(line);
          const collected = collectedByLine.get(`${po.purchaseOrderId}::${key}`) || 0;
          const currentUnbilled = Math.max(0, Number(line.outstanding || 0));
          // A later supplier bill reduces currentUnbilled. Subtracting the
          // collection event again would make the remaining quantity too low.
          // Retain the largest source snapshot and cap by Zoho's current value.
          const sourceQuantity = Math.max(currentUnbilled, sourceQuantityByLine.get(`${po.purchaseOrderId}::${key}`) || 0);
          const remaining = Math.min(currentUnbilled, Math.max(0, sourceQuantity - collected));
          return { ...line, key, collected, remaining };
        });
        const remainingUnits = linesView.reduce((sum, line) => sum + line.remaining, 0);
        const collectedUnits = linesView.reduce((sum, line) => sum + line.collected, 0);
        return { ...po, state: stateMap.get(po.purchaseOrderId) || null, linesView, remainingUnits, collectedUnits };
      })
      .filter((po) => po.remainingUnits > 0)
      .sort((a, b) => {
        const urgencyDifference = Number(Boolean(b.state?.is_urgent)) - Number(Boolean(a.state?.is_urgent));
        return urgencyDifference || (a.expectedDeliveryDate || a.date || "").localeCompare(b.expectedDeliveryDate || b.date || "");
      });
  }, [purchaseOrders, collectionStates, collectedByLine, sourceQuantityByLine]);

  const updateDelivery = async (orderId: string, patch: Record<string, unknown>) => {
    const previous = deliveryOrders;
    setDeliveryOrders((current) => current.map((order) => (order.id === orderId ? ({ ...order, ...patch } as FulfillmentOrder) : order)));
    if (!navigator.onLine) {
      queueOfflineOperation({ kind: "update-order", payload: { orderId, patch } });
      toast({ title: "Saved offline", description: "The delivery update will sync automatically when the connection returns." });
      return true;
    }
    const { error } = await supabase.from("orders").update(patch as any).eq("id", orderId);
    if (error) {
      setDeliveryOrders(previous);
      toast({ title: "Update failed", description: error.message, variant: "destructive" });
      return false;
    }
    return true;
  };

  const updateCollectionState = async (po: CollectionPOView, patch: Partial<POCollectionState>) => {
    const previous = collectionStates;
    const optimistic: POCollectionState = {
      purchase_order_id: po.purchaseOrderId,
      purchase_order_number: po.purchaseOrderNumber,
      vendor_id: po.vendorId || null,
      vendor_name: po.vendorName || "Unknown supplier",
      assigned_to: null,
      status: "pending",
      collection_method: "pickup",
      is_urgent: false,
      scheduled_for: null,
      notes: null,
      completed_at: null,
      last_seen_at: new Date().toISOString(),
      ...(po.state || {}),
      ...patch,
    };
    setCollectionStates((current) => [...current.filter((state) => state.purchase_order_id !== po.purchaseOrderId), optimistic]);
    const persistencePayload = {
      purchase_order_id: po.purchaseOrderId,
      purchase_order_number: po.purchaseOrderNumber,
      vendor_id: po.vendorId || null,
      vendor_name: po.vendorName || "Unknown supplier",
      ...patch,
      updated_at: new Date().toISOString(),
      last_seen_at: new Date().toISOString(),
    };
    if (!navigator.onLine) {
      queueOfflineOperation({ kind: "upsert-collection", payload: persistencePayload });
      toast({ title: "Saved offline", description: "The supplier movement update is queued safely on this device." });
      return true;
    }
    const { error } = await supabase.from("po_collection_state").upsert(
      persistencePayload as any,
      { onConflict: "purchase_order_id" },
    );
    if (error) {
      setCollectionStates(previous);
      toast({ title: "Collection update failed", description: error.message, variant: "destructive" });
      return false;
    }
    return true;
  };

  const saveSettings = async (patch: Partial<FulfillmentSettings>) => {
    const next = { ...settings, ...patch };
    setSettings(next);
    const { error } = await supabase
      .from("fulfillment_settings")
      .update({ ...patch, updated_at: new Date().toISOString(), updated_by: user?.id || null } as any)
      .eq("id", true);
    if (error) toast({ title: "Settings not saved", description: error.message, variant: "destructive" });
  };

  const autoAssignCollections = useCallback(async () => {
    if (autoAssignLock.current || team.length === 0 || collectionQueue.length === 0) return;
    const unassigned = collectionQueue.filter((po) => !po.state?.assigned_to);
    if (!unassigned.length) return;
    autoAssignLock.current = true;
    setAssigning(true);
    try {
      const load = new Map(team.map((member) => [member.id, collectionQueue.filter((po) => po.state?.assigned_to === member.id).length]));
      for (const po of unassigned) {
        const assignee = [...team].sort((a, b) => (load.get(a.id) || 0) - (load.get(b.id) || 0))[0];
        if (!assignee) break;
        const { error } = await supabase.from("po_collection_state").upsert(
          {
            purchase_order_id: po.purchaseOrderId,
            purchase_order_number: po.purchaseOrderNumber,
            vendor_id: po.vendorId || null,
            vendor_name: po.vendorName || "Unknown supplier",
            assigned_to: assignee.id,
            status: po.state?.status === "collected" ? "pending" : po.state?.status || "pending",
            last_seen_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          } as any,
          { onConflict: "purchase_order_id" },
        );
        if (!error) load.set(assignee.id, (load.get(assignee.id) || 0) + 1);
      }
      await fetchData();
      toast({ title: "Collections assigned", description: `${unassigned.length} PO${unassigned.length === 1 ? "" : "s"} balanced across the team.` });
    } finally {
      autoAssignLock.current = false;
      setAssigning(false);
    }
  }, [collectionQueue, fetchData, team, toast]);

  useEffect(() => {
    if (!loading && settings.auto_assign_enabled && collectionQueue.some((po) => !po.state?.assigned_to)) {
      void autoAssignCollections();
    }
  }, [loading, settings.auto_assign_enabled, collectionQueue, autoAssignCollections]);

  const completeDelivery = async (order: FulfillmentOrder) => {
    const readyItems = order.items.filter((item) => readyUnits(item) > 0);
    if (!readyItems.length) return;
    setCompletingDeliveryId(order.id);
    try {
      if (!navigator.onLine) {
        queueOfflineOperation({ kind: "complete-delivery", payload: { orderId: order.id } });
        setDeliveryOrders((current) => current.filter((candidate) => candidate.id !== order.id));
        setConfirmDeliveryId(null);
        setSelectedDeliveryId(null);
        toast({ title: "Handover saved offline", description: `${order.order_number} will complete automatically when this device reconnects.` });
        return;
      }
      const { data, error } = await supabase.rpc("complete_fulfillment_delivery", { p_order_id: order.id });
      if (error) throw error;
      const result = (data || {}) as { fully_done?: boolean };
      toast({
        title: "Delivery completed",
        description: result.fully_done ? `${order.order_number} moved to Delivery History.` : `Ready quantities completed. Remaining items stay active.`,
      });
      setConfirmDeliveryId(null);
      setSelectedDeliveryId(null);
      await fetchData();
    } catch (error: any) {
      toast({ title: "Could not complete delivery", description: error.message || "Please try again.", variant: "destructive" });
    } finally {
      setCompletingDeliveryId(null);
    }
  };

  const setDraftQty = (poId: string, key: string, value: number, max: number) => {
    const safe = Math.max(0, Math.min(Number.isFinite(value) ? value : 0, max));
    setCollectionDraft((current) => ({ ...current, [poId]: { ...(current[poId] || {}), [key]: safe } }));
  };

  const collectAllRemaining = (po: CollectionPOView) => {
    const next: Record<string, number> = {};
    po.linesView.filter((line) => line.remaining > 0).forEach((line) => {
      next[line.key] = line.remaining;
    });
    setCollectionDraft((current) => ({ ...current, [po.purchaseOrderId]: next }));
  };

  const markCollected = async (po: CollectionPOView) => {
    if (!user?.id) {
      toast({ title: "Sign in required", description: "The person collecting the PO must be signed in before marking it collected.", variant: "destructive" });
      return;
    }
    const draft = collectionDraft[po.purchaseOrderId] || {};
    const picked = po.linesView
      .map((line) => ({ line, qty: Math.max(0, Math.min(Number(draft[line.key] || 0), line.remaining)) }))
      .filter(({ qty }) => qty > 0);
    if (!picked.length) {
      toast({ title: "Enter collected quantities", description: "Enter what was actually collected, or use Collect all remaining." });
      return;
    }

    setCollectingId(po.purchaseOrderId);
    try {
      const totalUnits = picked.reduce((sum, row) => sum + row.qty, 0);
      const remainingAfter = po.remainingUnits - totalUnits;
      const fullyCollected = remainingAfter <= 0.000001;
      const notes = (collectionNotes[po.purchaseOrderId] || "").trim() || null;

      const collectionPayload = {
        p_collection_method: po.state?.collection_method || "pickup",
        p_purchase_order_id: po.purchaseOrderId,
        p_purchase_order_number: po.purchaseOrderNumber,
        p_vendor_id: po.vendorId || null,
        p_vendor_name: po.vendorName || "Unknown supplier",
        p_lines: picked.map(({ line, qty }) => ({
          line_key: line.key,
          sku: line.sku || null,
          name: line.name || line.description || "PO item",
          description: line.description || null,
          quantity_collected: qty,
          source_unbilled_quantity: Math.max(line.outstanding, line.collected + line.remaining),
        })),
        p_fully_collected: fullyCollected,
        p_notes: notes,
        p_source_snapshot: po as any,
      };
      if (!navigator.onLine) {
        queueOfflineOperation({ kind: "record-collection", payload: collectionPayload });
        setCollectionDraft((current) => ({ ...current, [po.purchaseOrderId]: {} }));
        setCollectionNotes((current) => ({ ...current, [po.purchaseOrderId]: "" }));
        if (fullyCollected) setPurchaseOrders((current) => current.filter((candidate) => candidate.purchaseOrderId !== po.purchaseOrderId));
        toast({ title: "Receipt saved offline", description: `${totalUnits} unit${totalUnits === 1 ? "" : "s"} will sync to the PO and linked orders when reconnected.` });
        return;
      }
      const { data, error } = await supabase.rpc("record_po_collection", collectionPayload);
      if (error) throw error;
      const result = (data || {}) as { order_units_synced?: number };

      setCollectionDraft((current) => ({ ...current, [po.purchaseOrderId]: {} }));
      setCollectionNotes((current) => ({ ...current, [po.purchaseOrderId]: "" }));
      toast({
        title: fullyCollected ? "PO fully collected" : "Partial collection saved",
        description: fullyCollected
          ? `${po.purchaseOrderNumber} moved to history and ${result.order_units_synced || 0} linked order units advanced to In Stock.`
          : `${totalUnits} unit${totalUnits === 1 ? "" : "s"} received; ${result.order_units_synced || 0} linked order units updated and ${remainingAfter} remain.`,
      });
      if (fullyCollected) setSelectedCollectionId(null);
      await fetchData();
    } catch (error: any) {
      toast({ title: "Could not save collection", description: error.message || "Please try again.", variant: "destructive" });
    } finally {
      setCollectingId(null);
    }
  };

  const refreshNow = async () => {
    setRefreshing(true);
    await fetchData();
    setRefreshing(false);
  };

  const toggleDeliverySelection = (orderId: string) => {
    setDeliverySelection((current) => {
      const next = new Set(current);
      if (next.has(orderId)) next.delete(orderId);
      else next.add(orderId);
      return next;
    });
  };

  const toggleCollectionSelection = (purchaseOrderId: string) => {
    setCollectionSelection((current) => {
      const next = new Set(current);
      if (next.has(purchaseOrderId)) next.delete(purchaseOrderId);
      else next.add(purchaseOrderId);
      return next;
    });
  };

  const areaLinkMap = useMemo(() => new Map(
    dispatchAreaLinks.map((link) => [`${link.source_type}::${link.source_id}`, link]),
  ), [dispatchAreaLinks]);

  const areaMap = useMemo(() => new Map(dispatchAreas.map((area) => [area.id, area])), [dispatchAreas]);

  const allDispatchStops = useMemo<DispatchPlanningStop[]>(() => {
    const deliveries = deliveryOrders.map((order) => {
      const sourceId = order.company_id || order.id;
      const link = areaLinkMap.get(`company::${sourceId}`);
      const area = link ? areaMap.get(link.area_id) : null;
      return {
        key: `delivery::${order.id}`,
        type: "delivery" as const,
        entityId: order.id,
        sourceType: "company" as const,
        sourceId,
        reference: order.order_number,
        label: order.companyName,
        address: link?.address_override || order.companyAddress || null,
        urgency: order.urgency,
        scheduledFor: order.fulfillment_scheduled_for,
        assigneeId: order.fulfillment_assigned_to,
        areaId: link?.area_id || null,
        areaName: area?.name || null,
        areaSortOrder: area?.sort_order ?? 9999,
      };
    });
    const collections = collectionQueue.map((po) => {
      const sourceId = po.vendorId || po.purchaseOrderId;
      const link = areaLinkMap.get(`vendor::${sourceId}`);
      const area = link ? areaMap.get(link.area_id) : null;
      const raw = po as any;
      const rawAddress = raw.vendorAddress || raw.vendor_address || raw.shippingAddress || raw.shipping_address || null;
      return {
        key: `collection::${po.purchaseOrderId}`,
        type: "collection" as const,
        entityId: po.purchaseOrderId,
        sourceType: "vendor" as const,
        sourceId,
        reference: po.purchaseOrderNumber,
        label: po.vendorName,
        address: link?.address_override || rawAddress || null,
        urgency: po.state?.is_urgent ? "urgent" : "normal",
        scheduledFor: po.state?.scheduled_for || po.expectedDeliveryDate || null,
        assigneeId: po.state?.assigned_to || null,
        areaId: link?.area_id || null,
        areaName: area?.name || null,
        areaSortOrder: area?.sort_order ?? 9999,
      };
    });
    return [...deliveries, ...collections];
  }, [deliveryOrders, collectionQueue, areaLinkMap, areaMap]);

  const selectedDispatchStops = useMemo(() => allDispatchStops.filter((stop) =>
    stop.type === "delivery" ? deliverySelection.has(stop.entityId) : collectionSelection.has(stop.entityId)
  ), [allDispatchStops, deliverySelection, collectionSelection]);

  const routePlanStops = useMemo(() => {
    const proximityKey = (address: string | null) => String(address || "zzzz")
      .toLowerCase()
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean)
      .slice(-3)
      .reverse()
      .join("|");
    // Stops are only grouped together when the user has explicitly put them in the
    // same dispatch area. Everything else keeps the order it was selected in, so a
    // one-off run can just be planned as-is without assigning any areas.
    const buckets: { key: string; stops: DispatchPlanningStop[] }[] = [];
    const bucketIndex = new Map<string, number>();
    selectedDispatchStops.forEach((stop, index) => {
      const key = stop.areaId ? `area::${stop.areaId}` : `solo::${stop.key}::${index}`;
      const existing = bucketIndex.get(key);
      if (existing === undefined) {
        bucketIndex.set(key, buckets.length);
        buckets.push({ key, stops: [stop] });
      } else {
        buckets[existing].stops.push(stop);
      }
    });
    return buckets.flatMap((bucket) => {
      if (bucket.stops.length < 2) return bucket.stops;
      return [...bucket.stops].sort((a, b) => {
        const proximity = proximityKey(a.address).localeCompare(proximityKey(b.address));
        if (proximity) return proximity;
        const urgency = Number(b.urgency === "urgent") - Number(a.urgency === "urgent");
        if (urgency) return urgency;
        return String(a.scheduledFor || "").localeCompare(String(b.scheduledFor || ""));
      });
    });
  }, [selectedDispatchStops]);


  const routeMapUrl = useMemo(() => {
    const addresses = routePlanStops.map((stop) => stop.address).filter(Boolean) as string[];
    if (!addresses.length) return null;
    if (addresses.length === 1) return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addresses[0])}`;
    const origin = encodeURIComponent(addresses[0]);
    const destination = encodeURIComponent(addresses[addresses.length - 1]);
    const waypoints = addresses.slice(1, -1).map(encodeURIComponent).join("%7C");
    return `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${destination}${waypoints ? `&waypoints=${waypoints}` : ""}&travelmode=driving`;
  }, [routePlanStops]);

  const createDispatchArea = async () => {
    const name = newAreaName.trim();
    if (!name) return;
    const { data, error } = await supabase.from("dispatch_areas").insert({ name, sort_order: dispatchAreas.length * 10 } as any).select("id,name,sort_order").single();
    if (error) {
      toast({ title: "Could not create area", description: error.message, variant: "destructive" });
      return;
    }
    setDispatchAreas((current) => [...current, data as DispatchArea].sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name)));
    setNewAreaName("");
    toast({ title: "Dispatch area created", description: `${name} can now be reused for future stops.` });
  };

  const saveStopAreaLink = async (stop: DispatchPlanningStop, areaId: string, addressOverride?: string | null) => {
    setAreaSavingKey(stop.key);
    const existing = areaLinkMap.get(`${stop.sourceType}::${stop.sourceId}`);
    const payload = {
      source_type: stop.sourceType,
      source_id: stop.sourceId,
      area_id: areaId,
      address_override: addressOverride === undefined ? existing?.address_override || null : (addressOverride?.trim() || null),
    };
    const { data, error } = await supabase.from("dispatch_area_links").upsert(payload as any, { onConflict: "source_type,source_id" }).select("id,source_type,source_id,area_id,address_override").single();
    setAreaSavingKey(null);
    if (error) {
      toast({ title: "Area link failed", description: error.message, variant: "destructive" });
      return;
    }
    const saved = data as DispatchAreaLink;
    setDispatchAreaLinks((current) => [...current.filter((link) => !(link.source_type === saved.source_type && link.source_id === saved.source_id)), saved]);
  };

  useEffect(() => {
    const openRequestedPlanner = () => {
      if (window.sessionStorage.getItem("aleph:open-dispatch-planner") === "1") {
        window.sessionStorage.removeItem("aleph:open-dispatch-planner");
        setRoutePlannerOpen(true);
      }
    };
    openRequestedPlanner();
    const handler = () => setRoutePlannerOpen(true);
    window.addEventListener("aleph:open-dispatch-planner", handler);
    return () => window.removeEventListener("aleph:open-dispatch-planner", handler);
  }, []);

  const saveOptimizedRoute = async () => {
    if (!routePlanStops.length || !user?.id) return;
    const unlinked = routePlanStops.filter((stop) => !stop.areaId);
    if (unlinked.length) {
      toast({ title: "Link every stop to an area first", description: `${unlinked.length} selected stop${unlinked.length === 1 ? " still needs" : "s still need"} an area. Once linked, future work for the same client or supplier is automatic.`, variant: "destructive" });
      return;
    }
    setRouteSaving(true);
    const scheduledAt = new Date(`${routeDate}T08:00:00`).toISOString();
    const driverId = bulkAssignee !== "keep" && bulkAssignee !== "unassigned"
      ? bulkAssignee
      : routePlanStops.every((stop) => stop.assigneeId === routePlanStops[0]?.assigneeId)
        ? routePlanStops[0]?.assigneeId || null
        : null;
    const deliveryStops = routePlanStops.filter((stop) => stop.type === "delivery");
    const collectionStops = routePlanStops.filter((stop) => stop.type === "collection");
    const routePayload = {
      name: routeName.trim() || `Dispatch run · ${new Date(`${routeDate}T12:00:00`).toLocaleDateString("en-ZA", { day: "2-digit", month: "short" })}`,
      route_date: routeDate,
      status: "ready",
      driver_id: driverId,
      total_stops: routePlanStops.length,
      completed_stops: 0,
      map_url: routeMapUrl,
      stops: routePlanStops.map((stop, index) => ({
        sequence: index + 1,
        stopType: stop.type,
        entityId: stop.entityId,
        reference: stop.reference,
        label: stop.label,
        address: stop.address,
        areaId: stop.areaId,
        areaName: stop.areaName,
        urgency: stop.urgency,
        completed: false,
      })),
      notes: `${deliveryStops.length} deliveries · ${collectionStops.length} collections`,
      created_by: user.id,
    };
    try {
      if (!navigator.onLine) {
        queueOfflineOperation({ kind: "create-route", payload: routePayload });
        deliveryStops.forEach((stop) => queueOfflineOperation({ kind: "update-order", payload: { orderId: stop.entityId, patch: { fulfillment_status: "scheduled", fulfillment_scheduled_for: scheduledAt, ...(driverId ? { fulfillment_assigned_to: driverId } : {}) } } }));
        collectionStops.forEach((stop) => {
          const po = collectionQueue.find((candidate) => candidate.purchaseOrderId === stop.entityId);
          if (!po) return;
          queueOfflineOperation({ kind: "upsert-collection", payload: {
            purchase_order_id: po.purchaseOrderId,
            purchase_order_number: po.purchaseOrderNumber,
            vendor_id: po.vendorId || null,
            vendor_name: po.vendorName || "Unknown supplier",
            status: "scheduled",
            scheduled_for: scheduledAt,
            ...(driverId ? { assigned_to: driverId } : {}),
          } });
        });
      } else {
        const { data: route, error } = await supabase.from("dispatch_routes").insert(routePayload as any).select("id").single();
        if (error) throw error;
        if (deliveryStops.length) {
          const orderPatch = { fulfillment_status: "scheduled", fulfillment_scheduled_for: scheduledAt, ...(driverId ? { fulfillment_assigned_to: driverId } : {}) };
          const { error: orderError } = await supabase.from("orders").update(orderPatch as any).in("id", deliveryStops.map((stop) => stop.entityId));
          if (orderError) throw orderError;
        }
        if (collectionStops.length) {
          const collectionPayloads = collectionStops.map((stop) => {
            const po = collectionQueue.find((candidate) => candidate.purchaseOrderId === stop.entityId)!;
            return {
              purchase_order_id: po.purchaseOrderId,
              purchase_order_number: po.purchaseOrderNumber,
              vendor_id: po.vendorId || null,
              vendor_name: po.vendorName || "Unknown supplier",
              assigned_to: driverId || po.state?.assigned_to || null,
              status: "scheduled",
              scheduled_for: scheduledAt,
              collection_method: po.state?.collection_method || "pickup",
              is_urgent: Boolean(po.state?.is_urgent),
              notes: po.state?.notes || null,
              last_seen_at: new Date().toISOString(),
            };
          });
          const { error: collectionError } = await supabase.from("po_collection_state").upsert(collectionPayloads as any, { onConflict: "purchase_order_id" });
          if (collectionError) throw collectionError;
        }
        await supabase.from("fulfillment_timeline_events").insert({ entity_type: "route", entity_id: route.id, event_type: "route_created", title: `Dispatch run created with ${routePlanStops.length} stops`, metadata: { routeName: routePayload.name, deliveries: deliveryStops.length, collections: collectionStops.length } } as any);
      }
      setDeliveryOrders((current) => current.map((order) => deliverySelection.has(order.id) ? ({ ...order, fulfillment_status: "scheduled", fulfillment_scheduled_for: scheduledAt, ...(driverId ? { fulfillment_assigned_to: driverId } : {}) } as FulfillmentOrder) : order));
      setCollectionStates((current) => current.map((state) => collectionSelection.has(state.purchase_order_id) ? ({ ...state, status: "scheduled", scheduled_for: scheduledAt, ...(driverId ? { assigned_to: driverId } : {}) } as POCollectionState) : state));
      toast({ title: navigator.onLine ? "Dispatch run saved" : "Dispatch run saved offline", description: `${deliveryStops.length} deliver${deliveryStops.length === 1 ? "y" : "ies"} and ${collectionStops.length} collection${collectionStops.length === 1 ? "" : "s"} grouped by learned area.` });
      setRoutePlannerOpen(false);
      setDeliverySelection(new Set());
      setCollectionSelection(new Set());
      setRouteName("");
    } catch (error: any) {
      toast({ title: "Route could not be saved", description: error.message || "Please try again.", variant: "destructive" });
    } finally {
      setRouteSaving(false);
    }
  };

  const applyBulkDeliveryPlan = async () => {
    const ids = [...deliverySelection];
    if (!ids.length || (bulkAssignee === "keep" && !bulkSchedule)) return;
    const patch: Record<string, unknown> = {};
    if (bulkAssignee !== "keep") patch.fulfillment_assigned_to = bulkAssignee === "unassigned" ? null : bulkAssignee;
    if (bulkSchedule) {
      patch.fulfillment_scheduled_for = new Date(bulkSchedule).toISOString();
      patch.fulfillment_status = "scheduled";
    }
    setBulkSaving(true);
    const previous = deliveryOrders;
    setDeliveryOrders((current) => current.map((order) => deliverySelection.has(order.id) ? ({ ...order, ...patch } as FulfillmentOrder) : order));
    if (!navigator.onLine) {
      ids.forEach((orderId) => queueOfflineOperation({ kind: "update-order", payload: { orderId, patch } }));
      setBulkSaving(false);
      toast({ title: "Route plan saved offline", description: `${ids.length} deliveries will sync when reconnected.` });
      setDeliverySelection(new Set());
      return;
    }
    const { error } = await supabase.from("orders").update(patch as any).in("id", ids);
    setBulkSaving(false);
    if (error) {
      setDeliveryOrders(previous);
      toast({ title: "Route plan was not saved", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Route plan applied", description: `${ids.length} deliver${ids.length === 1 ? "y" : "ies"} updated together.` });
    setDeliverySelection(new Set());
    setBulkAssignee("keep");
    setBulkSchedule("");
  };

  const printDispatchManifest = () => {
    const selected = deliverySelection.size
      ? deliveryOrders.filter((order) => deliverySelection.has(order.id))
      : deliveryOrders.filter((order) => order.fulfillment_status === "scheduled" || order.fulfillment_status === "out-for-delivery");
    if (!selected.length) {
      toast({ title: "Nothing to print", description: "Select deliveries or schedule a route first." });
      return;
    }
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;
    const rows = selected.map((order, index) => {
      const items = order.items.filter((item) => readyUnits(item) > 0);
      return `<section><div class="stop">${index + 1}</div><div class="main"><h2>${order.order_number} · ${order.companyName}</h2><p>${order.reference ? `SO ${order.reference} · ` : ""}${memberName(order.fulfillment_assigned_to)} · ${formatWhen(order.fulfillment_scheduled_for)}</p><ul>${items.map((item) => `<li><strong>${readyUnits(item)}×</strong> ${item.name}${item.code ? ` <small>${item.code}</small>` : ""}</li>`).join("")}</ul>${order.fulfillment_notes ? `<div class="note">${order.fulfillment_notes}</div>` : ""}</div><div class="check">□</div></section>`;
    }).join("");
    printWindow.document.write(`<!doctype html><html><head><title>Dispatch manifest</title><style>body{font-family:Arial,sans-serif;color:#132238;margin:28px}header{display:flex;justify-content:space-between;border-bottom:3px solid #132238;padding-bottom:14px;margin-bottom:18px}h1{font-size:24px;margin:0}header p,p{color:#64748b;font-size:12px;margin:4px 0}section{display:flex;gap:14px;border-bottom:1px solid #dbe2ea;padding:15px 0;break-inside:avoid}.stop{width:32px;height:32px;border-radius:50%;background:#132238;color:white;display:grid;place-items:center;font-weight:bold}.main{flex:1}h2{font-size:15px;margin:0}ul{margin:9px 0;padding-left:20px;font-size:12px}li{margin:4px 0}small{color:#64748b}.note{background:#f1f5f9;padding:8px;border-radius:6px;font-size:11px}.check{font-size:25px}@media print{body{margin:12mm}}</style></head><body><header><div><h1>Delivery dispatch manifest</h1><p>${new Date().toLocaleString("en-ZA")} · ${selected.length} stops</p></div><strong>ALEPH</strong></header>${rows}</body></html>`);
    printWindow.document.close();
    printWindow.print();
  };

  const matchesFocus = (assignedTo: string | null | undefined, scheduledFor: string | null | undefined) => {
    if (focusFilter === "mine") return assignedTo === user?.id;
    if (focusFilter === "today") return isToday(scheduledFor);
    if (focusFilter === "late") return isOverdue(scheduledFor);
    return true;
  };

  const deliveryFiltered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return deliveryOrders.filter((order) => {
      if (!matchesFocus(order.fulfillment_assigned_to, order.fulfillment_scheduled_for)) return false;
      if (!needle) return true;
      return [order.order_number, order.reference, order.companyName, memberName(order.fulfillment_assigned_to), ...order.items.map((item) => `${item.code || ""} ${item.name}`)]
        .join(" ")
        .toLowerCase()
        .includes(needle);
    });
  }, [deliveryOrders, query, focusFilter, user?.id, memberName]);

  const collectionFiltered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return collectionQueue.filter((po) => {
      if (!matchesFocus(po.state?.assigned_to, po.state?.scheduled_for)) return false;
      if (!needle) return true;
      return [po.purchaseOrderNumber, po.vendorName, memberName(po.state?.assigned_to), ...po.linesView.map((line) => `${line.sku || ""} ${line.name} ${line.description || ""}`)]
        .join(" ")
        .toLowerCase()
        .includes(needle);
    });
  }, [collectionQueue, query, focusFilter, user?.id, memberName]);

  const deliveryLanes = useMemo(() => [
    { id: "ready", label: "Ready to plan", hint: "Assign and schedule", icon: PackageCheck, items: deliveryFiltered.filter((order) => order.fulfillment_status !== "scheduled" && order.fulfillment_status !== "out-for-delivery") },
    { id: "scheduled", label: "Route planned", hint: "Upcoming dispatches", icon: CalendarDays, items: deliveryFiltered.filter((order) => order.fulfillment_status === "scheduled") },
    { id: "route", label: "Out on route", hint: "Complete on handover", icon: Navigation, items: deliveryFiltered.filter((order) => order.fulfillment_status === "out-for-delivery") },
  ], [deliveryFiltered]);

  const collectionLanes = useMemo(() => [
    { id: "ready", label: "Ready to plan", hint: "Pickup or supplier delivery", icon: Warehouse, items: collectionFiltered.filter((po) => !po.state || po.state.status === "pending") },
    { id: "scheduled", label: "Arrival planned", hint: "Upcoming stock movements", icon: CalendarDays, items: collectionFiltered.filter((po) => po.state?.status === "scheduled") },
    { id: "collecting", label: "Receiving now", hint: "Record actual quantities", icon: PackageCheck, items: collectionFiltered.filter((po) => po.state?.status === "collecting") },
  ], [collectionFiltered]);

  const selectedDelivery = deliveryOrders.find((order) => order.id === selectedDeliveryId) || null;
  const selectedCollection = collectionQueue.find((po) => po.purchaseOrderId === selectedCollectionId) || null;
  const selectedDeliveryTimeline = selectedDelivery ? timelineEvents.filter((event) => event.entity_id === selectedDelivery.id) : [];
  const selectedCollectionTimeline = selectedCollection ? timelineEvents.filter((event) => event.entity_id === selectedCollection.purchaseOrderId) : [];
  const recentCollectionEvents = useMemo(
    () => collectionEvents.filter((event) => isInFulfillmentWindow(event.collected_at)),
    [collectionEvents],
  );
  const selectedCollectionDraftTotal = selectedCollection
    ? selectedCollection.linesView.reduce((sum, line) => sum + Math.max(0, Math.min(Number(collectionDraft[selectedCollection.purchaseOrderId]?.[line.key] || 0), line.remaining)), 0)
    : 0;

  const counts = useMemo(
    () => ({
      delivery: deliveryOrders.length,
      collection: collectionQueue.length,
      unassignedCollections: collectionQueue.filter((po) => !po.state?.assigned_to).length,
      unassignedDeliveries: deliveryOrders.filter((order) => !order.fulfillment_assigned_to).length,
      scheduledToday: deliveryOrders.filter((order) => isToday(order.fulfillment_scheduled_for)).length + collectionQueue.filter((po) => isToday(po.state?.scheduled_for)).length,
      late: deliveryOrders.filter((order) => isOverdue(order.fulfillment_scheduled_for)).length + collectionQueue.filter((po) => isOverdue(po.state?.scheduled_for)).length,
      readyUnits: deliveryOrders.reduce((sum, order) => sum + order.items.reduce((itemSum, item) => itemSum + readyUnits(item), 0), 0),
      collectionUnits: collectionQueue.reduce((sum, po) => sum + po.remainingUnits, 0),
      deliveryHistory: deliveryHistory.length,
      collectionHistory: recentCollectionEvents.length,
    }),
    [deliveryOrders, collectionQueue, deliveryHistory, recentCollectionEvents],
  );

  const LegacyWorkspace = () => (
    <div className="aleph-page-workspace space-y-5">
      <section className="overflow-hidden rounded-[28px] border border-border/60 bg-card/85 shadow-sm backdrop-blur-xl">
        <div className="border-b border-border/50 bg-gradient-to-r from-primary/10 via-transparent to-sky-500/10 p-5 sm:p-6">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.18em] text-primary"><Truck className="h-4 w-4" />Fulfillment control</div>
              <h1 className="mt-2 text-2xl font-black tracking-tight sm:text-3xl">Delivery, supplier collections & history</h1>
              <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
                Deliveries come from ready customer orders. Collections are matched automatically to recent Zoho purchase-order quantities that still have no valid supplier bill covering them.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" className="rounded-xl" onClick={() => void fetchData()} disabled={loading}><RefreshCw className={cn("mr-2 h-4 w-4", loading && "animate-spin")} />Refresh</Button>
              <Button className="rounded-xl" onClick={() => void autoAssignCollections()} disabled={assigning || !collectionQueue.length}><Sparkles className="mr-2 h-4 w-4" />{assigning ? "Assigning…" : "Auto assign collections"}</Button>
            </div>
          </div>
        </div>

        <div className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-5 sm:p-5">
          {[
            ["Ready deliveries", counts.delivery, Truck],
            ["POs to collect", counts.collection, Warehouse],
            ["Unassigned POs", counts.unassignedCollections, Users],
            ["Delivery history", counts.deliveryHistory, Archive],
            ["Collection events", counts.collectionHistory, History],
          ].map(([label, value, Icon]: any) => (
            <div key={label} className="flex items-center gap-3 rounded-2xl border border-border/50 bg-background/70 p-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/10 text-primary"><Icon className="h-4.5 w-4.5" /></div>
              <div><p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">{label}</p><p className="text-xl font-black">{value}</p></div>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-border/60 bg-card/75 p-3 shadow-sm sm:p-4">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="grid grid-cols-3 gap-1 rounded-2xl bg-muted/50 p-1">
            <button onClick={() => setActiveMode("delivery")} className={cn("flex items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-sm font-bold transition-all", activeMode === "delivery" ? "bg-background text-primary shadow-sm" : "text-muted-foreground hover:text-foreground")}><Truck className="h-4 w-4" /><span className="hidden sm:inline">Delivery</span><Badge variant="secondary">{counts.delivery}</Badge></button>
            <button onClick={() => setActiveMode("collection")} className={cn("flex items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-sm font-bold transition-all", activeMode === "collection" ? "bg-background text-primary shadow-sm" : "text-muted-foreground hover:text-foreground")}><Warehouse className="h-4 w-4" /><span className="hidden sm:inline">Collection</span><Badge variant="secondary">{counts.collection}</Badge></button>
            <button onClick={() => setActiveMode("history")} className={cn("flex items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-sm font-bold transition-all", activeMode === "history" ? "bg-background text-primary shadow-sm" : "text-muted-foreground hover:text-foreground")}><History className="h-4 w-4" /><span className="hidden sm:inline">History</span></button>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            {activeMode !== "history" && <div className="relative min-w-0 sm:w-80"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={activeMode === "collection" ? "Search supplier, PO or item…" : "Search delivery orders…"} className="rounded-xl pl-9" /></div>}
            <div className="flex items-center gap-2 rounded-xl border border-border/60 px-3 py-2"><Switch checked={settings.auto_assign_enabled} onCheckedChange={(checked) => void saveSettings({ auto_assign_enabled: checked })} /><div><p className="text-xs font-bold">Auto assign</p><p className="text-[10px] text-muted-foreground">Balance new work</p></div></div>
          </div>
        </div>
      </section>

      {loading ? (
        <div className="grid gap-3 lg:grid-cols-2">{[0, 1, 2, 3].map((n) => <div key={n} className="h-64 animate-pulse rounded-3xl bg-muted/50" />)}</div>
      ) : activeMode === "delivery" ? (
        deliveryFiltered.length === 0 ? (
          <EmptyState icon={Truck} title="No deliveries waiting" body="Customer orders appear here when quantities reach Ready for Delivery." />
        ) : (
          <div className="grid gap-4 xl:grid-cols-2">
            {deliveryFiltered.map((order) => {
              const visibleItems = order.items.filter((item) => readyUnits(item) > 0);
              const unitCount = visibleItems.reduce((sum, item) => sum + readyUnits(item), 0);
              return (
                <Card key={order.id} className="overflow-hidden rounded-3xl border-border/60 bg-card/90 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-xl">
                  <CardContent className="p-0">
                    <div className="flex items-start justify-between gap-3 border-b border-border/50 p-4 sm:p-5">
                      <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h3 className="text-lg font-black text-primary">{order.order_number}</h3>{order.reference && <Badge variant="outline">SO: {order.reference}</Badge>}{order.urgency === "urgent" && <Badge variant="destructive">Urgent</Badge>}</div><p className="mt-1 truncate text-sm font-semibold">{order.companyName}</p><p className="mt-1 text-xs text-muted-foreground">{visibleItems.length} line{visibleItems.length === 1 ? "" : "s"} · {unitCount} unit{unitCount === 1 ? "" : "s"} ready</p></div>
                      <Badge variant="secondary" className="rounded-full">{order.fulfillment_status === "out-for-delivery" ? "Out for delivery" : order.fulfillment_status === "scheduled" ? "Scheduled" : "Ready"}</Badge>
                    </div>
                    <div className="space-y-2 p-4 sm:p-5">{visibleItems.map((item) => <div key={item.id} className="flex items-start gap-3 rounded-2xl bg-muted/40 px-3 py-2.5"><div className="rounded-xl bg-primary/10 px-2 py-1 text-xs font-black text-primary">×{readyUnits(item)}</div><div className="min-w-0 flex-1"><p className="break-words text-sm font-semibold">{item.name}</p>{item.code && <p className="mt-0.5 font-mono text-[10px] text-muted-foreground">{item.code}</p>}</div></div>)}</div>
                    <div className="grid gap-3 border-t border-border/50 bg-muted/20 p-4 sm:grid-cols-2 sm:p-5">
                      <Field label="Assigned to" icon={UserRound}><Select value={order.fulfillment_assigned_to || "unassigned"} onValueChange={(value) => void updateDelivery(order.id, { fulfillment_assigned_to: value === "unassigned" ? null : value })}><SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="unassigned">Unassigned</SelectItem>{team.map((member) => <SelectItem key={member.id} value={member.id}>{member.full_name || member.email || "Team member"}</SelectItem>)}</SelectContent></Select></Field>
                      <Field label="Status" icon={Clock3}><Select value={order.fulfillment_status} onValueChange={(value) => void updateDelivery(order.id, { fulfillment_status: value })}><SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="pending">Ready</SelectItem><SelectItem value="scheduled">Scheduled</SelectItem><SelectItem value="out-for-delivery">Out for delivery</SelectItem></SelectContent></Select></Field>
                      <Field label="Schedule" icon={CalendarClock}><Input type="datetime-local" className="rounded-xl" value={order.fulfillment_scheduled_for ? new Date(order.fulfillment_scheduled_for).toISOString().slice(0, 16) : ""} onChange={(e) => void updateDelivery(order.id, { fulfillment_scheduled_for: e.target.value ? new Date(e.target.value).toISOString() : null, fulfillment_status: e.target.value ? "scheduled" : order.fulfillment_status })} /></Field>
                      <div className="sm:col-span-2"><label className="mb-1.5 text-[10px] font-black uppercase tracking-wider text-muted-foreground">Delivery notes</label><Textarea defaultValue={order.fulfillment_notes || ""} placeholder="Add delivery instructions…" className="min-h-20 resize-none rounded-xl" onBlur={(e) => { if (e.target.value !== (order.fulfillment_notes || "")) void updateDelivery(order.id, { fulfillment_notes: e.target.value || null }); }} /></div>
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/50 p-4 sm:px-5"><p className="text-xs text-muted-foreground">{order.fulfillment_assigned_to ? `Assigned to ${memberName(order.fulfillment_assigned_to)}` : "Needs an assignee"}</p><Button size="sm" className="rounded-xl" onClick={() => void completeDelivery(order)}><CheckCircle2 className="mr-2 h-4 w-4" />Complete delivery</Button></div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )
      ) : activeMode === "collection" ? (
        collectionFiltered.length === 0 ? (
          <EmptyState icon={Warehouse} title="No supplier collections waiting" body="This lane is fed from recent Zoho POs with unbilled quantities. Fully collected POs move to Collection History automatically." />
        ) : (
          <div className="grid gap-4 xl:grid-cols-2">
            {collectionFiltered.map((po) => {
              const draft = collectionDraft[po.purchaseOrderId] || {};
              const draftTotal = po.linesView.reduce((sum, line) => sum + Math.max(0, Math.min(Number(draft[line.key] || 0), line.remaining)), 0);
              return (
                <Card key={po.purchaseOrderId} className="overflow-hidden rounded-3xl border-border/60 bg-card/90 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-xl">
                  <CardContent className="p-0">
                    <div className="border-b border-border/50 bg-gradient-to-r from-violet-500/8 via-transparent to-primary/8 p-4 sm:p-5">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h3 className="text-lg font-black text-primary">{po.purchaseOrderNumber}</h3><Badge className="bg-blue-500/10 text-blue-700 dark:text-blue-300" variant="outline"><FileCheck2 className="mr-1 h-3 w-3" />Unbilled PO</Badge></div><p className="mt-1 truncate text-sm font-semibold">{po.vendorName}</p><p className="mt-1 text-xs text-muted-foreground">PO date {po.date || "—"}{po.expectedDeliveryDate ? ` · expected ${po.expectedDeliveryDate}` : ""}</p></div>
                        <div className="text-right"><p className="text-2xl font-black">{po.remainingUnits}</p><p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">units left</p></div>
                      </div>
                    </div>

                    <div className="space-y-2 p-4 sm:p-5">
                      {po.linesView.filter((line) => line.remaining > 0).map((line) => (
                        <div key={line.key} className="grid gap-3 rounded-2xl bg-muted/40 p-3 sm:grid-cols-[minmax(0,1fr)_110px] sm:items-center">
                          <div className="min-w-0"><p className="break-words text-sm font-semibold">{line.name || line.description}</p>{line.sku && <p className="mt-0.5 font-mono text-[10px] text-muted-foreground">{line.sku}</p>}<div className="mt-1 flex flex-wrap gap-2 text-[10px] text-muted-foreground"><span>{line.outstanding} unbilled</span>{line.collected > 0 && <span className="font-bold text-emerald-600">{line.collected} already collected</span>}<span className="font-bold text-primary">{line.remaining} remaining</span></div></div>
                          <div><label className="mb-1 block text-[9px] font-black uppercase tracking-wider text-muted-foreground">Collected now</label><Input type="number" min={0} max={line.remaining} step="any" value={draft[line.key] ?? ""} onChange={(e) => setDraftQty(po.purchaseOrderId, line.key, Number(e.target.value), line.remaining)} placeholder="0" className="rounded-xl" /></div>
                        </div>
                      ))}
                    </div>

                    <div className="grid gap-3 border-t border-border/50 bg-muted/20 p-4 sm:grid-cols-2 sm:p-5">
                      <Field label="Collector / assignee" icon={UserRound}><Select value={po.state?.assigned_to || "unassigned"} onValueChange={(value) => void updateCollectionState(po, { assigned_to: value === "unassigned" ? null : value })}><SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="unassigned">Unassigned</SelectItem>{team.map((member) => <SelectItem key={member.id} value={member.id}>{member.full_name || member.email || "Team member"}</SelectItem>)}</SelectContent></Select></Field>
                      <Field label="Collection status" icon={Clock3}><Select value={po.state?.status === "collected" ? "pending" : po.state?.status || "pending"} onValueChange={(value: POCollectionState["status"]) => void updateCollectionState(po, { status: value })}><SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="pending">Pending</SelectItem><SelectItem value="scheduled">Scheduled</SelectItem><SelectItem value="collecting">Collecting now</SelectItem></SelectContent></Select></Field>
                      <Field label="Schedule" icon={CalendarClock}><Input type="datetime-local" className="rounded-xl" value={po.state?.scheduled_for ? new Date(po.state.scheduled_for).toISOString().slice(0, 16) : ""} onChange={(e) => void updateCollectionState(po, { scheduled_for: e.target.value ? new Date(e.target.value).toISOString() : null, status: e.target.value ? "scheduled" : "pending" })} /></Field>
                      <div className="sm:col-span-2"><label className="mb-1.5 text-[10px] font-black uppercase tracking-wider text-muted-foreground">Collection event note</label><Textarea value={collectionNotes[po.purchaseOrderId] ?? ""} onChange={(e) => setCollectionNotes((current) => ({ ...current, [po.purchaseOrderId]: e.target.value }))} placeholder="Optional note: boxes short, back-order, supplier contact, etc." className="min-h-16 resize-none rounded-xl" /></div>
                    </div>

                    <div className="flex flex-col gap-3 border-t border-border/50 p-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
                      <div className="text-xs text-muted-foreground"><p>{po.state?.assigned_to ? `Assigned to ${memberName(po.state.assigned_to)}` : "Needs an assignee"}</p>{po.collectedUnits > 0 && <p className="mt-0.5 text-emerald-600">{po.collectedUnits} unit{po.collectedUnits === 1 ? "" : "s"} already archived as collected</p>}</div>
                      <div className="flex flex-wrap gap-2"><Button variant="outline" size="sm" className="rounded-xl" onClick={() => collectAllRemaining(po)}>Collect all remaining</Button><Button size="sm" className="rounded-xl" disabled={collectingId === po.purchaseOrderId || draftTotal <= 0} onClick={() => void markCollected(po)}><PackageCheck className="mr-2 h-4 w-4" />{collectingId === po.purchaseOrderId ? "Saving…" : `Mark ${draftTotal || ""} collected`}</Button></div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )
      ) : (
        <HistoryPanel
          mode={historyMode}
          onModeChange={setHistoryMode}
          deliveries={deliveryHistory}
          collectionEvents={collectionEvents}
          collectionEventLines={collectionEventLines}
          memberName={memberName}
        />
      )}
    </div>
  );

  return (
    <div className="fulfillment-v3 aleph-page-workspace min-w-0 space-y-5 pb-10">
      <section className="fulfillment-command-header overflow-hidden rounded-[26px] border border-border/60 bg-card/90 shadow-sm backdrop-blur-xl">
        <div className="flex flex-col gap-4 p-4 sm:p-5 xl:flex-row xl:items-center">
          <div className="flex min-w-0 items-center gap-3 xl:w-[330px]">
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-primary text-primary-foreground shadow-[0_14px_28px_-16px_hsl(var(--primary))]"><MapPinned className="h-5 w-5" /></span>
            <div className="min-w-0">
              <div className="flex items-center gap-2"><p className="text-[9px] font-black uppercase tracking-[0.2em] text-primary">Movement desk</p><span className="flex items-center gap-1 text-[9px] font-bold text-emerald-600"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />Live</span></div>
              <h1 className="truncate text-xl font-black tracking-[-0.035em] sm:text-2xl">Delivery & collection</h1>
              <p className="truncate text-[10px] text-muted-foreground">Only work within 14 days of today</p>
            </div>
          </div>

          <div className="grid flex-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <button type="button" onClick={() => setActiveMode("delivery")} className={cn("group flex items-center gap-3 rounded-2xl border px-3 py-2.5 text-left transition-all", activeMode === "delivery" ? "border-cyan-500/30 bg-cyan-500/10 shadow-sm" : "border-border/50 bg-muted/25 hover:bg-muted/50")}>
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-cyan-500/15 text-cyan-600"><Truck className="h-4 w-4" /></span><span className="min-w-0 flex-1"><span className="block text-[9px] font-black uppercase tracking-wider text-muted-foreground">Deliveries</span><span className="block text-lg font-black leading-5">{counts.delivery}</span></span><span className="text-[10px] font-bold text-cyan-600">{counts.readyUnits} units</span>
            </button>
            <button type="button" onClick={() => setActiveMode("collection")} className={cn("group flex items-center gap-3 rounded-2xl border px-3 py-2.5 text-left transition-all", activeMode === "collection" ? "border-violet-500/30 bg-violet-500/10 shadow-sm" : "border-border/50 bg-muted/25 hover:bg-muted/50")}>
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-violet-500/15 text-violet-600"><Warehouse className="h-4 w-4" /></span><span className="min-w-0 flex-1"><span className="block text-[9px] font-black uppercase tracking-wider text-muted-foreground">Collections</span><span className="block text-lg font-black leading-5">{counts.collection}</span></span><span className="text-[10px] font-bold text-violet-600">{counts.collectionUnits} units</span>
            </button>
            <button type="button" onClick={() => { setFocusFilter("today"); if (activeMode === "history") setActiveMode("delivery"); }} className="flex items-center gap-3 rounded-2xl border border-border/50 bg-muted/25 px-3 py-2.5 text-left transition-all hover:border-emerald-500/25 hover:bg-emerald-500/[0.07]">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-emerald-500/15 text-emerald-600"><CalendarClock className="h-4 w-4" /></span><span className="min-w-0 flex-1"><span className="block text-[9px] font-black uppercase tracking-wider text-muted-foreground">Today</span><span className="block text-lg font-black leading-5">{counts.scheduledToday}</span></span><ChevronRight className="h-4 w-4 text-muted-foreground/40" />
            </button>
            <button type="button" onClick={() => { setFocusFilter("late"); if (activeMode === "history") setActiveMode("delivery"); }} className={cn("flex items-center gap-3 rounded-2xl border px-3 py-2.5 text-left transition-all", counts.late ? "border-destructive/25 bg-destructive/[0.07] hover:bg-destructive/10" : "border-border/50 bg-muted/25 hover:bg-muted/50")}>
              <span className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-xl", counts.late ? "bg-destructive/15 text-destructive" : "bg-emerald-500/15 text-emerald-600")}><Timer className="h-4 w-4" /></span><span className="min-w-0 flex-1"><span className="block text-[9px] font-black uppercase tracking-wider text-muted-foreground">Late</span><span className="block text-lg font-black leading-5">{counts.late}</span></span><ChevronRight className="h-4 w-4 text-muted-foreground/40" />
            </button>
          </div>

          <div className="flex shrink-0 items-center gap-2 xl:border-l xl:border-border/60 xl:pl-4">
            <Button variant="outline" size="sm" className="h-10 flex-1 rounded-xl xl:flex-none" onClick={printDispatchManifest}><Printer className="mr-1.5 h-3.5 w-3.5" />Manifest</Button>
            <Button variant="outline" size="icon" className="h-10 w-10 shrink-0 rounded-xl" aria-label="Refresh live fulfillment data" onClick={() => void refreshNow()} disabled={refreshing}><RefreshCw className={cn("h-4 w-4", refreshing && "animate-spin")} /></Button>
          </div>
        </div>
        <div className="grid border-t border-border/55 bg-muted/25 text-[9px] font-bold text-muted-foreground sm:grid-cols-3">
          <div className="flex items-center gap-2 px-4 py-2"><Users className="h-3.5 w-3.5 text-amber-500" /><span>{counts.unassignedDeliveries + counts.unassignedCollections} movements need an owner</span></div>
          <div className="flex items-center gap-2 border-t border-border/45 px-4 py-2 sm:border-l sm:border-t-0"><CalendarDays className="h-3.5 w-3.5 text-primary" /><span>Rolling operational window: ±14 days</span></div>
          <button type="button" onClick={() => setActiveMode("history")} className="flex items-center gap-2 border-t border-border/45 px-4 py-2 text-left transition-colors hover:bg-muted/50 sm:border-l sm:border-t-0"><History className="h-3.5 w-3.5 text-emerald-600" /><span>{counts.deliveryHistory + counts.collectionHistory} recent completed movements</span><ArrowRight className="ml-auto h-3 w-3" /></button>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: "Needs delivery owner", value: counts.unassignedDeliveries, detail: "customer orders", icon: Truck, tone: "bg-cyan-500/10 text-cyan-600", action: () => { setActiveMode("delivery"); setFocusFilter("all"); } },
          { label: "Needs collection owner", value: counts.unassignedCollections, detail: "supplier POs", icon: Warehouse, tone: "bg-violet-500/10 text-violet-600", action: () => { setActiveMode("collection"); setFocusFilter("all"); } },
          { label: "Completed deliveries", value: counts.deliveryHistory, detail: "recent archive", icon: CheckCircle2, tone: "bg-emerald-500/10 text-emerald-600", action: () => { setHistoryMode("delivery"); setActiveMode("history"); } },
          { label: "Collection trips", value: counts.collectionHistory, detail: "immutable events", icon: Archive, tone: "bg-orange-500/10 text-orange-600", action: () => { setHistoryMode("collection"); setActiveMode("history"); } },
        ].map((metric) => <button key={metric.label} onClick={metric.action} className="group flex items-center gap-3 rounded-[22px] border border-border/60 bg-card/85 p-4 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/25 hover:shadow-lg"><span className={cn("grid h-11 w-11 shrink-0 place-items-center rounded-2xl", metric.tone)}><metric.icon className="h-4.5 w-4.5" /></span><span className="min-w-0 flex-1"><span className="block text-[9px] font-black uppercase tracking-[0.14em] text-muted-foreground">{metric.label}</span><span className="mt-0.5 block text-2xl font-black">{metric.value}</span><span className="block text-[10px] text-muted-foreground">{metric.detail}</span></span><ChevronRight className="h-4 w-4 text-muted-foreground/25 transition-transform group-hover:translate-x-0.5 group-hover:text-primary" /></button>)}
      </section>

      <section className="sticky top-0 z-20 rounded-[24px] border border-border/60 bg-card/90 p-3 shadow-lg backdrop-blur-xl">
        <div className="flex flex-col gap-3 2xl:flex-row 2xl:items-center 2xl:justify-between">
          <div className="grid grid-cols-3 gap-1 rounded-2xl bg-muted/55 p-1">
            <button onClick={() => setActiveMode("delivery")} className={cn("flex items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-xs font-bold transition-all", activeMode === "delivery" ? "bg-background text-primary shadow-sm" : "text-muted-foreground hover:text-foreground")}><Truck className="h-4 w-4" /><span>Delivery</span><Badge variant="secondary" className="h-5 px-1.5">{counts.delivery}</Badge></button>
            <button onClick={() => setActiveMode("collection")} className={cn("flex items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-xs font-bold transition-all", activeMode === "collection" ? "bg-background text-primary shadow-sm" : "text-muted-foreground hover:text-foreground")}><Warehouse className="h-4 w-4" /><span>Collection</span><Badge variant="secondary" className="h-5 px-1.5">{counts.collection}</Badge></button>
            <button onClick={() => setActiveMode("history")} className={cn("flex items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-xs font-bold transition-all", activeMode === "history" ? "bg-background text-primary shadow-sm" : "text-muted-foreground hover:text-foreground")}><History className="h-4 w-4" /><span>History</span></button>
          </div>

          {activeMode !== "history" && <div className="flex min-w-0 flex-1 flex-col gap-2 lg:flex-row lg:justify-end">
            <div className="relative min-w-0 lg:max-w-sm lg:flex-1"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={activeMode === "collection" ? "Search PO, supplier, item or collector…" : "Search order, client, item or driver…"} className="h-10 rounded-xl bg-muted/35 pl-9" />{query && <button className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" onClick={() => setQuery("")}><X className="h-3.5 w-3.5" /></button>}</div>
            <div className="grid grid-cols-4 gap-1 rounded-xl bg-muted/45 p-1">{(["all", "mine", "today", "late"] as FocusFilter[]).map((filter) => <button key={filter} onClick={() => setFocusFilter(filter)} className={cn("rounded-lg px-2.5 py-2 text-[10px] font-bold capitalize", focusFilter === filter ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>{filter}</button>)}</div>
            <div className="flex items-center gap-2 rounded-xl border border-border/60 px-3 py-1.5"><Switch checked={settings.auto_assign_enabled} onCheckedChange={(checked) => void saveSettings({ auto_assign_enabled: checked })} /><div className="whitespace-nowrap"><p className="text-[10px] font-bold">Auto assign</p><p className="text-[9px] text-muted-foreground">Balance new work</p></div></div>
            {activeMode === "collection" && <Button variant="outline" className="h-10 rounded-xl" onClick={() => void autoAssignCollections()} disabled={assigning || !collectionQueue.length}><Sparkles className="mr-1.5 h-3.5 w-3.5" />{assigning ? "Assigning…" : "Balance"}</Button>}
            <Button className="h-10 rounded-xl" onClick={() => setRoutePlannerOpen(true)}><Route className="mr-1.5 h-3.5 w-3.5" />Plan dispatch run</Button>
          </div>}
        </div>
      </section>

      {(deliverySelection.size + collectionSelection.size) > 0 && (
        <section className="flex flex-col gap-3 rounded-[24px] border border-primary/20 bg-primary/[0.045] p-3 shadow-sm lg:flex-row lg:items-center">
          <div className="flex flex-wrap items-center gap-2 px-1"><Checkbox checked /><span className="text-sm font-bold">{deliverySelection.size + collectionSelection.size} dispatch stops selected</span>{deliverySelection.size > 0 && <Badge variant="outline" className="rounded-full bg-cyan-500/10 text-cyan-700">{deliverySelection.size} delivery</Badge>}{collectionSelection.size > 0 && <Badge variant="outline" className="rounded-full bg-violet-500/10 text-violet-700">{collectionSelection.size} collection</Badge>}<button className="rounded-lg p-1 text-muted-foreground hover:bg-muted" onClick={() => { setDeliverySelection(new Set()); setCollectionSelection(new Set()); }}><X className="h-3.5 w-3.5" /></button></div>
          <div className="flex flex-1 flex-wrap justify-end gap-2">
            {activeMode === "delivery" && deliverySelection.size > 0 && <Button variant="outline" className="h-10 rounded-xl" onClick={() => void applyBulkDeliveryPlan()} disabled={bulkSaving || (bulkAssignee === "keep" && !bulkSchedule)}><Route className="mr-1.5 h-4 w-4" />Quick schedule deliveries</Button>}
            <Button className="h-10 rounded-xl" onClick={() => setRoutePlannerOpen(true)}><WandSparkles className="mr-1.5 h-4 w-4" />Plan mixed dispatch run</Button>
          </div>
        </section>
      )}

      {loading ? (
        <div className="grid gap-4 xl:grid-cols-3">{[0, 1, 2].map((number) => <div key={number} className="h-[520px] animate-pulse rounded-[28px] bg-muted/50" />)}</div>
      ) : activeMode === "history" ? (
        <HistoryPanel mode={historyMode} onModeChange={setHistoryMode} deliveries={deliveryHistory} collectionEvents={recentCollectionEvents} collectionEventLines={collectionEventLines} memberName={memberName} />
      ) : activeMode === "delivery" ? (
        deliveryFiltered.length === 0 ? <EmptyState icon={Truck} title="No deliveries match this view" body="Ready customer quantities appear automatically. Try All if a focus filter is active." /> : (
          <div className="fulfillment-board-grid grid min-w-0 gap-4 xl:grid-cols-3">
            {deliveryLanes.map((lane) => (
              <DispatchLane key={lane.id} label={lane.label} hint={lane.hint} icon={lane.icon} count={lane.items.length} tone={lane.id === "route" ? "route" : lane.id === "scheduled" ? "planned" : "ready"}>
                {lane.items.map((order) => (
                  <DeliveryDispatchCard key={order.id} order={order} memberName={memberName} selected={deliverySelection.has(order.id)} onToggle={() => toggleDeliverySelection(order.id)} onToggleUrgent={() => void updateDelivery(order.id, { urgency: order.urgency === "urgent" ? "normal" : "urgent" })} onOpen={() => setSelectedDeliveryId(order.id)} onClaim={() => void updateDelivery(order.id, { fulfillment_assigned_to: user?.id || null })} onAdvance={() => order.fulfillment_status === "scheduled" ? void updateDelivery(order.id, { fulfillment_status: "out-for-delivery" }) : order.fulfillment_status === "out-for-delivery" ? setConfirmDeliveryId(order.id) : setSelectedDeliveryId(order.id)} />
                ))}
              </DispatchLane>
            ))}
          </div>
        )
      ) : collectionFiltered.length === 0 ? <EmptyState icon={Warehouse} title="No collections match this view" body="Open Zoho purchase orders appear automatically. Try All if a focus filter is active." /> : (
        <div className="fulfillment-board-grid grid min-w-0 gap-4 xl:grid-cols-3">
          {collectionLanes.map((lane) => <DispatchLane key={lane.id} label={lane.label} hint={lane.hint} icon={lane.icon} count={lane.items.length} tone={lane.id === "collecting" ? "route" : lane.id === "scheduled" ? "planned" : "ready"}>{lane.items.map((po) => <CollectionDispatchCard key={po.purchaseOrderId} po={po} memberName={memberName} selected={collectionSelection.has(po.purchaseOrderId)} onToggle={() => toggleCollectionSelection(po.purchaseOrderId)} onToggleUrgent={() => void updateCollectionState(po, { is_urgent: !po.state?.is_urgent })} onOpen={() => setSelectedCollectionId(po.purchaseOrderId)} onClaim={() => void updateCollectionState(po, { assigned_to: user?.id || null })} onAdvance={() => po.state?.status === "scheduled" || po.state?.status === "pending" ? void updateCollectionState(po, { status: "collecting" }) : setSelectedCollectionId(po.purchaseOrderId)} />)}</DispatchLane>)}
        </div>
      )}

      <Sheet open={routePlannerOpen} onOpenChange={setRoutePlannerOpen}>
        <SheetContent className="w-full overflow-y-auto p-0 sm:max-w-3xl">
          <div className="border-b border-border/60 bg-gradient-to-br from-primary/12 via-background to-violet-500/10 p-6 pt-9">
            <SheetHeader>
              <div className="flex flex-wrap items-center gap-2"><Badge className="rounded-full"><WandSparkles className="mr-1 h-3 w-3" />Mixed dispatch planner</Badge><Badge variant="outline" className="rounded-full bg-cyan-500/10 text-cyan-700">Delivery</Badge><Badge variant="outline" className="rounded-full bg-violet-500/10 text-violet-700">Collection</Badge>{!navigator.onLine && <Badge variant="outline" className="rounded-full"><WifiOff className="mr-1 h-3 w-3" />Saves offline</Badge>}</div>
              <SheetTitle className="mt-3 text-left text-2xl font-black tracking-tight">Build one run from deliveries and collections</SheetTitle>
            </SheetHeader>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">The first time a client or supplier appears, link it to a dispatch area. That area is remembered permanently, so future deliveries and collections are grouped automatically before the route is built.</p>
          </div>
          <div className="space-y-6 p-5 sm:p-6">
            <section className="grid gap-3 sm:grid-cols-2">
              <Field label="Route name" icon={Route}><Input value={routeName} onChange={(event) => setRouteName(event.target.value)} placeholder="East Rand morning run" className="rounded-xl" /></Field>
              <Field label="Route date" icon={CalendarDays}><Input type="date" value={routeDate} onChange={(event) => setRouteDate(event.target.value)} className="rounded-xl" /></Field>
            </section>
            <Field label="Driver" icon={UserRound}>
              <Select value={bulkAssignee} onValueChange={setBulkAssignee}><SelectTrigger className="rounded-xl"><SelectValue placeholder="Choose a driver" /></SelectTrigger><SelectContent><SelectItem value="keep">Keep current owners when identical</SelectItem><SelectItem value="unassigned">Leave unassigned</SelectItem>{team.map((member) => <SelectItem key={member.id} value={member.id}>{member.full_name || member.email || "Team member"}</SelectItem>)}</SelectContent></Select>
            </Field>

            <section className="rounded-3xl border border-border/60 bg-muted/20 p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div><p className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">1 · Select stops</p><p className="mt-1 text-xs text-muted-foreground">Choose any mixture of customer deliveries and supplier collections.</p></div>
                <div className="flex gap-2"><Badge variant="secondary" className="rounded-full">{deliverySelection.size} deliveries</Badge><Badge variant="secondary" className="rounded-full">{collectionSelection.size} collections</Badge></div>
              </div>
              <div className="mt-4 grid gap-2 md:grid-cols-2">
                {allDispatchStops.map((stop) => {
                  const selected = stop.type === "delivery" ? deliverySelection.has(stop.entityId) : collectionSelection.has(stop.entityId);
                  return <button type="button" key={stop.key} onClick={() => stop.type === "delivery" ? toggleDeliverySelection(stop.entityId) : toggleCollectionSelection(stop.entityId)} className={cn("flex items-start gap-3 rounded-2xl border p-3 text-left transition-all", selected ? "border-primary/30 bg-primary/[0.07] shadow-sm" : "border-border/55 bg-background/70 hover:border-primary/20 hover:bg-muted/35")}><Checkbox checked={selected} className="mt-0.5" /><span className={cn("mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-xl", stop.type === "delivery" ? "bg-cyan-500/12 text-cyan-700" : "bg-violet-500/12 text-violet-700")}>{stop.type === "delivery" ? <Truck className="h-4 w-4" /> : <Warehouse className="h-4 w-4" />}</span><span className="min-w-0 flex-1"><span className="flex flex-wrap items-center gap-1.5"><strong className="text-xs">{stop.reference}</strong><Badge variant="outline" className={cn("h-5 px-1.5 text-[8px] font-black uppercase", stop.type === "delivery" ? "border-cyan-500/25 text-cyan-700" : "border-violet-500/25 text-violet-700")}>{stop.type}</Badge>{stop.areaName && <Badge variant="secondary" className="h-5 px-1.5 text-[8px]">{stop.areaName}</Badge>}</span><span className="mt-0.5 block truncate text-[11px] font-semibold">{stop.label}</span><span className="mt-1 block truncate text-[9px] text-muted-foreground">{stop.address || "No navigation address saved yet"}</span></span></button>;
                })}
              </div>
              {!allDispatchStops.length && <p className="mt-4 rounded-2xl border border-dashed border-border/70 p-6 text-center text-xs text-muted-foreground">No active deliveries or collections are available to dispatch.</p>}
            </section>

            <section className="rounded-3xl border border-border/60 bg-background p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">2 · Teach the area once</p><p className="mt-1 text-xs text-muted-foreground">Area links are saved against the client or supplier, not this individual order.</p></div><div className="flex min-w-0 gap-2 sm:w-[320px]"><Input value={newAreaName} onChange={(event) => setNewAreaName(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void createDispatchArea(); } }} placeholder="New area, e.g. Jet Park" className="h-9 rounded-xl" /><Button variant="outline" className="h-9 rounded-xl" disabled={!newAreaName.trim()} onClick={() => void createDispatchArea()}>Add</Button></div></div>
              <div className="mt-4 space-y-2">
                {selectedDispatchStops.map((stop) => <div key={`area-${stop.key}`} className={cn("grid gap-2 rounded-2xl border p-3 sm:grid-cols-[minmax(0,1fr)_180px_minmax(180px,1fr)] sm:items-center", stop.areaId ? "border-border/55 bg-muted/20" : "border-amber-500/30 bg-amber-500/[0.06]")}><div className="min-w-0"><div className="flex flex-wrap items-center gap-1.5"><Badge variant="outline" className={cn("h-5 text-[8px] uppercase", stop.type === "delivery" ? "border-cyan-500/30 text-cyan-700" : "border-violet-500/30 text-violet-700")}>{stop.type}</Badge><strong className="text-xs">{stop.reference}</strong>{!stop.areaId && <Badge variant="destructive" className="h-5 text-[8px]">Area required</Badge>}</div><p className="mt-0.5 truncate text-[10px] text-muted-foreground">{stop.label}</p></div><Select value={stop.areaId || "unlinked"} onValueChange={(value) => value !== "unlinked" && void saveStopAreaLink(stop, value)} disabled={areaSavingKey === stop.key}><SelectTrigger className="h-9 rounded-xl bg-background"><SelectValue placeholder="Choose area" /></SelectTrigger><SelectContent><SelectItem value="unlinked" disabled>Choose area</SelectItem>{dispatchAreas.map((area) => <SelectItem key={area.id} value={area.id}>{area.name}</SelectItem>)}</SelectContent></Select><Input key={`${stop.key}-${stop.address || "empty"}`} defaultValue={stop.address || ""} disabled={!stop.areaId || areaSavingKey === stop.key} onBlur={(event) => stop.areaId && void saveStopAreaLink(stop, stop.areaId, event.target.value)} placeholder={stop.type === "collection" ? "Supplier pickup address" : "Navigation address override"} className="h-9 rounded-xl bg-background text-xs" /></div>)}
                {!selectedDispatchStops.length && <p className="rounded-2xl bg-muted/30 px-4 py-6 text-center text-xs text-muted-foreground">Select stops above to link their areas.</p>}
              </div>
            </section>

            <section>
              <div className="mb-3 flex flex-wrap items-end justify-between gap-3"><div><p className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">3 · Suggested stop order</p><p className="mt-1 text-xs text-muted-foreground">{routePlanStops.length} selected stops · grouped by learned area, then nearby address text and urgency.</p></div><div className="flex gap-2"><Badge variant={routePlanStops.some((stop) => !stop.areaId) ? "destructive" : "secondary"} className="rounded-full">{routePlanStops.filter((stop) => !stop.areaId).length} unlinked</Badge><Badge variant="secondary" className="rounded-full">{routePlanStops.filter((stop) => !stop.address).length} missing addresses</Badge></div></div>
              <div className="space-y-2">{routePlanStops.map((stop, index) => <div key={stop.key} className="grid grid-cols-[38px_minmax(0,1fr)] gap-3 rounded-2xl border border-border/55 bg-muted/25 p-3"><span className="grid h-9 w-9 place-items-center rounded-xl bg-primary text-sm font-black text-primary-foreground">{index + 1}</span><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><p className="font-black text-primary">{stop.reference}</p><Badge variant="outline" className={cn("h-5 text-[8px] font-black uppercase", stop.type === "delivery" ? "border-cyan-500/30 text-cyan-700" : "border-violet-500/30 text-violet-700")}>{stop.type}</Badge>{stop.areaName && <Badge variant="secondary" className="h-5 text-[8px]">{stop.areaName}</Badge>}{stop.urgency === "urgent" && <Badge variant="destructive" className="h-5 text-[9px]">Urgent</Badge>}</div><p className="truncate text-xs font-semibold">{stop.label}</p><p className={cn("mt-1 flex items-center gap-1 text-[10px]", stop.address ? "text-muted-foreground" : "font-bold text-amber-600")}><MapPin className="h-3 w-3 shrink-0" />{stop.address || "Add a navigation address above"}</p></div></div>)}</div>
            </section>
            <div className="flex flex-col gap-2 border-t border-border/60 pt-4 sm:flex-row">
              <Button variant="outline" className="rounded-xl" disabled={!routeMapUrl} onClick={() => routeMapUrl && window.open(routeMapUrl, "_blank", "noopener,noreferrer")}><MapPinned className="mr-1.5 h-4 w-4" />Preview in Maps</Button>
              <Button className="flex-1 rounded-xl" disabled={routeSaving || !routePlanStops.length || routePlanStops.some((stop) => !stop.areaId)} onClick={() => void saveOptimizedRoute()}>{routeSaving ? <RefreshCw className="mr-1.5 h-4 w-4 animate-spin" /> : <Navigation className="mr-1.5 h-4 w-4" />}{routeSaving ? "Saving route…" : `Save run · ${routePlanStops.length} stops`}</Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      <Dialog open={Boolean(selectedDelivery)} onOpenChange={(open) => !open && setSelectedDeliveryId(null)}>
        <DialogContent className="w-[calc(100%-24px)] max-w-2xl overflow-y-auto max-h-[85vh] p-0 gap-0 rounded-3xl border-2 border-primary/15 bg-background/95 backdrop-blur-2xl shadow-[0_24px_80px_-28px_hsl(var(--foreground)/0.38)]">
          <div className="ribbon-bar" aria-hidden />
          {selectedDelivery && <>
            <div className="fulfillment-inspector-hero border-b border-border/60 p-5 pt-6 sm:p-6 sm:pt-6"><DialogHeader><div className="flex flex-wrap items-center gap-2"><Badge variant="outline" className="bg-background/70"><Truck className="mr-1 h-3 w-3" />Customer delivery</Badge>{selectedDelivery.urgency === "urgent" && <Badge variant="destructive">Urgent</Badge>}</div><DialogTitle className="mt-3 text-left text-2xl font-black tracking-tight">{selectedDelivery.order_number}</DialogTitle></DialogHeader><p className="mt-1 text-sm font-semibold">{selectedDelivery.companyName}</p><p className="mt-1 text-xs text-muted-foreground">{selectedDelivery.items.filter((item) => readyUnits(item) > 0).reduce((sum, item) => sum + readyUnits(item), 0)} units ready · created {formatWhen(selectedDelivery.created_at)}</p></div>
            <div className="space-y-6 p-5 sm:p-6">
              <section><p className="mb-3 text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">Route progress</p><div className="grid grid-cols-3 gap-2">{[{ id: "pending", label: "Ready", icon: PackageCheck }, { id: "scheduled", label: "Planned", icon: CalendarClock }, { id: "out-for-delivery", label: "On route", icon: Navigation }].map((step) => <button key={step.id} onClick={() => void updateDelivery(selectedDelivery.id, { fulfillment_status: step.id, ...(step.id === "pending" ? { fulfillment_scheduled_for: null } : {}) })} className={cn("rounded-2xl border p-3 text-center transition-all", selectedDelivery.fulfillment_status === step.id ? "border-primary/30 bg-primary/10 text-primary" : "border-border/60 bg-muted/25 text-muted-foreground hover:bg-muted/50")}><step.icon className="mx-auto h-4 w-4" /><span className="mt-1.5 block text-[10px] font-bold">{step.label}</span></button>)}</div></section>
              <section className="grid gap-3 sm:grid-cols-2"><Field label="Driver / assignee" icon={UserRound}><Select value={selectedDelivery.fulfillment_assigned_to || "unassigned"} onValueChange={(value) => void updateDelivery(selectedDelivery.id, { fulfillment_assigned_to: value === "unassigned" ? null : value })}><SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="unassigned">Unassigned</SelectItem>{team.map((member) => <SelectItem key={member.id} value={member.id}>{member.full_name || member.email || "Team member"}</SelectItem>)}</SelectContent></Select></Field><Field label="Dispatch time" icon={CalendarClock}><Input type="datetime-local" className="rounded-xl" value={toLocalDateTimeInput(selectedDelivery.fulfillment_scheduled_for)} onChange={(event) => void updateDelivery(selectedDelivery.id, { fulfillment_scheduled_for: event.target.value ? new Date(event.target.value).toISOString() : null, fulfillment_status: event.target.value ? "scheduled" : "pending" })} /></Field></section>
              <button type="button" onClick={() => void updateDelivery(selectedDelivery.id, { urgency: selectedDelivery.urgency === "urgent" ? "normal" : "urgent" })} className={cn("flex w-full items-center justify-between rounded-2xl border p-3 text-left transition-colors", selectedDelivery.urgency === "urgent" ? "border-destructive/30 bg-destructive/10 text-destructive" : "border-border/55 bg-muted/25 hover:bg-muted/50")}><span><span className="block text-xs font-black">Urgent delivery</span><span className="mt-0.5 block text-[10px] opacity-70">Pins this order ahead of standard work.</span></span><CircleAlert className="h-5 w-5" /></button>
              <section><p className="mb-3 text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">Packages ready now</p><div className="space-y-2">{selectedDelivery.items.filter((item) => readyUnits(item) > 0).map((item) => <div key={item.id} className="flex items-start gap-3 rounded-2xl border border-border/45 bg-muted/30 p-3"><span className="grid min-w-10 place-items-center rounded-xl bg-primary/10 px-2 py-1.5 text-sm font-black text-primary">×{readyUnits(item)}</span><div className="min-w-0"><p className="text-sm font-semibold">{item.name}</p>{item.code && <p className="mt-0.5 font-mono text-[10px] text-muted-foreground">{item.code}</p>}</div></div>)}</div></section>
              <EntityTimeline events={selectedDeliveryTimeline} memberName={memberName} />
              <EntityComments entityType="delivery" entityId={selectedDelivery.id} orderId={selectedDelivery.id} />
              <section><label className="mb-2 block text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">Handover instructions</label><Textarea defaultValue={selectedDelivery.fulfillment_notes || ""} placeholder="Access details, contact person, delivery instructions…" className="min-h-28 resize-none rounded-2xl" onBlur={(event) => { if (event.target.value !== (selectedDelivery.fulfillment_notes || "")) void updateDelivery(selectedDelivery.id, { fulfillment_notes: event.target.value || null }); }} /></section>
              <div className="flex flex-col gap-2 border-t border-border/60 pt-4 sm:flex-row"><Button variant="outline" className="rounded-xl" onClick={() => printDispatchManifest()}><Printer className="mr-1.5 h-4 w-4" />Print manifest</Button><Button className="flex-1 rounded-xl" onClick={() => setConfirmDeliveryId(selectedDelivery.id)} disabled={completingDeliveryId === selectedDelivery.id}><CheckCircle2 className="mr-1.5 h-4 w-4" />Complete handover</Button></div>
            </div>
          </>}
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(selectedCollection)} onOpenChange={(open) => !open && setSelectedCollectionId(null)}>
        <DialogContent className="w-[calc(100%-24px)] max-w-2xl overflow-y-auto max-h-[85vh] p-0 gap-0 rounded-3xl border-2 border-primary/15 bg-background/95 backdrop-blur-2xl shadow-[0_24px_80px_-28px_hsl(var(--foreground)/0.38)]">
          <div className="ribbon-bar" aria-hidden />
          {selectedCollection && <>
            <div className="fulfillment-inspector-hero border-b border-border/60 p-5 pt-6 sm:p-6 sm:pt-6"><DialogHeader><div className="flex flex-wrap items-center gap-2"><Badge variant="outline" className="bg-background/70"><Warehouse className="mr-1 h-3 w-3" />Supplier stock arrival</Badge><Badge variant="secondary">{selectedCollection.remainingUnits} units left</Badge>{selectedCollection.state?.is_urgent && <Badge variant="destructive">Urgent</Badge>}</div><DialogTitle className="mt-3 text-left text-2xl font-black tracking-tight">{selectedCollection.purchaseOrderNumber}</DialogTitle></DialogHeader><p className="mt-1 text-sm font-semibold">{selectedCollection.vendorName}</p><p className="mt-1 text-xs text-muted-foreground">Expected {selectedCollection.expectedDeliveryDate || "not specified"} · {formatMoneySafe(selectedCollection.outstandingValue)} outstanding</p></div>
            <div className="space-y-6 p-5 sm:p-6">
              <section><p className="mb-3 text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">Stock arrival progress</p><div className="grid grid-cols-3 gap-2">{[{ id: "pending", label: "Ready", icon: Warehouse }, { id: "scheduled", label: "Planned", icon: CalendarClock }, { id: "collecting", label: selectedCollection.state?.collection_method === "supplier-delivery" ? "Receiving" : "Collecting", icon: PackageCheck }].map((step) => <button key={step.id} onClick={() => void updateCollectionState(selectedCollection, { status: step.id as POCollectionState["status"], ...(step.id === "pending" ? { scheduled_for: null } : {}) })} className={cn("rounded-2xl border p-3 text-center transition-all", (selectedCollection.state?.status || "pending") === step.id ? "border-primary/30 bg-primary/10 text-primary" : "border-border/60 bg-muted/25 text-muted-foreground hover:bg-muted/50")}><step.icon className="mx-auto h-4 w-4" /><span className="mt-1.5 block text-[10px] font-bold">{step.label}</span></button>)}</div></section>
              <section className="grid gap-3 sm:grid-cols-2"><Field label="Stock movement" icon={Truck}><Select value={selectedCollection.state?.collection_method || "pickup"} onValueChange={(value: POCollectionState["collection_method"]) => void updateCollectionState(selectedCollection, { collection_method: value })}><SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="pickup">We collect from supplier</SelectItem><SelectItem value="supplier-delivery">Supplier delivers to us</SelectItem></SelectContent></Select></Field><button type="button" onClick={() => void updateCollectionState(selectedCollection, { is_urgent: !selectedCollection.state?.is_urgent })} className={cn("flex items-center justify-between rounded-2xl border p-3 text-left transition-colors", selectedCollection.state?.is_urgent ? "border-destructive/30 bg-destructive/10 text-destructive" : "border-border/55 bg-muted/25 hover:bg-muted/50")}><span><span className="block text-xs font-black">Urgent stock</span><span className="mt-0.5 block text-[10px] opacity-70">Moves this PO to the front.</span></span><CircleAlert className="h-5 w-5" /></button></section>
              <section className="grid gap-3 sm:grid-cols-2"><Field label={selectedCollection.state?.collection_method === "supplier-delivery" ? "Receiver / assignee" : "Collector / assignee"} icon={UserRound}><Select value={selectedCollection.state?.assigned_to || "unassigned"} onValueChange={(value) => void updateCollectionState(selectedCollection, { assigned_to: value === "unassigned" ? null : value })}><SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="unassigned">Unassigned</SelectItem>{team.map((member) => <SelectItem key={member.id} value={member.id}>{member.full_name || member.email || "Team member"}</SelectItem>)}</SelectContent></Select></Field><Field label={selectedCollection.state?.collection_method === "supplier-delivery" ? "Expected delivery time" : "Pickup time"} icon={CalendarClock}><Input type="datetime-local" className="rounded-xl" value={toLocalDateTimeInput(selectedCollection.state?.scheduled_for)} onChange={(event) => void updateCollectionState(selectedCollection, { scheduled_for: event.target.value ? new Date(event.target.value).toISOString() : null, status: event.target.value ? "scheduled" : "pending" })} /></Field></section>
              <section><div className="mb-3 flex items-center justify-between gap-3"><div><p className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">What arrived now?</p><p className="mt-1 text-xs text-muted-foreground">Enter actual quantities. Partial receipts remain on the board.</p></div><Button variant="outline" size="sm" className="rounded-xl" onClick={() => collectAllRemaining(selectedCollection)}>Fill remaining</Button></div><div className="space-y-2">{selectedCollection.linesView.filter((line) => line.remaining > 0).map((line) => <div key={line.key} className="grid gap-3 rounded-2xl border border-border/45 bg-muted/30 p-3 sm:grid-cols-[minmax(0,1fr)_120px] sm:items-center"><div className="min-w-0"><p className="text-sm font-semibold">{line.name || line.description}</p>{line.sku && <p className="mt-0.5 font-mono text-[10px] text-muted-foreground">{line.sku}</p>}<div className="mt-1.5 flex flex-wrap gap-2 text-[10px] text-muted-foreground">{line.collected > 0 && <span className="font-semibold text-emerald-600">{line.collected} received before</span>}<span className="font-bold text-primary">{line.remaining} remaining</span></div></div><div><label className="mb-1 block text-[9px] font-black uppercase tracking-wider text-muted-foreground">Received now</label><Input type="number" min={0} max={line.remaining} step="any" value={collectionDraft[selectedCollection.purchaseOrderId]?.[line.key] ?? ""} onChange={(event) => setDraftQty(selectedCollection.purchaseOrderId, line.key, Number(event.target.value), line.remaining)} placeholder="0" className="rounded-xl bg-background" /></div></div>)}</div></section>
              <EntityTimeline events={selectedCollectionTimeline} memberName={memberName} />
              <EntityComments entityType="collection" entityId={selectedCollection.purchaseOrderId} />
              <section className="grid gap-3 sm:grid-cols-2"><div><label className="mb-2 block text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">Persistent pickup instructions</label><Textarea defaultValue={selectedCollection.state?.notes || ""} placeholder="Supplier contact, gate instructions…" className="min-h-24 resize-none rounded-2xl" onBlur={(event) => { if (event.target.value !== (selectedCollection.state?.notes || "")) void updateCollectionState(selectedCollection, { notes: event.target.value || null }); }} /></div><div><label className="mb-2 block text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">Note for this collection event</label><Textarea value={collectionNotes[selectedCollection.purchaseOrderId] ?? ""} onChange={(event) => setCollectionNotes((current) => ({ ...current, [selectedCollection.purchaseOrderId]: event.target.value }))} placeholder="Short boxes, back-order, damaged carton…" className="min-h-24 resize-none rounded-2xl" /></div></section>
              <div className="flex flex-col gap-3 rounded-2xl border border-primary/15 bg-primary/[0.045] p-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-2xl font-black text-primary">{selectedCollectionDraftTotal}</p><p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">units received now</p></div><Button className="rounded-xl" disabled={collectingId === selectedCollection.purchaseOrderId || selectedCollectionDraftTotal <= 0} onClick={() => void markCollected(selectedCollection)}><PackageCheck className="mr-1.5 h-4 w-4" />{collectingId === selectedCollection.purchaseOrderId ? "Saving atomically…" : selectedCollection.state?.collection_method === "supplier-delivery" ? "Mark supplier delivery received" : "Record collection"}</Button></div>
            </div>
          </>}
        </DialogContent>
      </Dialog>

      <AlertDialog open={Boolean(confirmDeliveryId)} onOpenChange={(open) => !open && setConfirmDeliveryId(null)}>
        <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Confirm customer handover</AlertDialogTitle><AlertDialogDescription>This will complete every currently invoiced quantity on {deliveryOrders.find((order) => order.id === confirmDeliveryId)?.order_number || "this order"}. The operation is saved as one transaction and will appear in Delivery History.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Not yet</AlertDialogCancel><AlertDialogAction disabled={Boolean(completingDeliveryId)} onClick={(event) => { event.preventDefault(); const order = deliveryOrders.find((candidate) => candidate.id === confirmDeliveryId); if (order) void completeDelivery(order); }}>{completingDeliveryId ? "Completing…" : "Confirm delivered"}</AlertDialogAction></AlertDialogFooter></AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function EntityTimeline({ events, memberName }: { events: FulfillmentTimelineEvent[]; memberName: (id: string | null | undefined) => string }) {
  const visible = events.slice(0, 6);
  return (
    <section>
      <div className="mb-3 flex items-center justify-between gap-3"><div><p className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">Movement timeline</p><p className="mt-1 text-xs text-muted-foreground">A shared audit trail for everyone working on this movement.</p></div><History className="h-4 w-4 text-primary" /></div>
      {visible.length ? <div className="relative space-y-1 before:absolute before:bottom-4 before:left-[17px] before:top-4 before:w-px before:bg-border">{visible.map((event) => <div key={event.id} className="relative grid grid-cols-[36px_minmax(0,1fr)] gap-3 rounded-2xl p-2 transition-colors hover:bg-muted/35"><span className="z-10 grid h-9 w-9 place-items-center rounded-xl border border-border/60 bg-background text-primary"><Clock3 className="h-3.5 w-3.5" /></span><div className="min-w-0 pt-0.5"><p className="text-xs font-black">{event.title}</p>{event.description && <p className="mt-0.5 text-[10px] leading-relaxed text-muted-foreground">{event.description}</p>}<p className="mt-1 text-[9px] font-semibold text-muted-foreground">{memberName(event.actor_id)} · {formatWhen(event.occurred_at)}</p></div></div>)}</div> : <div className="rounded-2xl border border-dashed border-border/60 bg-muted/20 p-4 text-center text-xs text-muted-foreground">The first status, assignment or completion update will appear here.</div>}
    </section>
  );
}

function DispatchLane({ label, hint, icon: Icon, count, tone, children }: { label: string; hint: string; icon: any; count: number; tone: "ready" | "planned" | "route"; children: React.ReactNode }) {
  const toneClass = tone === "route" ? "bg-emerald-500" : tone === "planned" ? "bg-violet-500" : "bg-cyan-500";
  return (
    <section className="fulfillment-lane flex min-h-[460px] min-w-0 flex-col overflow-hidden rounded-[28px] border border-border/60 bg-card/72 shadow-sm">
      <header className="shrink-0 border-b border-border/55 px-4 py-4">
        <div className="flex items-center justify-between gap-3"><div className="flex min-w-0 items-center gap-3"><span className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-2xl text-white shadow-lg", toneClass)}><Icon className="h-4 w-4" /></span><div className="min-w-0"><h2 className="truncate text-sm font-black">{label}</h2><p className="truncate text-[10px] text-muted-foreground">{hint}</p></div></div><Badge variant="secondary" className="rounded-full">{count}</Badge></div>
      </header>
      <div className="fulfillment-lane-scroll min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
        {count ? children : <div className="grid min-h-56 place-items-center rounded-3xl border border-dashed border-border/60 bg-muted/20 p-6 text-center"><div><CheckCircle2 className="mx-auto h-7 w-7 text-emerald-500/55" /><p className="mt-3 text-xs font-bold">Lane clear</p><p className="mt-1 text-[10px] text-muted-foreground">New work appears here live.</p></div></div>}
      </div>
    </section>
  );
}

function DeliveryDispatchCard({ order, memberName, selected, onToggle, onToggleUrgent, onOpen, onClaim, onAdvance }: { order: FulfillmentOrder; memberName: (id: string | null | undefined) => string; selected: boolean; onToggle: () => void; onToggleUrgent: () => void; onOpen: () => void; onClaim: () => void; onAdvance: () => void }) {
  const visibleItems = order.items.filter((item) => readyUnits(item) > 0);
  const units = visibleItems.reduce((sum, item) => sum + readyUnits(item), 0);
  const overdue = isOverdue(order.fulfillment_scheduled_for);
  const actionLabel = order.fulfillment_status === "scheduled" ? "Send on route" : order.fulfillment_status === "out-for-delivery" ? "Complete" : "Plan route";
  return (
    <article onClick={onOpen} className={cn("group cursor-pointer rounded-[22px] border bg-background/82 p-3.5 shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/25 hover:shadow-lg", selected ? "border-primary/35 ring-2 ring-primary/10" : "border-border/55", order.urgency === "urgent" && "border-l-4 border-l-destructive")}>
      <div className="flex items-start gap-3"><span onClick={(event) => { event.stopPropagation(); onToggle(); }} className="pt-0.5"><Checkbox checked={selected} /></span><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-1.5"><h3 className="font-black text-primary">{order.order_number}</h3>{order.urgency === "urgent" && <Badge variant="destructive" className="h-5 text-[9px]">Urgent</Badge>}</div><p className="mt-1 truncate text-sm font-semibold">{order.companyName}</p>{order.reference && <p className="mt-0.5 truncate text-[10px] text-muted-foreground">SO {order.reference}</p>}</div><ChevronRight className="mt-1 h-4 w-4 text-muted-foreground/25 transition-transform group-hover:translate-x-0.5 group-hover:text-primary" /></div>
      <div className="mt-3 grid grid-cols-2 gap-2"><div className="rounded-xl bg-muted/40 px-3 py-2"><p className="text-lg font-black">{units}</p><p className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">units ready</p></div><div className="rounded-xl bg-muted/40 px-3 py-2"><p className="text-lg font-black">{visibleItems.length}</p><p className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">package lines</p></div></div>
      <div className="mt-3 space-y-1.5 text-[10px] text-muted-foreground"><p className="flex items-center gap-1.5"><UserRound className="h-3 w-3" /><span className={cn(!order.fulfillment_assigned_to && "font-semibold text-amber-600")}>{memberName(order.fulfillment_assigned_to)}</span></p><p className={cn("flex items-center gap-1.5", overdue && "font-semibold text-destructive")}><CalendarClock className="h-3 w-3" />{order.fulfillment_scheduled_for ? `${overdue ? "Late · " : ""}${formatWhen(order.fulfillment_scheduled_for)}` : `Waiting ${ageInDays(order.created_at)}d · not scheduled`}</p></div>
      <div className="mt-3 flex gap-2 border-t border-border/50 pt-3"><Button variant="ghost" size="sm" aria-label={order.urgency === "urgent" ? "Remove urgent priority" : "Mark urgent"} className={cn("h-8 rounded-xl px-2.5 text-[10px]", order.urgency === "urgent" && "bg-destructive/10 text-destructive hover:bg-destructive/15 hover:text-destructive")} onClick={(event) => { event.stopPropagation(); onToggleUrgent(); }}><CircleAlert className="mr-1 h-3 w-3" />Urgent</Button>{!order.fulfillment_assigned_to && <Button variant="outline" size="sm" className="h-8 rounded-xl px-2.5 text-[10px]" onClick={(event) => { event.stopPropagation(); onClaim(); }}><UserCheck className="mr-1 h-3 w-3" />Claim</Button>}<Button size="sm" className="ml-auto h-8 rounded-xl px-3 text-[10px]" onClick={(event) => { event.stopPropagation(); onAdvance(); }}>{actionLabel}<ArrowRight className="ml-1 h-3 w-3" /></Button></div>
    </article>
  );
}

function CollectionDispatchCard({ po, memberName, selected, onToggle, onToggleUrgent, onOpen, onClaim, onAdvance }: { po: CollectionPOView; memberName: (id: string | null | undefined) => string; selected: boolean; onToggle: () => void; onToggleUrgent: () => void; onOpen: () => void; onClaim: () => void; onAdvance: () => void }) {
  const overdue = isOverdue(po.state?.scheduled_for || po.expectedDeliveryDate);
  const status = po.state?.status || "pending";
  return (
    <article onClick={onOpen} className={cn("group cursor-pointer rounded-[22px] border bg-background/82 p-3.5 shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/25 hover:shadow-lg", selected ? "border-violet-500/40 ring-2 ring-violet-500/10" : "border-border/55", po.state?.is_urgent && "border-l-4 border-l-destructive")}>
      <div className="flex items-start gap-3"><span onClick={(event) => { event.stopPropagation(); onToggle(); }} className="pt-0.5"><Checkbox checked={selected} /></span><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-1.5"><h3 className="font-black text-primary">{po.purchaseOrderNumber}</h3><Badge variant="outline" className="h-5 border-violet-500/25 bg-violet-500/10 px-1.5 text-[8px] font-black uppercase text-violet-700">Collection</Badge>{po.state?.is_urgent && <Badge variant="destructive" className="h-5 text-[9px]">Urgent</Badge>}{overdue && <Badge variant="destructive" className="h-5 text-[9px]">Late</Badge>}</div><p className="mt-1 truncate text-sm font-semibold">{po.vendorName}</p><div className="mt-1 flex flex-wrap items-center gap-1.5"><p className="text-[10px] text-muted-foreground">PO {po.date || "date unknown"}</p><Badge variant="outline" className="h-5 px-1.5 text-[8px]">{po.state?.collection_method === "supplier-delivery" ? "Supplier delivery" : "Our pickup"}</Badge></div></div><ChevronRight className="mt-1 h-4 w-4 text-muted-foreground/25 transition-transform group-hover:translate-x-0.5 group-hover:text-primary" /></div>
      <div className="mt-3 flex items-end justify-between rounded-2xl bg-gradient-to-r from-violet-500/10 to-primary/5 p-3"><div><p className="text-2xl font-black">{po.remainingUnits}</p><p className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">units left to collect</p></div><div className="text-right"><p className="text-xs font-bold">{formatMoneySafe(po.outstandingValue)}</p><p className="text-[9px] text-muted-foreground">open value</p></div></div>
      <div className="mt-3 space-y-1.5 text-[10px] text-muted-foreground"><p className="flex items-center gap-1.5"><UserRound className="h-3 w-3" /><span className={cn(!po.state?.assigned_to && "font-semibold text-amber-600")}>{memberName(po.state?.assigned_to)}</span></p><p className={cn("flex items-center gap-1.5", overdue && "font-semibold text-destructive")}><CalendarClock className="h-3 w-3" />{po.state?.scheduled_for ? `${overdue ? "Late · " : ""}${formatWhen(po.state.scheduled_for)}` : po.expectedDeliveryDate ? `Expected ${po.expectedDeliveryDate}` : "Not scheduled"}</p>{po.collectedUnits > 0 && <p className="flex items-center gap-1.5 font-semibold text-emerald-600"><Archive className="h-3 w-3" />{po.collectedUnits} units collected before</p>}</div>
      <div className="mt-3 flex gap-2 border-t border-border/50 pt-3"><Button variant="ghost" size="sm" aria-label={po.state?.is_urgent ? "Remove urgent priority" : "Mark urgent"} className={cn("h-8 rounded-xl px-2.5 text-[10px]", po.state?.is_urgent && "bg-destructive/10 text-destructive hover:bg-destructive/15 hover:text-destructive")} onClick={(event) => { event.stopPropagation(); onToggleUrgent(); }}><CircleAlert className="mr-1 h-3 w-3" />Urgent</Button>{!po.state?.assigned_to && <Button variant="outline" size="sm" className="h-8 rounded-xl px-2.5 text-[10px]" onClick={(event) => { event.stopPropagation(); onClaim(); }}><UserCheck className="mr-1 h-3 w-3" />Claim</Button>}<Button size="sm" className="ml-auto h-8 rounded-xl px-3 text-[10px]" onClick={(event) => { event.stopPropagation(); onAdvance(); }}>{status === "collecting" ? "Record quantities" : po.state?.collection_method === "supplier-delivery" ? "Receive delivery" : "Start pickup"}<ArrowRight className="ml-1 h-3 w-3" /></Button></div>
    </article>
  );
}

function Field({ label, icon: Icon, children }: { label: string; icon: any; children: React.ReactNode }) {
  return <div><label className="mb-1.5 flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider text-muted-foreground"><Icon className="h-3.5 w-3.5" />{label}</label>{children}</div>;
}

function EmptyState({ icon: Icon, title, body }: { icon: any; title: string; body: string }) {
  return <div className="rounded-3xl border border-dashed border-border/70 bg-card/50 px-6 py-16 text-center"><Icon className="mx-auto h-10 w-10 text-muted-foreground/40" /><h3 className="mt-4 font-bold">{title}</h3><p className="mx-auto mt-1 max-w-xl text-sm text-muted-foreground">{body}</p></div>;
}

function HistoryPanel({
  mode,
  onModeChange,
  deliveries,
  collectionEvents,
  collectionEventLines,
  memberName,
}: {
  mode: "delivery" | "collection";
  onModeChange: (mode: "delivery" | "collection") => void;
  deliveries: FulfillmentOrder[];
  collectionEvents: CollectionEvent[];
  collectionEventLines: CollectionEventLine[];
  memberName: (id: string | null | undefined) => string;
}) {
  const linesByEvent = useMemo(() => {
    const map = new Map<string, CollectionEventLine[]>();
    collectionEventLines.forEach((line) => map.set(line.event_id, [...(map.get(line.event_id) || []), line]));
    return map;
  }, [collectionEventLines]);

  return (
    <section className="space-y-4">
      <div className="flex flex-col gap-3 rounded-2xl border border-border/60 bg-card/75 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div><p className="text-xs font-black uppercase tracking-[0.16em] text-primary">Fulfillment archive</p><h2 className="mt-1 text-xl font-black">Collections & Delivery History</h2></div>
        <div className="grid grid-cols-2 gap-1 rounded-xl bg-muted/50 p-1"><button onClick={() => onModeChange("collection")} className={cn("rounded-lg px-4 py-2 text-sm font-bold", mode === "collection" ? "bg-background text-primary shadow-sm" : "text-muted-foreground")}>Collections</button><button onClick={() => onModeChange("delivery")} className={cn("rounded-lg px-4 py-2 text-sm font-bold", mode === "delivery" ? "bg-background text-primary shadow-sm" : "text-muted-foreground")}>Deliveries</button></div>
      </div>

      {mode === "collection" ? (
        collectionEvents.length === 0 ? <EmptyState icon={Archive} title="No collection history yet" body="Every partial or complete PO collection will be stored here permanently." /> : (
          <div className="space-y-3">{collectionEvents.map((event) => {
            const lines = linesByEvent.get(event.id) || [];
            return <Card key={event.id} className="rounded-2xl border-border/60"><CardContent className="p-4 sm:p-5"><div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><div className="flex flex-wrap items-center gap-2"><h3 className="font-black text-primary">{event.purchase_order_number}</h3><Badge variant={event.fully_collected ? "default" : "secondary"}>{event.fully_collected ? "PO fully collected" : "Partial collection"}</Badge></div><p className="mt-1 text-sm font-semibold">{event.vendor_name}</p><p className="mt-1 text-xs text-muted-foreground">Collected by {memberName(event.collected_by)} · {formatWhen(event.collected_at)}</p></div><div className="text-right"><p className="text-2xl font-black">{event.total_units}</p><p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">units this trip</p></div></div><div className="mt-4 grid gap-2 sm:grid-cols-2">{lines.map((line) => <div key={`${event.id}-${line.line_key}`} className="rounded-xl bg-muted/40 px-3 py-2"><p className="text-sm font-semibold">{line.name}</p><p className="mt-0.5 text-xs text-muted-foreground">{line.sku ? `${line.sku} · ` : ""}{line.quantity_collected} collected</p></div>)}</div>{event.notes && <p className="mt-3 rounded-xl border border-border/50 bg-background/60 px-3 py-2 text-xs text-muted-foreground">{event.notes}</p>}</CardContent></Card>;
          })}</div>
        )
      ) : deliveries.length === 0 ? <EmptyState icon={Truck} title="No delivery history yet" body="Completed customer deliveries are stored here." /> : (
        <div className="grid gap-3 lg:grid-cols-2">{deliveries.map((order) => <Card key={order.id} className="rounded-2xl border-border/60"><CardContent className="p-4 sm:p-5"><div className="flex items-start justify-between gap-3"><div><h3 className="font-black text-primary">{order.order_number}</h3><p className="mt-1 text-sm font-semibold">{order.companyName}</p><p className="mt-1 text-xs text-muted-foreground">Assigned to {memberName(order.fulfillment_assigned_to)} · completed {formatWhen(order.completed_date)}</p></div><Badge><CheckCircle2 className="mr-1 h-3 w-3" />Delivered</Badge></div></CardContent></Card>)}</div>
      )}
    </section>
  );
}
