import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Package, Clock, ChevronDown, LogOut, Loader2, FileText } from "lucide-react";
import { format } from "date-fns";

interface PortalOrder {
  id: string;
  order_number: string;
  description: string | null;
  status: string | null;
  urgency: string | null;
  created_at: string | null;
  reference: string | null;
  items: { id: string; name: string; quantity: number; stock_status: string; progress_stage: string }[];
}

export default function Portal() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [orders, setOrders] = useState<PortalOrder[]>([]);
  const [companyName, setCompanyName] = useState("");
  const [loading, setLoading] = useState(true);
  const [expandedOrders, setExpandedOrders] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!authLoading && !user) {
      navigate("/portal/login", { replace: true });
    }
  }, [user, authLoading, navigate]);

  useEffect(() => {
    if (!user) return;
    fetchPortalData();
  }, [user]);

  const fetchPortalData = async () => {
    if (!user) return;
    setLoading(true);
    try {
      // Get user profile to find company
      const { data: profile } = await supabase
        .from("profiles")
        .select("company_id, company_code")
        .eq("id", user.id)
        .single();

      if (!profile?.company_id) {
        setLoading(false);
        return;
      }

      // Get company name
      const { data: company } = await supabase
        .from("companies")
        .select("name")
        .eq("id", profile.company_id)
        .single();

      setCompanyName(company?.name || "Your Company");

      // Get orders for this company
      const { data: ordersData } = await supabase
        .from("orders")
        .select("id, order_number, description, status, urgency, created_at, reference")
        .eq("company_id", profile.company_id)
        .order("created_at", { ascending: false });

      if (!ordersData || ordersData.length === 0) {
        setOrders([]);
        setLoading(false);
        return;
      }

      // Get items for all orders
      const orderIds = ordersData.map((o) => o.id);
      const { data: itemsData } = await supabase
        .from("order_items")
        .select("id, name, quantity, stock_status, progress_stage, order_id")
        .in("order_id", orderIds);

      const ordersWithItems: PortalOrder[] = ordersData.map((order) => ({
        ...order,
        items: (itemsData || []).filter((item) => item.order_id === order.id),
      }));

      setOrders(ordersWithItems);
    } catch (error) {
      console.error("Error fetching portal data:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate("/portal/login", { replace: true });
  };

  const toggleOrder = (orderId: string) => {
    setExpandedOrders((prev) => {
      const next = new Set(prev);
      if (next.has(orderId)) next.delete(orderId);
      else next.add(orderId);
      return next;
    });
  };

  const getStatusStyle = (status: string | null) => {
    switch (status?.toLowerCase()) {
      case "completed":
      case "delivered":
        return "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400";
      case "in-progress":
      case "processing":
        return "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400";
      case "in-stock":
        return "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400";
      case "ordered":
        return "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400";
      case "ready":
        return "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400";
      default:
        return "bg-muted text-muted-foreground";
    }
  };

  const getProgressLabel = (stage: string) => {
    const labels: Record<string, string> = {
      "awaiting-stock": "Awaiting Stock",
      "in-stock": "In Stock",
      packing: "Packing",
      delivery: "Out for Delivery",
      completed: "Completed",
    };
    return labels[stage] || stage;
  };

  const getProgressColor = (stage: string) => {
    switch (stage) {
      case "completed":
        return "bg-emerald-500";
      case "delivery":
        return "bg-orange-500";
      case "packing":
        return "bg-purple-500";
      case "in-stock":
        return "bg-blue-500";
      default:
        return "bg-amber-500";
    }
  };

  if (authLoading || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // Separate active and completed orders
  const activeOrders = orders.filter(
    (o) => o.status !== "completed" && o.status !== "delivered"
  );
  const completedOrders = orders.filter(
    (o) => o.status === "completed" || o.status === "delivered"
  );

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold text-foreground">Aleph Orders</h1>
            <p className="text-xs text-muted-foreground">{companyName}</p>
          </div>
          <Button variant="ghost" size="sm" onClick={handleSignOut}>
            <LogOut className="h-4 w-4 mr-1.5" />
            Sign Out
          </Button>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-6 space-y-6">
        {/* Summary Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold text-foreground">{orders.length}</p>
              <p className="text-xs text-muted-foreground">Total Orders</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold text-primary">{activeOrders.length}</p>
              <p className="text-xs text-muted-foreground">Active</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold text-emerald-600">{completedOrders.length}</p>
              <p className="text-xs text-muted-foreground">Completed</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold text-amber-600">
                {orders.reduce((acc, o) => acc + o.items.length, 0)}
              </p>
              <p className="text-xs text-muted-foreground">Total Items</p>
            </CardContent>
          </Card>
        </div>

        {/* Active Orders */}
        {activeOrders.length > 0 && (
          <section>
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
              Active Orders
            </h2>
            <div className="space-y-3">
              {activeOrders.map((order) => (
                <OrderCard
                  key={order.id}
                  order={order}
                  isExpanded={expandedOrders.has(order.id)}
                  onToggle={() => toggleOrder(order.id)}
                  getStatusStyle={getStatusStyle}
                  getProgressLabel={getProgressLabel}
                  getProgressColor={getProgressColor}
                />
              ))}
            </div>
          </section>
        )}

        {/* Completed Orders */}
        {completedOrders.length > 0 && (
          <section>
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
              Completed Orders
            </h2>
            <div className="space-y-3">
              {completedOrders.map((order) => (
                <OrderCard
                  key={order.id}
                  order={order}
                  isExpanded={expandedOrders.has(order.id)}
                  onToggle={() => toggleOrder(order.id)}
                  getStatusStyle={getStatusStyle}
                  getProgressLabel={getProgressLabel}
                  getProgressColor={getProgressColor}
                />
              ))}
            </div>
          </section>
        )}

        {orders.length === 0 && (
          <Card>
            <CardContent className="py-16 text-center">
              <Package className="h-12 w-12 mx-auto text-muted-foreground/40 mb-4" />
              <p className="text-lg font-medium text-muted-foreground">No orders yet</p>
              <p className="text-sm text-muted-foreground/70 mt-1">
                Your orders will appear here once they're placed.
              </p>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}

// Separate order card component for cleanliness
function OrderCard({
  order,
  isExpanded,
  onToggle,
  getStatusStyle,
  getProgressLabel,
  getProgressColor,
}: {
  order: PortalOrder;
  isExpanded: boolean;
  onToggle: () => void;
  getStatusStyle: (s: string | null) => string;
  getProgressLabel: (s: string) => string;
  getProgressColor: (s: string) => string;
}) {
  const itemProgress = order.items.length > 0
    ? order.items.filter((i) => i.progress_stage === "completed").length
    : 0;

  return (
    <Card className="overflow-hidden">
      <Collapsible open={isExpanded} onOpenChange={onToggle}>
        <CollapsibleTrigger className="w-full text-left">
          <CardContent className="p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-foreground">{order.order_number}</span>
                  {order.reference && (
                    <span className="text-xs bg-muted px-1.5 py-0.5 rounded text-muted-foreground font-mono">
                      {order.reference}
                    </span>
                  )}
                  <Badge className={getStatusStyle(order.status)}>
                    {order.status || "pending"}
                  </Badge>
                </div>
                {order.description && (
                  <p className="text-sm text-muted-foreground mt-1 truncate">{order.description}</p>
                )}
                <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {order.created_at
                      ? format(new Date(order.created_at), "dd MMM yyyy")
                      : "—"}
                  </span>
                  <span className="flex items-center gap-1">
                    <Package className="h-3 w-3" />
                    {order.items.length} item{order.items.length !== 1 ? "s" : ""}
                  </span>
                  {order.items.length > 0 && (
                    <span>
                      {itemProgress}/{order.items.length} done
                    </span>
                  )}
                </div>
              </div>
              <ChevronDown
                className={`h-5 w-5 text-muted-foreground shrink-0 transition-transform ${
                  isExpanded ? "rotate-0" : "-rotate-90"
                }`}
              />
            </div>

            {/* Progress bar */}
            {order.items.length > 0 && (
              <div className="mt-3 h-1.5 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary rounded-full transition-all duration-500"
                  style={{
                    width: `${(itemProgress / order.items.length) * 100}%`,
                  }}
                />
              </div>
            )}
          </CardContent>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <div className="px-4 pb-4 space-y-2 border-t pt-3">
            {order.items.map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between py-2 px-3 rounded-lg bg-muted/40"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{item.name}</p>
                  <p className="text-xs text-muted-foreground">Qty: {item.quantity}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <div className={`h-2 w-2 rounded-full ${getProgressColor(item.progress_stage)}`} />
                  <span className="text-xs text-muted-foreground">
                    {getProgressLabel(item.progress_stage)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}
