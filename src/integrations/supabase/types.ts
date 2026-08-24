import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Archive,
  CalendarClock,
  CheckCircle2,
  Clock3,
  FileCheck2,
  History,
  PackageCheck,
  RefreshCw,
  Search,
  Sparkles,
  Truck,
  UserRound,
  Users,
  Warehouse,
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
  items: FulfillmentItem[];
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

const PO_CACHE_ID = "00000000-0000-0000-0000-000000000003";

const normalisePoCachePayload = (payload: unknown): ZohoPO[] => {
  const raw = payload as any;
  const list = Array.isArray(raw)
    ? raw
    : Array.isArray(raw?.purchaseOrders)
      ? raw.purchaseOrders
      : Array.isArray(raw?.purchase_orders)
        ? raw.purchase_orders
        : Array.isArray(raw?.data)
          ? raw.data
          : [];

  return list
    .map((po: any) => {
      const linesSource = Array.isArray(po?.lines)
        ? po.lines
        : Array.isArray(po?.line_items)
          ? po.line_items
          : Array.isArray(po?.items)
            ? po.items
            : [];

      const lines: POLine[] = linesSource.map((line: any) => {
        const quantity = Number(line?.quantity ?? line?.qty ?? 0) || 0;
        const quantityBilled = Number(line?.quantityBilled ?? line?.quantity_billed ?? line?.billed_quantity ?? 0) || 0;
        const quantityReceived =
          Number(line?.quantityReceived ?? line?.quantity_received ?? line?.received_quantity ?? 0) || 0;
        const explicitOutstanding = Number(line?.outstanding ?? line?.unbilled_quantity);
        const outstanding = Number.isFinite(explicitOutstanding)
          ? Math.max(0, explicitOutstanding)
          : Math.max(0, quantity - quantityBilled);

        return {
          sku: String(line?.sku ?? line?.item_sku ?? line?.item_code ?? ""),
          name: String(line?.name ?? line?.item_name ?? line?.description ?? "PO item"),
          description: String(line?.description ?? ""),
          quantity,
          quantityReceived,
          quantityBilled,
          outstanding,
          rate: Number(line?.rate ?? 0) || 0,
        };
      });

      const purchaseOrderId = String(po?.purchaseOrderId ?? po?.purchaseorder_id ?? po?.purchase_order_id ?? "").trim();
      if (!purchaseOrderId) return null;

      return {
        purchaseOrderId,
        purchaseOrderNumber: String(
          po?.purchaseOrderNumber ?? po?.purchaseorder_number ?? po?.purchase_order_number ?? purchaseOrderId,
        ),
        vendorId: String(po?.vendorId ?? po?.vendor_id ?? ""),
        vendorName: String(po?.vendorName ?? po?.vendor_name ?? "Unknown supplier"),
        vendorEmail: String(po?.vendorEmail ?? po?.vendor_email ?? ""),
        date: String(po?.date ?? po?.purchase_order_date ?? ""),
        expectedDeliveryDate: po?.expectedDeliveryDate ?? po?.expected_delivery_date ?? null,
        status: String(po?.status ?? ""),
        receivedStatus: String(po?.receivedStatus ?? po?.received_status ?? ""),
        billedStatus: String(po?.billedStatus ?? po?.billed_status ?? ""),
        total: Number(po?.total ?? 0) || 0,
        outstandingValue: Number(po?.outstandingValue ?? po?.outstanding_value ?? 0) || 0,
        lines,
      } as ZohoPO;
    })
    .filter(Boolean) as ZohoPO[];
};

const readyUnits = (item: FulfillmentItem) =>
  Math.max(0, Math.min(item.qty_invoiced ?? 0, item.quantity) - Math.min(item.qty_completed ?? 0, item.quantity));

const poLineKey = (line: Pick<POLine, "sku" | "name" | "description">) => {
  const sku = String(line.sku || "")
    .trim()
    .toLowerCase();
  if (sku) return `sku:${sku}`;
  return `nm:${String(line.name || "")
    .trim()
    .toLowerCase()}|${String(line.description || "")
    .trim()
    .toLowerCase()}`;
};

const formatWhen = (value: string | null | undefined) => {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("en-ZA", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

export default function FulfillmentPage() {
  const { toast } = useToast();
  const { user } = useAuth();

  const [deliveryOrders, setDeliveryOrders] = useState<FulfillmentOrder[]>([]);
  const [deliveryHistory, setDeliveryHistory] = useState<FulfillmentOrder[]>([]);
  const [purchaseOrders, setPurchaseOrders] = useState<ZohoPO[]>([]);
  const [collectionStates, setCollectionStates] = useState<POCollectionState[]>([]);
  const [collectionEvents, setCollectionEvents] = useState<CollectionEvent[]>([]);
  const [collectionEventLines, setCollectionEventLines] = useState<CollectionEventLine[]>([]);
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [settings, setSettings] = useState<FulfillmentSettings>({
    auto_assign_enabled: false,
    default_method: "delivery",
  });

  const [activeMode, setActiveMode] = useState<"delivery" | "collection" | "history">("delivery");
  const [historyMode, setHistoryMode] = useState<"delivery" | "collection">("collection");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [assigning, setAssigning] = useState(false);
  const [collectingId, setCollectingId] = useState<string | null>(null);
  const [collectionDraft, setCollectionDraft] = useState<Record<string, Record<string, number>>>({});
  const [collectionNotes, setCollectionNotes] = useState<Record<string, string>>({});
  const autoAssignLock = useRef(false);

  const memberName = useCallback(
    (id: string | null | undefined) => {
      if (!id) return "Unassigned";
      const member = team.find((candidate) => candidate.id === id);
      return member?.full_name || member?.email || "Team member";
    },
    [team],
  );

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [ordersRes, deliveryHistoryRes, profilesRes, settingsRes, cacheRes, statesRes, eventsRes] =
        await Promise.all([
          supabase
            .from("orders")
            .select(
              "id, order_number, reference, urgency, company_id, created_at, fulfillment_method, fulfillment_status, fulfillment_assigned_to, fulfillment_scheduled_for, fulfillment_notes, fulfillment_routed_at",
            )
            .neq("status", "delivered")
            .order("created_at", { ascending: true }),
          supabase
            .from("orders")
            .select(
              "id, order_number, reference, urgency, company_id, created_at, completed_date, fulfillment_method, fulfillment_status, fulfillment_assigned_to, fulfillment_scheduled_for, fulfillment_notes, fulfillment_routed_at",
            )
            .eq("fulfillment_method", "delivery")
            .eq("fulfillment_status", "completed")
            .order("completed_date", { ascending: false })
            .limit(100),
          supabase.from("profiles").select("id, full_name, email, position").eq("approved", true).order("full_name"),
          supabase
            .from("fulfillment_settings")
            .select("auto_assign_enabled, default_method")
            .eq("id", true)
            .maybeSingle(),
          supabase.from("po_tracking_cache").select("payload, fetched_at").eq("id", PO_CACHE_ID).maybeSingle(),
          supabase
            .from("po_collection_state")
            .select(
              "purchase_order_id, purchase_order_number, vendor_id, vendor_name, assigned_to, status, scheduled_for, notes, completed_at, last_seen_at",
            ),
          supabase
            .from("po_collection_events")
            .select(
              "id, purchase_order_id, purchase_order_number, vendor_id, vendor_name, collected_by, collected_at, total_units, fully_collected, notes",
            )
            .order("collected_at", { ascending: false })
            .limit(250),
        ]);

      if (ordersRes.error) throw ordersRes.error;
      if (deliveryHistoryRes.error) throw deliveryHistoryRes.error;
      if (profilesRes.error) throw profilesRes.error;
      if (settingsRes.error) throw settingsRes.error;
      if (cacheRes.error) throw cacheRes.error;
      if (statesRes.error) throw statesRes.error;
      if (eventsRes.error) throw eventsRes.error;

      const activeBase = ordersRes.data || [];
      const historicBase = deliveryHistoryRes.data || [];
      const allOrderRows = [...activeBase, ...historicBase];
      const ids = [...new Set(allOrderRows.map((order) => order.id))];
      const companyIds = [...new Set(allOrderRows.map((order) => order.company_id).filter(Boolean))] as string[];

      const [itemsRes, companiesRes] = await Promise.all([
        ids.length
          ? supabase
              .from("order_items")
              .select("id, order_id, name, code, quantity, qty_invoiced, qty_completed")
              .in("order_id", ids)
          : Promise.resolve({ data: [], error: null } as any),
        companyIds.length
          ? supabase.from("companies").select("id, name").in("id", companyIds)
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
      const companyMap = new Map((companiesRes.data || []).map((company: any) => [company.id, company.name]));

      const decorateOrder = (order: any): FulfillmentOrder => ({
        ...order,
        fulfillment_method: (order.fulfillment_method || "delivery") as "delivery" | "collection",
        fulfillment_status: (order.fulfillment_status || "pending") as FulfillmentOrder["fulfillment_status"],
        companyName: order.company_id ? companyMap.get(order.company_id) || "Unknown client" : "No client",
        items: itemMap.get(order.id) || [],
      });

      const readyDeliveries = activeBase
        .map(decorateOrder)
        .filter(
          (order) =>
            order.fulfillment_method === "delivery" &&
            order.items.some((item) => readyUnits(item) > 0) &&
            order.fulfillment_status !== "completed",
        );

      const historyDeliveries = historicBase.map(decorateOrder);
      const poPayload = normalisePoCachePayload(cacheRes.data?.payload);
      const eventRows = (eventsRes.data || []) as CollectionEvent[];
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
      setPurchaseOrders(poPayload);
      setCollectionStates((statesRes.data || []) as POCollectionState[]);
      setCollectionEvents(eventRows);
      setCollectionEventLines((linesRes.data || []) as CollectionEventLine[]);
      setTeam((profilesRes.data || []) as TeamMember[]);
      if (settingsRes.data) setSettings(settingsRes.data as FulfillmentSettings);

      // Ensure every current unbilled PO has a persistent assignment/state row.
      const knownIds = new Set((statesRes.data || []).map((row: any) => row.purchase_order_id));
      const missing = poPayload.filter(
        (po) =>
          !knownIds.has(po.purchaseOrderId) && po.lines.some((line) => Math.max(0, Number(line.outstanding || 0)) > 0),
      );
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
      toast({
        title: "Could not load fulfillment",
        description: error.message || "Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void fetchData();
    const channel = supabase
      .channel("fulfillment-workspace-v2")
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, () => void fetchData())
      .on("postgres_changes", { event: "*", schema: "public", table: "order_items" }, () => void fetchData())
      .on("postgres_changes", { event: "*", schema: "public", table: "po_tracking_cache" }, () => void fetchData())
      .on("postgres_changes", { event: "*", schema: "public", table: "po_collection_state" }, () => void fetchData())
      .on("postgres_changes", { event: "*", schema: "public", table: "po_collection_events" }, () => void fetchData())
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [fetchData]);

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

  const collectionQueue = useMemo<CollectionPOView[]>(() => {
    const stateMap = new Map(collectionStates.map((state) => [state.purchase_order_id, state]));
    return purchaseOrders
      .map((po) => {
        const linesView = (po.lines || []).map((line) => {
          const key = poLineKey(line);
          const collected = collectedByLine.get(`${po.purchaseOrderId}::${key}`) || 0;
          const currentUnbilled = Math.max(0, Number(line.outstanding || 0));
          const remaining = Math.max(0, currentUnbilled - collected);
          return { ...line, key, collected, remaining };
        });
        const remainingUnits = linesView.reduce((sum, line) => sum + line.remaining, 0);
        const collectedUnits = linesView.reduce(
          (sum, line) => sum + Math.min(line.collected, Math.max(0, Number(line.outstanding || 0))),
          0,
        );
        return { ...po, state: stateMap.get(po.purchaseOrderId) || null, linesView, remainingUnits, collectedUnits };
      })
      .filter((po) => po.remainingUnits > 0)
      .sort((a, b) => (a.expectedDeliveryDate || a.date || "").localeCompare(b.expectedDeliveryDate || b.date || ""));
  }, [purchaseOrders, collectionStates, collectedByLine]);

  const updateDelivery = async (orderId: string, patch: Record<string, unknown>) => {
    const previous = deliveryOrders;
    setDeliveryOrders((current) =>
      current.map((order) => (order.id === orderId ? ({ ...order, ...patch } as FulfillmentOrder) : order)),
    );
    const { error } = await supabase
      .from("orders")
      .update(patch as any)
      .eq("id", orderId);
    if (error) {
      setDeliveryOrders(previous);
      toast({ title: "Update failed", description: error.message, variant: "destructive" });
      return false;
    }
    return true;
  };

  const updateCollectionState = async (po: CollectionPOView, patch: Partial<POCollectionState>) => {
    const { error } = await supabase.from("po_collection_state").upsert(
      {
        purchase_order_id: po.purchaseOrderId,
        purchase_order_number: po.purchaseOrderNumber,
        vendor_id: po.vendorId || null,
        vendor_name: po.vendorName || "Unknown supplier",
        ...patch,
        updated_at: new Date().toISOString(),
        last_seen_at: new Date().toISOString(),
      } as any,
      { onConflict: "purchase_order_id" },
    );
    if (error) {
      toast({ title: "Collection update failed", description: error.message, variant: "destructive" });
      return false;
    }
    await fetchData();
    return true;
  };

  const saveSettings = async (patch: Partial<FulfillmentSettings>) => {
    const next = { ...settings, ...patch };
    setSettings(next);
    const { error } = await supabase
      .from("fulfillment_settings")
      .upsert({ id: true, ...next, updated_at: new Date().toISOString(), updated_by: user?.id || null } as any, {
        onConflict: "id",
      });
    if (error) toast({ title: "Settings not saved", description: error.message, variant: "destructive" });
  };

  const autoAssignCollections = useCallback(async () => {
    if (autoAssignLock.current || team.length === 0 || collectionQueue.length === 0) return;
    const unassigned = collectionQueue.filter((po) => !po.state?.assigned_to);
    if (!unassigned.length) return;
    autoAssignLock.current = true;
    setAssigning(true);
    try {
      const load = new Map(
        team.map((member) => [member.id, collectionQueue.filter((po) => po.state?.assigned_to === member.id).length]),
      );
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
      toast({
        title: "Collections assigned",
        description: `${unassigned.length} PO${unassigned.length === 1 ? "" : "s"} balanced across the team.`,
      });
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
    try {
      await Promise.all(
        readyItems.map((item) =>
          supabase
            .from("order_items")
            .update({
              qty_completed: Math.min(item.qty_invoiced ?? 0, item.quantity),
              updated_at: new Date().toISOString(),
            } as any)
            .eq("id", item.id)
            .throwOnError(),
        ),
      );
      const completedIds = new Set(readyItems.map((item) => item.id));
      const fullyDone =
        order.items.length > 0 &&
        order.items.every((item) => {
          const projected = completedIds.has(item.id)
            ? Math.min(item.qty_invoiced ?? 0, item.quantity)
            : Math.min(item.qty_completed ?? 0, item.quantity);
          return projected >= item.quantity;
        });
      const orderPatch = fullyDone
        ? {
            fulfillment_status: "completed",
            status: "delivered",
            completed_date: new Date().toISOString(),
            fulfillment_scheduled_for: null,
          }
        : { fulfillment_status: "pending", fulfillment_scheduled_for: null };
      const { error } = await supabase
        .from("orders")
        .update(orderPatch as any)
        .eq("id", order.id);
      if (error) throw error;
      toast({
        title: "Delivery completed",
        description: fullyDone
          ? `${order.order_number} moved to Delivery History.`
          : `Ready quantities completed. Remaining items stay active.`,
      });
      await fetchData();
    } catch (error: any) {
      toast({
        title: "Could not complete delivery",
        description: error.message || "Please try again.",
        variant: "destructive",
      });
    }
  };

  const setDraftQty = (poId: string, key: string, value: number, max: number) => {
    const safe = Math.max(0, Math.min(Number.isFinite(value) ? value : 0, max));
    setCollectionDraft((current) => ({ ...current, [poId]: { ...(current[poId] || {}), [key]: safe } }));
  };

  const collectAllRemaining = (po: CollectionPOView) => {
    const next: Record<string, number> = {};
    po.linesView
      .filter((line) => line.remaining > 0)
      .forEach((line) => {
        next[line.key] = line.remaining;
      });
    setCollectionDraft((current) => ({ ...current, [po.purchaseOrderId]: next }));
  };

  const markCollected = async (po: CollectionPOView) => {
    if (!user?.id) {
      toast({
        title: "Sign in required",
        description: "The person collecting the PO must be signed in before marking it collected.",
        variant: "destructive",
      });
      return;
    }
    const draft = collectionDraft[po.purchaseOrderId] || {};
    const picked = po.linesView
      .map((line) => ({ line, qty: Math.max(0, Math.min(Number(draft[line.key] || 0), line.remaining)) }))
      .filter(({ qty }) => qty > 0);
    if (!picked.length) {
      toast({
        title: "Enter collected quantities",
        description: "Enter what was actually collected, or use Collect all remaining.",
      });
      return;
    }

    setCollectingId(po.purchaseOrderId);
    try {
      const totalUnits = picked.reduce((sum, row) => sum + row.qty, 0);
      const remainingAfter = po.remainingUnits - totalUnits;
      const fullyCollected = remainingAfter <= 0.000001;
      const notes = (collectionNotes[po.purchaseOrderId] || "").trim() || null;

      const { data: event, error: eventError } = await supabase
        .from("po_collection_events")
        .insert({
          purchase_order_id: po.purchaseOrderId,
          purchase_order_number: po.purchaseOrderNumber,
          vendor_id: po.vendorId || null,
          vendor_name: po.vendorName || "Unknown supplier",
          collected_by: user.id,
          total_units: totalUnits,
          fully_collected: fullyCollected,
          notes,
          source_snapshot: po as any,
        } as any)
        .select("id")
        .single();
      if (eventError) throw eventError;

      const { error: linesError } = await supabase.from("po_collection_event_lines").insert(
        picked.map(({ line, qty }) => ({
          event_id: event.id,
          line_key: line.key,
          sku: line.sku || null,
          name: line.name || line.description || "PO item",
          description: line.description || null,
          quantity_collected: qty,
          source_unbilled_quantity: line.outstanding,
        })) as any,
      );
      if (linesError) throw linesError;

      const { error: stateError } = await supabase.from("po_collection_state").upsert(
        {
          purchase_order_id: po.purchaseOrderId,
          purchase_order_number: po.purchaseOrderNumber,
          vendor_id: po.vendorId || null,
          vendor_name: po.vendorName || "Unknown supplier",
          assigned_to: po.state?.assigned_to || user.id,
          status: fullyCollected ? "collected" : "pending",
          scheduled_for: fullyCollected ? null : po.state?.scheduled_for || null,
          completed_at: fullyCollected ? new Date().toISOString() : null,
          notes: po.state?.notes || null,
          last_seen_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        } as any,
        { onConflict: "purchase_order_id" },
      );
      if (stateError) throw stateError;

      setCollectionDraft((current) => ({ ...current, [po.purchaseOrderId]: {} }));
      setCollectionNotes((current) => ({ ...current, [po.purchaseOrderId]: "" }));
      toast({
        title: fullyCollected ? "PO fully collected" : "Partial collection saved",
        description: fullyCollected
          ? `${po.purchaseOrderNumber} moved to Collection History.`
          : `${totalUnits} unit${totalUnits === 1 ? "" : "s"} archived. ${remainingAfter} still waiting, so the PO remains in Collections.`,
      });
      await fetchData();
    } catch (error: any) {
      toast({
        title: "Could not save collection",
        description: error.message || "Please try again.",
        variant: "destructive",
      });
    } finally {
      setCollectingId(null);
    }
  };

  const deliveryFiltered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return deliveryOrders.filter((order) => {
      if (!needle) return true;
      return [
        order.order_number,
        order.reference,
        order.companyName,
        ...order.items.map((item) => `${item.code || ""} ${item.name}`),
      ]
        .join(" ")
        .toLowerCase()
        .includes(needle);
    });
  }, [deliveryOrders, query]);

  const collectionFiltered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return collectionQueue.filter((po) => {
      if (!needle) return true;
      return [
        po.purchaseOrderNumber,
        po.vendorName,
        ...po.linesView.map((line) => `${line.sku || ""} ${line.name} ${line.description || ""}`),
      ]
        .join(" ")
        .toLowerCase()
        .includes(needle);
    });
  }, [collectionQueue, query]);

  const counts = useMemo(
    () => ({
      delivery: deliveryOrders.length,
      collection: collectionQueue.length,
      unassignedCollections: collectionQueue.filter((po) => !po.state?.assigned_to).length,
      deliveryHistory: deliveryHistory.length,
      collectionHistory: collectionEvents.length,
    }),
    [deliveryOrders, collectionQueue, deliveryHistory, collectionEvents],
  );

  return (
    <div className="aleph-page-workspace space-y-5">
      <section className="overflow-hidden rounded-[28px] border border-border/60 bg-card/85 shadow-sm backdrop-blur-xl">
        <div className="border-b border-border/50 bg-gradient-to-r from-primary/10 via-transparent to-sky-500/10 p-5 sm:p-6">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.18em] text-primary">
                <Truck className="h-4 w-4" />
                Fulfillment control
              </div>
              <h1 className="mt-2 text-2xl font-black tracking-tight sm:text-3xl">
                Delivery, supplier collections & history
              </h1>
              <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
                Deliveries come from ready customer orders. Collections are matched automatically to recent Zoho
                purchase-order quantities that still have no valid supplier bill covering them.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" className="rounded-xl" onClick={() => void fetchData()} disabled={loading}>
                <RefreshCw className={cn("mr-2 h-4 w-4", loading && "animate-spin")} />
                Refresh
              </Button>
              <Button
                className="rounded-xl"
                onClick={() => void autoAssignCollections()}
                disabled={assigning || !collectionQueue.length}
              >
                <Sparkles className="mr-2 h-4 w-4" />
                {assigning ? "Assigning…" : "Auto assign collections"}
              </Button>
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
            <div
              key={label}
              className="flex items-center gap-3 rounded-2xl border border-border/50 bg-background/70 p-3"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <Icon className="h-4.5 w-4.5" />
              </div>
              <div>
                <p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">{label}</p>
                <p className="text-xl font-black">{value}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-border/60 bg-card/75 p-3 shadow-sm sm:p-4">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="grid grid-cols-3 gap-1 rounded-2xl bg-muted/50 p-1">
            <button
              onClick={() => setActiveMode("delivery")}
              className={cn(
                "flex items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-sm font-bold transition-all",
                activeMode === "delivery"
                  ? "bg-background text-primary shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Truck className="h-4 w-4" />
              <span className="hidden sm:inline">Delivery</span>
              <Badge variant="secondary">{counts.delivery}</Badge>
            </button>
            <button
              onClick={() => setActiveMode("collection")}
              className={cn(
                "flex items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-sm font-bold transition-all",
                activeMode === "collection"
                  ? "bg-background text-primary shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Warehouse className="h-4 w-4" />
              <span className="hidden sm:inline">Collection</span>
              <Badge variant="secondary">{counts.collection}</Badge>
            </button>
            <button
              onClick={() => setActiveMode("history")}
              className={cn(
                "flex items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-sm font-bold transition-all",
                activeMode === "history"
                  ? "bg-background text-primary shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <History className="h-4 w-4" />
              <span className="hidden sm:inline">History</span>
            </button>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            {activeMode !== "history" && (
              <div className="relative min-w-0 sm:w-80">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={activeMode === "collection" ? "Search supplier, PO or item…" : "Search delivery orders…"}
                  className="rounded-xl pl-9"
                />
              </div>
            )}
            <div className="flex items-center gap-2 rounded-xl border border-border/60 px-3 py-2">
              <Switch
                checked={settings.auto_assign_enabled}
                onCheckedChange={(checked) => void saveSettings({ auto_assign_enabled: checked })}
              />
              <div>
                <p className="text-xs font-bold">Auto assign</p>
                <p className="text-[10px] text-muted-foreground">Balance new work</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {loading ? (
        <div className="grid gap-3 lg:grid-cols-2">
          {[0, 1, 2, 3].map((n) => (
            <div key={n} className="h-64 animate-pulse rounded-3xl bg-muted/50" />
          ))}
        </div>
      ) : activeMode === "delivery" ? (
        deliveryFiltered.length === 0 ? (
          <EmptyState
            icon={Truck}
            title="No deliveries waiting"
            body="Customer orders appear here when quantities reach Ready for Delivery."
          />
        ) : (
          <div className="grid gap-4 xl:grid-cols-2">
            {deliveryFiltered.map((order) => {
              const visibleItems = order.items.filter((item) => readyUnits(item) > 0);
              const unitCount = visibleItems.reduce((sum, item) => sum + readyUnits(item), 0);
              return (
                <Card
                  key={order.id}
                  className="overflow-hidden rounded-3xl border-border/60 bg-card/90 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-xl"
                >
                  <CardContent className="p-0">
                    <div className="flex items-start justify-between gap-3 border-b border-border/50 p-4 sm:p-5">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-lg font-black text-primary">{order.order_number}</h3>
                          {order.reference && <Badge variant="outline">SO: {order.reference}</Badge>}
                          {order.urgency === "urgent" && <Badge variant="destructive">Urgent</Badge>}
                        </div>
                        <p className="mt-1 truncate text-sm font-semibold">{order.companyName}</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {visibleItems.length} line{visibleItems.length === 1 ? "" : "s"} · {unitCount} unit
                          {unitCount === 1 ? "" : "s"} ready
                        </p>
                      </div>
                      <Badge variant="secondary" className="rounded-full">
                        {order.fulfillment_status === "out-for-delivery"
                          ? "Out for delivery"
                          : order.fulfillment_status === "scheduled"
                            ? "Scheduled"
                            : "Ready"}
                      </Badge>
                    </div>
                    <div className="space-y-2 p-4 sm:p-5">
                      {visibleItems.map((item) => (
                        <div key={item.id} className="flex items-start gap-3 rounded-2xl bg-muted/40 px-3 py-2.5">
                          <div className="rounded-xl bg-primary/10 px-2 py-1 text-xs font-black text-primary">
                            ×{readyUnits(item)}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="break-words text-sm font-semibold">{item.name}</p>
                            {item.code && (
                              <p className="mt-0.5 font-mono text-[10px] text-muted-foreground">{item.code}</p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="grid gap-3 border-t border-border/50 bg-muted/20 p-4 sm:grid-cols-2 sm:p-5">
                      <Field label="Assigned to" icon={UserRound}>
                        <Select
                          value={order.fulfillment_assigned_to || "unassigned"}
                          onValueChange={(value) =>
                            void updateDelivery(order.id, {
                              fulfillment_assigned_to: value === "unassigned" ? null : value,
                            })
                          }
                        >
                          <SelectTrigger className="rounded-xl">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="unassigned">Unassigned</SelectItem>
                            {team.map((member) => (
                              <SelectItem key={member.id} value={member.id}>
                                {member.full_name || member.email || "Team member"}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </Field>
                      <Field label="Status" icon={Clock3}>
                        <Select
                          value={order.fulfillment_status}
                          onValueChange={(value) => void updateDelivery(order.id, { fulfillment_status: value })}
                        >
                          <SelectTrigger className="rounded-xl">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="pending">Ready</SelectItem>
                            <SelectItem value="scheduled">Scheduled</SelectItem>
                            <SelectItem value="out-for-delivery">Out for delivery</SelectItem>
                          </SelectContent>
                        </Select>
                      </Field>
                      <Field label="Schedule" icon={CalendarClock}>
                        <Input
                          type="datetime-local"
                          className="rounded-xl"
                          value={
                            order.fulfillment_scheduled_for
                              ? new Date(order.fulfillment_scheduled_for).toISOString().slice(0, 16)
                              : ""
                          }
                          onChange={(e) =>
                            void updateDelivery(order.id, {
                              fulfillment_scheduled_for: e.target.value ? new Date(e.target.value).toISOString() : null,
                              fulfillment_status: e.target.value ? "scheduled" : order.fulfillment_status,
                            })
                          }
                        />
                      </Field>
                      <div className="sm:col-span-2">
                        <label className="mb-1.5 text-[10px] font-black uppercase tracking-wider text-muted-foreground">
                          Delivery notes
                        </label>
                        <Textarea
                          defaultValue={order.fulfillment_notes || ""}
                          placeholder="Add delivery instructions…"
                          className="min-h-20 resize-none rounded-xl"
                          onBlur={(e) => {
                            if (e.target.value !== (order.fulfillment_notes || ""))
                              void updateDelivery(order.id, { fulfillment_notes: e.target.value || null });
                          }}
                        />
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/50 p-4 sm:px-5">
                      <p className="text-xs text-muted-foreground">
                        {order.fulfillment_assigned_to
                          ? `Assigned to ${memberName(order.fulfillment_assigned_to)}`
                          : "Needs an assignee"}
                      </p>
                      <Button size="sm" className="rounded-xl" onClick={() => void completeDelivery(order)}>
                        <CheckCircle2 className="mr-2 h-4 w-4" />
                        Complete delivery
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )
      ) : activeMode === "collection" ? (
        collectionFiltered.length === 0 ? (
          <EmptyState
            icon={Warehouse}
            title="No supplier collections waiting"
            body="This lane is fed from recent Zoho POs with unbilled quantities. Fully collected POs move to Collection History automatically."
          />
        ) : (
          <div className="grid gap-4 xl:grid-cols-2">
            {collectionFiltered.map((po) => {
              const draft = collectionDraft[po.purchaseOrderId] || {};
              const draftTotal = po.linesView.reduce(
                (sum, line) => sum + Math.max(0, Math.min(Number(draft[line.key] || 0), line.remaining)),
                0,
              );
              return (
                <Card
                  key={po.purchaseOrderId}
                  className="overflow-hidden rounded-3xl border-border/60 bg-card/90 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-xl"
                >
                  <CardContent className="p-0">
                    <div className="border-b border-border/50 bg-gradient-to-r from-violet-500/8 via-transparent to-primary/8 p-4 sm:p-5">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="text-lg font-black text-primary">{po.purchaseOrderNumber}</h3>
                            <Badge className="bg-blue-500/10 text-blue-700 dark:text-blue-300" variant="outline">
                              <FileCheck2 className="mr-1 h-3 w-3" />
                              Unbilled PO
                            </Badge>
                          </div>
                          <p className="mt-1 truncate text-sm font-semibold">{po.vendorName}</p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            PO date {po.date || "—"}
                            {po.expectedDeliveryDate ? ` · expected ${po.expectedDeliveryDate}` : ""}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-2xl font-black">{po.remainingUnits}</p>
                          <p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">
                            units left
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-2 p-4 sm:p-5">
                      {po.linesView
                        .filter((line) => line.remaining > 0)
                        .map((line) => (
                          <div
                            key={line.key}
                            className="grid gap-3 rounded-2xl bg-muted/40 p-3 sm:grid-cols-[minmax(0,1fr)_110px] sm:items-center"
                          >
                            <div className="min-w-0">
                              <p className="break-words text-sm font-semibold">{line.name || line.description}</p>
                              {line.sku && (
                                <p className="mt-0.5 font-mono text-[10px] text-muted-foreground">{line.sku}</p>
                              )}
                              <div className="mt-1 flex flex-wrap gap-2 text-[10px] text-muted-foreground">
                                <span>{line.outstanding} unbilled</span>
                                {line.collected > 0 && (
                                  <span className="font-bold text-emerald-600">{line.collected} already collected</span>
                                )}
                                <span className="font-bold text-primary">{line.remaining} remaining</span>
                              </div>
                            </div>
                            <div>
                              <label className="mb-1 block text-[9px] font-black uppercase tracking-wider text-muted-foreground">
                                Collected now
                              </label>
                              <Input
                                type="number"
                                min={0}
                                max={line.remaining}
                                step="any"
                                value={draft[line.key] ?? ""}
                                onChange={(e) =>
                                  setDraftQty(po.purchaseOrderId, line.key, Number(e.target.value), line.remaining)
                                }
                                placeholder="0"
                                className="rounded-xl"
                              />
                            </div>
                          </div>
                        ))}
                    </div>

                    <div className="grid gap-3 border-t border-border/50 bg-muted/20 p-4 sm:grid-cols-2 sm:p-5">
                      <Field label="Collector / assignee" icon={UserRound}>
                        <Select
                          value={po.state?.assigned_to || "unassigned"}
                          onValueChange={(value) =>
                            void updateCollectionState(po, { assigned_to: value === "unassigned" ? null : value })
                          }
                        >
                          <SelectTrigger className="rounded-xl">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="unassigned">Unassigned</SelectItem>
                            {team.map((member) => (
                              <SelectItem key={member.id} value={member.id}>
                                {member.full_name || member.email || "Team member"}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </Field>
                      <Field label="Collection status" icon={Clock3}>
                        <Select
                          value={po.state?.status === "collected" ? "pending" : po.state?.status || "pending"}
                          onValueChange={(value: POCollectionState["status"]) =>
                            void updateCollectionState(po, { status: value })
                          }
                        >
                          <SelectTrigger className="rounded-xl">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="pending">Pending</SelectItem>
                            <SelectItem value="scheduled">Scheduled</SelectItem>
                            <SelectItem value="collecting">Collecting now</SelectItem>
                          </SelectContent>
                        </Select>
                      </Field>
                      <Field label="Schedule" icon={CalendarClock}>
                        <Input
                          type="datetime-local"
                          className="rounded-xl"
                          value={
                            po.state?.scheduled_for ? new Date(po.state.scheduled_for).toISOString().slice(0, 16) : ""
                          }
                          onChange={(e) =>
                            void updateCollectionState(po, {
                              scheduled_for: e.target.value ? new Date(e.target.value).toISOString() : null,
                              status: e.target.value ? "scheduled" : "pending",
                            })
                          }
                        />
                      </Field>
                      <div className="sm:col-span-2">
                        <label className="mb-1.5 text-[10px] font-black uppercase tracking-wider text-muted-foreground">
                          Collection event note
                        </label>
                        <Textarea
                          value={collectionNotes[po.purchaseOrderId] ?? ""}
                          onChange={(e) =>
                            setCollectionNotes((current) => ({ ...current, [po.purchaseOrderId]: e.target.value }))
                          }
                          placeholder="Optional note: boxes short, back-order, supplier contact, etc."
                          className="min-h-16 resize-none rounded-xl"
                        />
                      </div>
                    </div>

                    <div className="flex flex-col gap-3 border-t border-border/50 p-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
                      <div className="text-xs text-muted-foreground">
                        <p>
                          {po.state?.assigned_to
                            ? `Assigned to ${memberName(po.state.assigned_to)}`
                            : "Needs an assignee"}
                        </p>
                        {po.collectedUnits > 0 && (
                          <p className="mt-0.5 text-emerald-600">
                            {po.collectedUnits} unit{po.collectedUnits === 1 ? "" : "s"} already archived as collected
                          </p>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          className="rounded-xl"
                          onClick={() => collectAllRemaining(po)}
                        >
                          Collect all remaining
                        </Button>
                        <Button
                          size="sm"
                          className="rounded-xl"
                          disabled={collectingId === po.purchaseOrderId || draftTotal <= 0}
                          onClick={() => void markCollected(po)}
                        >
                          <PackageCheck className="mr-2 h-4 w-4" />
                          {collectingId === po.purchaseOrderId ? "Saving…" : `Mark ${draftTotal || ""} collected`}
                        </Button>
                      </div>
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
}

function Field({ label, icon: Icon, children }: { label: string; icon: any; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1.5 flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </label>
      {children}
    </div>
  );
}

function EmptyState({ icon: Icon, title, body }: { icon: any; title: string; body: string }) {
  return (
    <div className="rounded-3xl border border-dashed border-border/70 bg-card/50 px-6 py-16 text-center">
      <Icon className="mx-auto h-10 w-10 text-muted-foreground/40" />
      <h3 className="mt-4 font-bold">{title}</h3>
      <p className="mx-auto mt-1 max-w-xl text-sm text-muted-foreground">{body}</p>
    </div>
  );
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
        <div>
          <p className="text-xs font-black uppercase tracking-[0.16em] text-primary">Fulfillment archive</p>
          <h2 className="mt-1 text-xl font-black">Collections & Delivery History</h2>
        </div>
        <div className="grid grid-cols-2 gap-1 rounded-xl bg-muted/50 p-1">
          <button
            onClick={() => onModeChange("collection")}
            className={cn(
              "rounded-lg px-4 py-2 text-sm font-bold",
              mode === "collection" ? "bg-background text-primary shadow-sm" : "text-muted-foreground",
            )}
          >
            Collections
          </button>
          <button
            onClick={() => onModeChange("delivery")}
            className={cn(
              "rounded-lg px-4 py-2 text-sm font-bold",
              mode === "delivery" ? "bg-background text-primary shadow-sm" : "text-muted-foreground",
            )}
          >
            Deliveries
          </button>
        </div>
      </div>

      {mode === "collection" ? (
        collectionEvents.length === 0 ? (
          <EmptyState
            icon={Archive}
            title="No collection history yet"
            body="Every partial or complete PO collection will be stored here permanently."
          />
        ) : (
          <div className="space-y-3">
            {collectionEvents.map((event) => {
              const lines = linesByEvent.get(event.id) || [];
              return (
                <Card key={event.id} className="rounded-2xl border-border/60">
                  <CardContent className="p-4 sm:p-5">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="font-black text-primary">{event.purchase_order_number}</h3>
                          <Badge variant={event.fully_collected ? "default" : "secondary"}>
                            {event.fully_collected ? "PO fully collected" : "Partial collection"}
                          </Badge>
                        </div>
                        <p className="mt-1 text-sm font-semibold">{event.vendor_name}</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          Collected by {memberName(event.collected_by)} · {formatWhen(event.collected_at)}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-2xl font-black">{event.total_units}</p>
                        <p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">
                          units this trip
                        </p>
                      </div>
                    </div>
                    <div className="mt-4 grid gap-2 sm:grid-cols-2">
                      {lines.map((line) => (
                        <div key={`${event.id}-${line.line_key}`} className="rounded-xl bg-muted/40 px-3 py-2">
                          <p className="text-sm font-semibold">{line.name}</p>
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            {line.sku ? `${line.sku} · ` : ""}
                            {line.quantity_collected} collected
                          </p>
                        </div>
                      ))}
                    </div>
                    {event.notes && (
                      <p className="mt-3 rounded-xl border border-border/50 bg-background/60 px-3 py-2 text-xs text-muted-foreground">
                        {event.notes}
                      </p>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )
      ) : deliveries.length === 0 ? (
        <EmptyState
          icon={Truck}
          title="No delivery history yet"
          body="Completed customer deliveries are stored here."
        />
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {deliveries.map((order) => (
            <Card key={order.id} className="rounded-2xl border-border/60">
              <CardContent className="p-4 sm:p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="font-black text-primary">{order.order_number}</h3>
                    <p className="mt-1 text-sm font-semibold">{order.companyName}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Assigned to {memberName(order.fulfillment_assigned_to)} · completed{" "}
                      {formatWhen(order.completed_date)}
                    </p>
                  </div>
                  <Badge>
                    <CheckCircle2 className="mr-1 h-3 w-3" />
                    Delivered
                  </Badge>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </section>
  );
}
