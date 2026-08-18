import { useEffect, useState } from "react";
import { Package, PackageCheck, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface OrderItem {
  id: string;
  name: string;
  code: string | null;
  quantity: number;
  stock_status: string;
  totalQuantity?: number;
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
  reference?: string | null;
  boardStage?: string;
}

interface OrderItemsFloatingBubbleProps {
  order: Order | null;
  onClose: () => void;
}

// Maps stock status onto the brand token system so the bubble reads at a
// glance, consistent with how status is shown everywhere else in the app.
function getStockStatusStyle(status: string) {
  switch (status?.toLowerCase()) {
    case "in-stock":
    case "completed":
    case "delivered":
      return {
        dot: "bg-success",
        chip: "bg-success/10 text-success",
        label: "In stock",
      };
    case "ordered":
    case "processing":
      return {
        dot: "bg-info",
        chip: "bg-info/10 text-info",
        label: "Ordered",
      };
    case "awaiting-stock":
      return {
        dot: "bg-warning",
        chip: "bg-warning/10 text-warning",
        label: "Awaiting stock",
      };
    default:
      return {
        dot: "bg-muted-foreground/40",
        chip: "bg-muted text-muted-foreground",
        label: status || "Unknown",
      };
  }
}

export default function OrderItemsFloatingBubble({ order, onClose }: OrderItemsFloatingBubbleProps) {
  const [visibleOrder, setVisibleOrder] = useState<Order | null>(order);
  const [isSwitching, setIsSwitching] = useState(false);

  useEffect(() => {
    if (!order) return;

    if (!visibleOrder) {
      setVisibleOrder(order);
      return;
    }

    if (visibleOrder.id === order.id) {
      setVisibleOrder(order);
      return;
    }

    setIsSwitching(true);

    const timer = window.setTimeout(() => {
      setVisibleOrder(order);
      setIsSwitching(false);
    }, 120);

    return () => window.clearTimeout(timer);
  }, [order, visibleOrder?.id]);

  if (!visibleOrder) return null;

  const items = visibleOrder.items || [];
  const units = items.reduce((sum, item) => sum + (item.quantity || 0), 0);

  return (
    <div
      className={cn(
        "relative w-full max-w-3xl overflow-hidden rounded-3xl",
        "border-2 border-primary/15 bg-background/90 dark:bg-background/85",
        "backdrop-blur-2xl",
        "shadow-[0_24px_80px_-28px_hsl(var(--foreground)/0.38)]",
        "ring-1 ring-white/10",
        "animate-order-floating-bubble",
        isSwitching && "opacity-80 scale-[0.995]",
        "transition-[opacity,transform] duration-150",
      )}
      role="dialog"
      aria-label={`Items for order ${visibleOrder.order_number}`}
    >
      {/* Brand signature accent - ties the bubble to the rest of the app */}
      <div className="ribbon-bar" aria-hidden />
      <div className="pointer-events-none absolute inset-x-8 -top-12 h-24 rounded-full bg-primary/15 blur-3xl" />
      <div className="pointer-events-none absolute left-1/2 top-0 h-px w-2/3 -translate-x-1/2 bg-gradient-to-r from-transparent via-primary/40 to-transparent" />

      <div className="relative p-4 sm:p-5 lg:p-6">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary shadow-soft">
            <Package className="h-5 w-5" />
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
                Order contents
              </p>

              {visibleOrder.companyName && (
                <span className="text-[10px] text-muted-foreground/60">· {visibleOrder.companyName}</span>
              )}
            </div>

            <h3
              key={visibleOrder.id}
              className="mt-0.5 truncate font-display text-lg font-bold text-foreground animate-order-floating-bubble-content"
            >
              {visibleOrder.order_number}
            </h3>
          </div>

          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onClose();
            }}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted/70 text-muted-foreground transition-all hover:scale-110 hover:bg-destructive/10 hover:text-destructive"
            aria-label="Close order items"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
          <div className="rounded-2xl bg-primary/5 px-3 py-2.5">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Items</p>
            <p className="mt-0.5 font-display text-xl font-bold text-primary">{items.length}</p>
          </div>

          <div className="rounded-2xl bg-[hsl(var(--ribbon-4))]/10 px-3 py-2.5">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Units</p>
            <p className="mt-0.5 font-display text-xl font-bold text-[hsl(var(--ribbon-4))]">{units}</p>
          </div>

          {visibleOrder.reference && (
            <div className="col-span-2 rounded-2xl bg-muted/45 px-3 py-2.5 sm:col-span-1">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Reference</p>
              <p className="mt-0.5 truncate text-sm font-semibold text-foreground">{visibleOrder.reference}</p>
            </div>
          )}
        </div>

        <div key={`items-${visibleOrder.id}`} className="mt-4 grid gap-2 sm:grid-cols-2 animate-order-floating-bubble-content">
          {items.length === 0 ? (
            <div className="col-span-full rounded-2xl bg-muted/40 px-4 py-5 text-center text-xs text-muted-foreground">
              No items on this order.
            </div>
          ) : (
            items.map((item, itemIndex) => {
              const total = item.totalQuantity ?? item.quantity;
              const isPartial = total > item.quantity;
              const stockStyle = getStockStatusStyle(item.stock_status);

              return (
                <div
                  key={item.id}
                  className="flex min-w-0 items-center gap-3 rounded-2xl border border-border/50 bg-muted/35 px-3 py-2.5 transition-all duration-200 hover:bg-muted/55 hover:border-primary/25"
                  style={{ animationDelay: `${Math.min(itemIndex * 35, 210)}ms` }}
                >
                  <div className="flex h-8 min-w-8 shrink-0 items-center justify-center rounded-xl bg-primary/10 px-1.5 text-xs font-bold text-primary">
                    ×{item.quantity}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="break-words text-xs font-semibold text-foreground">{item.name}</div>

                    <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[10px] text-muted-foreground">
                      {item.stock_status && (
                        <span className={cn("inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 font-semibold", stockStyle.chip)}>
                          <span className={cn("h-1.5 w-1.5 rounded-full", stockStyle.dot)} />
                          {stockStyle.label}
                        </span>
                      )}
                      {isPartial && <span>{item.quantity} of {total}</span>}
                      {item.code && <span className="font-mono">[{item.code}]</span>}
                    </div>
                  </div>

                  <PackageCheck className="h-4 w-4 shrink-0 text-muted-foreground/45" />
                </div>
              );
            })
          )}
        </div>

        <div className="mt-3 flex items-center justify-end gap-1.5 text-[10px] font-medium text-muted-foreground">
          <PackageCheck className="h-3.5 w-3.5" />
          {units} total unit{units !== 1 ? "s" : ""}
        </div>
      </div>
    </div>
  );
}
