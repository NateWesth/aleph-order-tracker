import { useState, useEffect, useCallback, useMemo, memo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PullToRefresh } from "@/components/ui/PullToRefresh";
import { useOrderCelebration, ConfettiOverlay } from "@/components/ui/OrderCelebration";
import { playClick, playSuccess } from "@/utils/ambientSounds";
import { Button } from "@/components/ui/button";
import { Plus, Filter, ChevronDown, ChevronUp, Users } from "lucide-react";
import OrderTemplatesDialog from "./components/OrderTemplatesDialog";
import OverdueAlerts from "./components/OverdueAlerts";
import SavedFiltersBar, { type OrderFilter } from "./components/SavedFiltersBar";
import { DndContext, DragOverlay, closestCenter, PointerSensor, useSensor, useSensors, type DragEndEvent, type DragStartEvent } from "@dnd-kit/core";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme, boardSingleColors, colorfulPresets } from "@/contexts/ThemeContext";
import { useGlobalRealtimeOrders } from "./hooks/useGlobalRealtimeOrders";
import { useCompanyData } from "@/components/admin/hooks/useCompanyData";
import OrderForm from "./components/OrderForm";
import OrderStatusColumn from "./components/OrderStatusColumn";
import BulkActionsBar from "./components/BulkActionsBar";
import { PageSkeleton } from "@/components/ui/PageSkeleton";

interface OrdersPageProps {
  isAdmin?: boolean;
  searchTerm?: string;
}

interface OrderItem {
  id: string;
  name: string;
  code: string | null;
  quantity: number;
  stock_status: string;
  qty_on_po?: number;
  qty_received?: number;
  qty_invoiced?: number;
  qty_completed?: number;
  totalQuantity?: number;
}

interface PurchaseOrderInfo {
  id: string;
  supplier_id: string;
  purchase_order_number: string;
  supplierName?: string;
}

interface Order {
  id: string;
  order_number: string;
  description: string | null;
  status: string | null;
  urgency: string | null;
  company_id: string | null;
  user_id: string | null;
  created_at: string | null;
  companyName?: string;
  creatorName?: string;
  items?: OrderItem[];
  purchaseOrders?: PurchaseOrderInfo[];
  /** Which board stage this card represents (an order can appear in several). */
  boardStage?: ItemStage;
}

/** Item-level stages, in flow order. */
type ItemStage = 'awaiting-stock' | 'ordered' | 'in-stock' | 'ready-for-delivery' | 'completed';

const STAGE_ORDER: ItemStage[] = ['awaiting-stock', 'ordered', 'in-stock', 'ready-for-delivery', 'completed'];

/** Board column key -> item stage. */
const COLUMN_STAGE: Record<string, ItemStage> = {
  ordered: 'awaiting-stock',
  "in-progress": 'ordered',
  "in-stock": 'in-stock',
  ready: 'ready-for-delivery',
  delivered: 'completed',
};

/** Quantity of an item sitting in each stage. */
const bucketsFor = (item: OrderItem): Record<ItemStage, number> => {
  const qty = item.totalQuantity ?? item.quantity ?? 0;
  const onPo = Math.min(item.qty_on_po ?? 0, qty);
  const received = Math.min(item.qty_received ?? 0, onPo);
  const invoiced = Math.min(item.qty_invoiced ?? 0, received);
  const completed = Math.min(item.qty_completed ?? 0, invoiced);
  return {
    'awaiting-stock': Math.max(0, qty - onPo),
    'ordered': Math.max(0, onPo - received),
    'in-stock': Math.max(0, received - invoiced),
    'ready-for-delivery': Math.max(0, invoiced - completed),
    'completed': completed,
  };
};

/** New cumulative counters after moving `qty` units of an item between stages. */
const countersAfterMove = (item: OrderItem, from: ItemStage, to: ItemStage, qty: number) => {
  const counters = [item.qty_on_po ?? 0, item.qty_received ?? 0, item.qty_invoiced ?? 0, item.qty_completed ?? 0];
  const f = STAGE_ORDER.indexOf(from);
  const t = STAGE_ORDER.indexOf(to);
  const delta = t > f ? qty : -qty;
  const lo = Math.min(f, t);
  const hi = Math.max(f, t);
  for (let i = lo; i < hi; i++) counters[i] += delta;

  let cap = item.totalQuantity ?? item.quantity ?? 0;
  for (let i = 0; i < counters.length; i++) {
    counters[i] = Math.max(0, Math.min(counters[i], cap));
    cap = counters[i];
  }

  return {
    qty_on_po: counters[0],
    qty_received: counters[1],
    qty_invoiced: counters[2],
    qty_completed: counters[3],
  };
};

// Default status column configurations (flow: Awaiting Stock -> In Progress -> In Stock -> Ready for Delivery)
const DEFAULT_STATUS_COLUMNS = [
  {
    key: "ordered",
    label: "Awaiting Stock",
    color: "text-amber-50",
    bgColor: "bg-amber-600",
    nextStatus: "in-progress",
    nextLabel: "Move to In Progress",
  },
  {
    key: "in-progress",
    label: "In Progress",
    color: "text-violet-50",
    bgColor: "bg-violet-600",
    nextStatus: "in-stock",
    nextLabel: "Mark In Stock",
    prevStatus: "ordered",
    prevLabel: "Back to Awaiting",
  },
  {
    key: "in-stock",
    label: "In Stock",
    color: "text-sky-50",
    bgColor: "bg-sky-600",
    nextStatus: "ready",
    nextLabel: "Mark Ready",
    prevStatus: "in-progress",
    prevLabel: "Back to In Progress",
  },
  {
    key: "ready",
    label: "Ready for Delivery",
    color: "text-emerald-50",
    bgColor: "bg-emerald-600",
    nextStatus: "delivered",
    nextLabel: "Complete Items",
    prevStatus: "in-stock",
    prevLabel: "Back to In Stock",
  },
];

// Helper to get status columns based on theme settings
const getStatusColumns = (boardColorMode: string, boardSingleColor: string, colorfulPreset: string, customBoardColor: string) => {
  if (boardColorMode === 'colorful') {
    const preset = colorfulPresets[colorfulPreset as keyof typeof colorfulPresets] || colorfulPresets.default;
    return DEFAULT_STATUS_COLUMNS.map((col, index) => ({
      ...col,
      bgColor: preset.colors[index],
      color: preset.textColors[index],
    }));
  }
  
  if (boardSingleColor === 'custom') {
    return DEFAULT_STATUS_COLUMNS.map(col => ({
      ...col,
      color: 'text-white',
      bgColor: '',
      customColor: customBoardColor,
    }));
  }
  
  const colorConfig = boardSingleColors[boardSingleColor as keyof typeof boardSingleColors] || boardSingleColors.primary;
  return DEFAULT_STATUS_COLUMNS.map(col => ({
    ...col,
    color: colorConfig.textClass,
    bgColor: colorConfig.bgClass,
  }));
};

export default function OrdersPage({
  isAdmin = false,
  searchTerm = "",
}: OrdersPageProps) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [templatePrefill, setTemplatePrefill] = useState<any>(null);
  const [submitting, setSubmitting] = useState(false);
  const [selectedCompanyId, setSelectedCompanyId] = useState<string>("all");
  const [activeFilter, setActiveFilter] = useState<OrderFilter | null>(null);
  const [activeOrderId, setActiveOrderId] = useState<string | null>(null);
  // On desktop/tablet, all columns are always expanded (not collapsible)
  // On mobile, columns are collapsible and start collapsed
  const [expandedColumns, setExpandedColumns] = useState<Set<string>>(new Set());
  const { toast } = useToast();
  const { user } = useAuth();
  const { companies } = useCompanyData();
  const { boardColorMode, boardSingleColor, colorfulPreset, customBoardColor } = useTheme();
  const [groupByClient, setGroupByClient] = useState(false);
  const { showConfetti, streak, celebrate } = useOrderCelebration();
  const [selectedOrderIds, setSelectedOrderIds] = useState<Set<string>>(new Set());
  const [allTags, setAllTags] = useState<{ id: string; name: string; color: string }[]>([]);
  const [tagAssignments, setTagAssignments] = useState<Map<string, string[]>>(new Map());

  const toggleOrderSelection = useCallback((orderId: string) => {
    setSelectedOrderIds(prev => {
      const next = new Set(prev);
      if (next.has(orderId)) {
        next.delete(orderId);
      } else {
        next.add(orderId);
      }
      return next;
    });
  }, []);

  const selectedOrders = useMemo(() => 
    orders.filter(o => selectedOrderIds.has(o.id)).map(o => ({
      ...o,
      total_amount: null,
      notes: null,
      reference: null,
      supplier_id: null,
      purchase_order_number: null,
      progress_stage: null,
      completed_date: null,
      updated_at: null,
    })) as any[],
    [orders, selectedOrderIds]
  );

  const STATUS_COLUMNS = useMemo(() => 
    getStatusColumns(boardColorMode, boardSingleColor, colorfulPreset, customBoardColor), 
    [boardColorMode, boardSingleColor, colorfulPreset, customBoardColor]
  );

  // Drag-and-drop sensors (require 8px movement to start dragging)
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  const handleDragStart = useCallback((event: DragStartEvent) => {
    playClick();
    setActiveOrderId(event.active.id as string);
  }, []);
  const fetchOrders = useCallback(async () => {
    try {
      // Fetch all orders except delivered (those go to history)
      const { data, error } = await supabase
        .from("orders")
        .select("id, order_number, description, status, urgency, company_id, user_id, created_at, supplier_id, purchase_order_number")
        .neq("status", "delivered")
        .order("created_at", { ascending: false });

      if (error) throw error;

      // Fetch company names
      const companyIds = [...new Set(data?.map((o) => o.company_id).filter(Boolean))];
      let companyMap = new Map<string, string>();

      if (companyIds.length > 0) {
        const { data: companiesData } = await supabase
          .from("companies")
          .select("id, name")
          .in("id", companyIds);
        companyMap = new Map(companiesData?.map((c) => [c.id, c.name]) || []);
      }

      // Fetch order items for all orders
      const orderIds = data?.map((o) => o.id) || [];
      let orderItemsMap = new Map<string, OrderItem[]>();
      let orderPOsMap = new Map<string, PurchaseOrderInfo[]>();

      if (orderIds.length > 0) {
        // Fetch order items
        const { data: itemsData } = await supabase
          .from("order_items")
          .select("id, order_id, name, code, quantity, stock_status, qty_on_po, qty_received, qty_invoiced, qty_completed")
          .in("order_id", orderIds);

        if (itemsData) {
          itemsData.forEach((item: any) => {
            const existing = orderItemsMap.get(item.order_id) || [];
            existing.push({
              id: item.id,
              name: item.name,
              code: item.code,
              quantity: item.quantity,
              totalQuantity: item.quantity,
              stock_status: item.stock_status,
              qty_on_po: item.qty_on_po ?? 0,
              qty_received: item.qty_received ?? 0,
              qty_invoiced: item.qty_invoiced ?? 0,
              qty_completed: item.qty_completed ?? 0,
            });
            orderItemsMap.set(item.order_id, existing);
          });
        }

        // Fetch purchase orders from junction table
        const { data: posData } = await supabase
          .from("order_purchase_orders")
          .select("id, order_id, supplier_id, purchase_order_number")
          .in("order_id", orderIds);

        if (posData && posData.length > 0) {
          // Get unique supplier IDs from POs
          const poSupplierIds = [...new Set(posData.map(po => po.supplier_id))];
          let supplierMap = new Map<string, string>();
          
          if (poSupplierIds.length > 0) {
            const { data: suppliersData } = await supabase
              .from("suppliers")
              .select("id, name")
              .in("id", poSupplierIds);
            supplierMap = new Map(suppliersData?.map((s) => [s.id, s.name]) || []);
          }

          posData.forEach((po) => {
            const existing = orderPOsMap.get(po.order_id) || [];
            existing.push({
              id: po.id,
              supplier_id: po.supplier_id,
              purchase_order_number: po.purchase_order_number,
              supplierName: supplierMap.get(po.supplier_id) || 'Unknown',
            });
            orderPOsMap.set(po.order_id, existing);
          });
        }
      }

      // Fetch creator profile names
      const userIds = [...new Set(data?.map((o) => o.user_id).filter(Boolean))] as string[];
      let userMap = new Map<string, string>();
      if (userIds.length > 0) {
        const { data: profilesData } = await supabase
          .from("profiles")
          .select("id, full_name")
          .in("id", userIds);
        userMap = new Map(profilesData?.map((p) => [p.id, p.full_name || 'Unknown']) || []);
      }

      const ordersWithData = (data || []).map((order) => ({
        ...order,
        companyName: order.company_id
          ? companyMap.get(order.company_id) || "Unknown"
          : "No Client",
        creatorName: order.user_id ? userMap.get(order.user_id) || undefined : undefined,
        items: orderItemsMap.get(order.id) || [],
        purchaseOrders: orderPOsMap.get(order.id) || [],
      }));

      setOrders(ordersWithData);
    } catch (error) {
      console.error("Error fetching orders:", error);
      toast({
        title: "Error",
        description: "Failed to load orders",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchOrders();
    fetchTags();
  }, [fetchOrders]);

  const fetchTags = useCallback(async () => {
    try {
      const [tagsRes, assignmentsRes] = await Promise.all([
        supabase.from("order_tags").select("id, name, color").order("name"),
        supabase.from("order_tag_assignments").select("order_id, tag_id"),
      ]);
      if (tagsRes.data) setAllTags(tagsRes.data);
      if (assignmentsRes.data) {
        const map = new Map<string, string[]>();
        assignmentsRes.data.forEach((a: any) => {
          const existing = map.get(a.order_id) || [];
          existing.push(a.tag_id);
          map.set(a.order_id, existing);
        });
        setTagAssignments(map);
      }
    } catch (error) {
      console.error("Error fetching tags:", error);
    }
  }, []);

  useGlobalRealtimeOrders({
    onOrdersChange: fetchOrders,
    isAdmin,
    pageType: "orders",
  });

  const handleCreateOrder = async (orderData: {
    orderNumber: string;
    reference?: string;
    companyId: string;
    totalAmount: number;
    urgency: string;
    notes?: string;
    items: any[];
  }) => {
    if (!user?.id) {
      toast({
        title: "Error",
        description: "Please log in to create orders",
        variant: "destructive",
      });
      return;
    }

    setSubmitting(true);
    try {
      const itemsDescription = orderData.items
        .filter((item) => item.name && item.quantity > 0)
        .map(
          (item) =>
            `${item.name} (Qty: ${item.quantity})${item.notes ? ` - ${item.notes}` : ""}`
        )
        .join("\n");

      // Create the order
      const { data: newOrder, error } = await supabase.from("orders").insert({
        order_number: orderData.orderNumber,
        reference: orderData.reference || null,
        description: itemsDescription,
        notes: orderData.notes || null,
        company_id: orderData.companyId,
        total_amount: orderData.totalAmount || 0,
        user_id: user.id,
        status: "ordered", // Always start in "ordered" (Awaiting Stock)
        urgency: orderData.urgency,
      }).select("id").single();

      if (error) throw error;

      // Insert order items
      const validItems = orderData.items.filter((item) => item.name && item.quantity > 0);
      if (validItems.length > 0 && newOrder) {
        const orderItemsToInsert = validItems.map((item) => ({
          order_id: newOrder.id,
          name: item.name,
          code: item.code || null,
          quantity: item.quantity,
          stock_status: "awaiting",
        }));

        const { error: itemsError } = await supabase
          .from("order_items")
          .insert(orderItemsToInsert);

        if (itemsError) {
          console.error("Error inserting order items:", itemsError);
        }
      }

      toast({
        title: "Order Created",
        description: `Order ${orderData.orderNumber} has been created.`,
      });
      setCreateDialogOpen(false);
      fetchOrders();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to create order",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleSetItemStockStatus = useCallback(async (itemId: string, newStatus: string) => {
    try {
      // When marking as received (in-stock), also advance progress_stage
      const updateData: Record<string, string> = { stock_status: newStatus };
      if (newStatus === 'in-stock') {
        updateData.progress_stage = 'in-stock';
      }

      const { error } = await supabase
        .from("order_items")
        .update(updateData)
        .eq("id", itemId);

      if (error) throw error;

      fetchOrders();
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to update item stock status",
        variant: "destructive",
      });
    }
  }, [fetchOrders, toast]);

  const handleBulkSetItemsStatus = useCallback(async (itemIds: string[], newStatus: string) => {
    try {
      const { error } = await supabase
        .from("order_items")
        .update({ stock_status: newStatus })
        .in("id", itemIds);

      if (error) throw error;

      toast({
        title: "Updated",
        description: `All items marked as ${newStatus === "in-stock" ? "received" : "ordered"}`,
      });
      
      // Refresh orders (the database trigger will auto-move the order if all items are in stock)
      fetchOrders();
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to update items stock status",
        variant: "destructive",
      });
    }
  }, [fetchOrders, toast]);

  /**
   * Moves the quantities shown on a board card (an order's items sitting in one
   * stage) into the target stage. Items move independently of the order, so the
   * same order can live in several columns at once.
   */
  const moveCardItems = useCallback(async (order: Order, fromStage: ItemStage, toStage: ItemStage) => {
    if (fromStage === toStage) return;
    const source = orders.find(o => o.id === order.id);
    const items = (source?.items || []).filter(i => bucketsFor(i)[fromStage] > 0);
    if (items.length === 0) return;

    try {
      await Promise.all(items.map(item => {
        const qty = bucketsFor(item)[fromStage];
        const next = countersAfterMove(item, fromStage, toStage, qty);
        return supabase
          .from("order_items")
          .update({ ...next, updated_at: new Date().toISOString() })
          .eq("id", item.id)
          .throwOnError();
      }));

      if (toStage === 'completed') celebrate();

      toast({
        title: "Items moved",
        description: `${items.length} item${items.length !== 1 ? "s" : ""} on ${order.order_number} moved to ${DEFAULT_STATUS_COLUMNS.find(c => COLUMN_STAGE[c.key] === toStage)?.label || toStage}`,
      });
      fetchOrders();
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to move items",
        variant: "destructive",
      });
    }
  }, [orders, fetchOrders, toast, celebrate]);

  const handleMoveOrder = useCallback((order: Order, newStatus: string) => {
    const toStage = COLUMN_STAGE[newStatus];
    const fromStage = order.boardStage;
    if (!toStage || !fromStage) return;
    void moveCardItems(order, fromStage, toStage);
  }, [moveCardItems]);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    setActiveOrderId(null);
    const { active, over } = event;
    if (!over) return;

    const [orderId, fromStage] = String(active.id).split("::") as [string, ItemStage];
    const toStage = COLUMN_STAGE[String(over.id)];

    const order = orders.find(o => o.id === orderId);
    if (!order || !toStage || !fromStage || fromStage === toStage) return;

    // Play a satisfying drop/success sound
    playSuccess();
    void moveCardItems(order, fromStage, toStage);
  }, [orders, moveCardItems]);

  const handleDeleteOrder = useCallback(async (order: Order) => {
    try {
      const { error } = await supabase.from("orders").delete().eq("id", order.id);
      if (error) throw error;

      toast({
        title: "Deleted",
        description: `Order ${order.order_number} has been deleted`,
      });
      fetchOrders();
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to delete order",
        variant: "destructive",
      });
    }
  }, [fetchOrders, toast]);

  // Memoize filtered orders to prevent unnecessary recalculations
  const filteredOrders = useMemo(() => {
    const searchLower = searchTerm.toLowerCase();
    return orders.filter((order) => {
      const effectiveCompanyId = activeFilter?.companyId || selectedCompanyId;
      const matchesCompany =
        effectiveCompanyId === "all" || order.company_id === effectiveCompanyId;
      const matchesSearch =
        order.order_number.toLowerCase().includes(searchLower) ||
        order.companyName?.toLowerCase().includes(searchLower);
      
      // Urgency filter from saved filter
      const matchesUrgency = !activeFilter?.urgency || activeFilter.urgency === "all" || order.urgency === activeFilter.urgency;
      
      // Date range filter
      let matchesDate = true;
      if (activeFilter?.dateRange && activeFilter.dateRange !== "all" && order.created_at) {
        const orderDate = new Date(order.created_at);
        const now = new Date();
        if (activeFilter.dateRange === "today") {
          matchesDate = orderDate.toDateString() === now.toDateString();
        } else if (activeFilter.dateRange === "week") {
          const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          matchesDate = orderDate >= weekAgo;
        } else if (activeFilter.dateRange === "month") {
          matchesDate = orderDate.getMonth() === now.getMonth() && orderDate.getFullYear() === now.getFullYear();
        }
      }
      
      return matchesCompany && matchesSearch && matchesUrgency && matchesDate;
    });
  }, [orders, selectedCompanyId, searchTerm, activeFilter]);

  // Priority order for urgency sorting (lower = higher priority)
  const urgencyPriority: Record<string, number> = useMemo(() => ({
    urgent: 1,
    high: 2,
    normal: 3,
    low: 4,
  }), []);

  // Item-level board: an order appears in every column where it still has
  // quantities sitting in that stage, carrying only those items/quantities.
  const ordersByStatus = useMemo(() => {
    const sortOrders = (ordersToSort: Order[]) => {
      return [...ordersToSort].sort((a, b) => {
        const urgencyA = urgencyPriority[a.urgency || "normal"] || 3;
        const urgencyB = urgencyPriority[b.urgency || "normal"] || 3;

        if (urgencyA !== urgencyB) {
          return urgencyA - urgencyB;
        }

        const dateA = new Date(a.created_at || 0).getTime();
        const dateB = new Date(b.created_at || 0).getTime();
        return dateA - dateB;
      });
    };

    const buckets: Record<string, Order[]> = {
      ordered: [],
      "in-progress": [],
      "in-stock": [],
      ready: [],
    };

    filteredOrders.forEach((order) => {
      const items = order.items || [];

      Object.entries(COLUMN_STAGE).forEach(([columnKey, stage]) => {
        if (!(columnKey in buckets)) return;

        const stageItems = items
          .map((item) => ({ item, qty: bucketsFor(item)[stage] }))
          .filter(({ qty }) => qty > 0)
          .map(({ item, qty }) => ({ ...item, quantity: qty, totalQuantity: item.totalQuantity ?? item.quantity }));

        // Orders without any item rows still show in their status column
        const fallback = items.length === 0 && order.status === columnKey;

        if (stageItems.length > 0 || fallback) {
          buckets[columnKey].push({ ...order, items: stageItems, boardStage: stage });
        }
      });
    });

    return {
      ordered: sortOrders(buckets.ordered),
      "in-progress": sortOrders(buckets["in-progress"]),
      "in-stock": sortOrders(buckets["in-stock"]),
      ready: sortOrders(buckets.ready),
    };
  }, [filteredOrders, urgencyPriority]);

  if (loading) {
    return <PageSkeleton variant="kanban" />;
  }

  return (
    <>
    <ConfettiOverlay show={showConfetti} streak={streak} />
    <PullToRefresh onRefresh={fetchOrders} className="space-y-3 sm:space-y-4 w-full overflow-x-hidden">
      {/* Bulk Actions Bar */}
      {selectedOrders.length > 0 && (
        <BulkActionsBar
          selectedOrders={selectedOrders}
          onClearSelection={() => setSelectedOrderIds(new Set())}
          onActionComplete={fetchOrders}
        />
      )}
      {/* Header */}
      <div className="flex flex-col gap-3 sm:gap-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h2 className="text-xl sm:text-2xl font-semibold text-foreground">Orders Board</h2>
            <p className="text-xs sm:text-sm text-muted-foreground">
              {filteredOrders.length} order{filteredOrders.length !== 1 ? "s" : ""}
              {selectedCompanyId !== "all" &&
                companies.find((c) => c.id === selectedCompanyId) && (
                  <span>
                    {" "}
                    for {companies.find((c) => c.id === selectedCompanyId)?.name}
                  </span>
                )}
            </p>
          </div>
          <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
            <OverdueAlerts />
            {/* Saved Filters */}
            <SavedFiltersBar
              activeFilter={activeFilter}
              onApplyFilter={(filter) => {
                setActiveFilter(filter);
                if (filter?.companyId && filter.companyId !== "all") {
                  setSelectedCompanyId(filter.companyId);
                }
              }}
              companies={companies}
            />
            {/* Company Filter */}
            <div className="flex items-center gap-1.5 sm:gap-2 flex-1 sm:flex-none">
              <Filter className="h-4 w-4 text-muted-foreground shrink-0" />
              <Select value={selectedCompanyId} onValueChange={setSelectedCompanyId}>
                <SelectTrigger className="w-full sm:w-[200px] h-9 text-sm">
                  <SelectValue placeholder="Filter by client" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Clients</SelectItem>
                  {companies.map((company) => (
                    <SelectItem key={company.id} value={company.id}>
                      {company.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Group by Client Toggle */}
            <Button
              size="sm"
              variant={groupByClient ? "default" : "outline"}
              className="h-9 shrink-0 gap-1.5"
              onClick={() => setGroupByClient(!groupByClient)}
            >
              <Users className="h-4 w-4" />
              <span className="hidden sm:inline">Group</span>
            </Button>

            {/* Order Templates */}
            <OrderTemplatesDialog
              companies={companies}
              onUseTemplate={(template) => {
                setTemplatePrefill(template);
                setCreateDialogOpen(true);
              }}
            />

            <Dialog open={createDialogOpen} onOpenChange={(v) => {
              setCreateDialogOpen(v);
              if (!v) setTemplatePrefill(null);
            }}>
              <DialogTrigger asChild>
                <Button size="sm" className="h-9 shrink-0">
                  <Plus className="h-4 w-4 sm:mr-2" />
                  <span className="hidden sm:inline">New Order</span>
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto mx-2 sm:mx-auto">
                <DialogHeader>
                  <DialogTitle>Create New Order</DialogTitle>
                  <DialogDescription>
                    Fill in the order details below to create a new order.
                  </DialogDescription>
                </DialogHeader>
                <OrderForm onSubmit={handleCreateOrder} loading={submitting} templatePrefill={templatePrefill} />
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </div>

      {/* Kanban Board - Stacked on mobile, responsive grid on larger screens */}
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-[1.5fr_1fr_1fr_1fr] gap-2 sm:gap-3 md:gap-4 w-full overflow-hidden">
        {STATUS_COLUMNS.map((column) => (
          <OrderStatusColumn
            key={column.key}
            config={column}
            orders={ordersByStatus[column.key as keyof typeof ordersByStatus] || []}
            onMoveOrder={handleMoveOrder}
            onDeleteOrder={handleDeleteOrder}
            onSetItemStockStatus={handleSetItemStockStatus}
            onBulkSetItemsStatus={handleBulkSetItemsStatus}
            canEditItems={true}
            selectedOrderIds={selectedOrderIds}
            onToggleOrderSelection={toggleOrderSelection}
            groupByClient={groupByClient}
            allTags={allTags}
            tagAssignments={tagAssignments}
            onTagsChanged={fetchTags}
            isExpanded={expandedColumns.has(column.key)}
            onToggleExpand={() => {
              setExpandedColumns(prev => {
                const next = new Set(prev);
                if (next.has(column.key)) {
                  next.delete(column.key);
                } else {
                  next.add(column.key);
                }
                return next;
              });
            }}
          />
        ))}
      </div>
      </DndContext>
    </PullToRefresh>
    </>
  );
}
