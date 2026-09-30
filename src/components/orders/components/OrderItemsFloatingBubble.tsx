import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Package, PackageCheck, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { getItemDisplayName, getItemSecondaryDescription, isMiscellaneousItem } from "@/lib/itemDisplay";
import OrderItemComments from "./OrderItemComments";

interface OrderItem {
  id: string;
  name: string;
  code: string | null;
  description?: string | null;
  notes?: string | null;
  quantity: number;
  stock_status: string;
  totalQuantity?: number;
  commentCount?: number;
  latestCommentAt?: string;
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
  commentCount?: number;
  latestCommentAt?: string;
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

  useEffect(() => {
    if (!order) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [order, onClose]);

  if (!visibleOrder || typeof document === "undefined") return null;

  const items = visibleOrder.items || [];
  const units = items.reduce((sum, item) => sum + (item.quantity || 0), 0);
  const created = visibleOrder.created_at ? new Date(visibleOrder.created_at).toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" }) : "—";
  const urgent = ["high", "urgent"].includes((visibleOrder.urgency || "").toLowerCase());
  const stage = visibleOrder.boardStage || visibleOrder.status || "Active";

  return createPortal(
    <div className="fulfillment-modal-backdrop fixed inset-0 z-[120] flex items-center justify-center p-2.5 sm:p-6" role="presentation">
      <button type="button" className="absolute inset-0 bg-black/45" onClick={onClose} aria-label="Close order" />
      <section
        className={cn(
          "fulfillment-detail-modal animate-order-floating-bubble relative flex max-h-[calc(100dvh-1.25rem)] w-full max-w-5xl flex-col overflow-hidden rounded-[28px] border border-border bg-background shadow-[0_24px_60px_-20px_hsl(var(--foreground)/0.35)] sm:max-h-[calc(100dvh-3rem)]",
          isSwitching && "opacity-80 scale-[0.995]",
          "transition-[opacity,transform] duration-150",
        )}
        role="dialog"
        aria-modal="true"
        aria-label={`Order ${visibleOrder.order_number}`}
      >
        <div className="ribbon-bar h-1.5 shrink-0" aria-hidden />
        <header className="shrink-0 border-b border-border bg-background p-4 sm:px-6 sm:py-5">
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-4">
              <span className="grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-2xl bg-muted p-1 shadow-sm ring-1 ring-border"><img src="/lovable-uploads/e1088147-889e-43f6-bdf0-271189b88913.png" alt="" className="h-full w-full object-contain" /></span>
              <div className="min-w-0">
                <h2 key={visibleOrder.id} className="truncate font-display text-xl font-black tracking-tight sm:text-2xl animate-order-floating-bubble-content">{visibleOrder.order_number}</h2>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <span className="rounded-full border border-primary/30 bg-primary/10 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-tighter text-primary">{stage}</span>
                  {urgent && <span className="rounded-full border border-destructive/30 bg-destructive/10 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-tighter text-destructive">Urgent</span>}
                  <span className="truncate text-xs font-semibold text-muted-foreground">{visibleOrder.companyName || "No client"}</span>
                </div>
              </div>
            </div>
            <button type="button" onClick={onClose} className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-muted text-muted-foreground transition-all hover:scale-105 hover:bg-destructive/10 hover:text-destructive" aria-label="Close order"><X className="h-4 w-4" /></button>
          </div>
        </header>
        <div className="grid shrink-0 grid-cols-2 gap-x-4 gap-y-3 border-b border-border bg-muted/20 px-4 py-3.5 sm:grid-cols-4 sm:px-6">
          <div><p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Client</p><p className="mt-0.5 truncate text-sm font-medium">{visibleOrder.companyName || "—"}</p></div>
          <div><p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Created</p><p className="mt-0.5 truncate text-sm font-medium">{created}</p></div>
          <div><p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Reference</p><p className="mt-0.5 truncate text-sm font-medium">{visibleOrder.reference || "—"}</p></div>
          <div><p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Created by</p><p className="mt-0.5 truncate text-sm font-medium">{visibleOrder.creatorName || "—"}</p></div>
        </div>
        <div key={`body-${visibleOrder.id}`} className="grid flex-1 grid-cols-1 overflow-y-auto lg:grid-cols-12 animate-order-floating-bubble-content">
          <aside className="flex flex-col gap-7 border-b border-border/60 p-4 sm:p-6 lg:col-span-5 lg:border-b-0 lg:border-r">
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-2xl border border-border/60 bg-muted/40 p-4">
                <p className="font-display text-2xl font-bold text-primary">{items.length}</p>
                <p className="mt-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Items</p>
              </div>
              <div className="rounded-2xl border border-border/60 bg-muted/40 p-4">
                <p className="font-display text-2xl font-bold text-logo-violet">{units}</p>
                <p className="mt-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Units</p>
              </div>
              <div className="rounded-2xl border border-border/60 bg-muted/40 p-4">
                <p className="font-display text-2xl font-bold text-logo-magenta">{visibleOrder.commentCount || 0}</p>
                <p className="mt-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Notes</p>
              </div>
            </div>
            <div className="space-y-5">
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm text-muted-foreground">Status</span>
                <span className="flex items-center gap-2 text-sm font-medium capitalize"><span className="h-2 w-2 rounded-full bg-logo-cyan" />{visibleOrder.status || "—"}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm text-muted-foreground">Priority</span>
                <span className={cn("text-sm font-medium capitalize", urgent && "text-destructive")}>{visibleOrder.urgency || "Normal"}</span>
              </div>
              {visibleOrder.description && (
                <div>
                  <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Description</p>
                  <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-muted-foreground">{visibleOrder.description}</p>
                </div>
              )}
            </div>
          </aside>
          <section className="flex min-h-0 flex-col lg:col-span-7">
            <div className="flex items-center justify-between gap-3 border-b border-border/60 px-4 py-3.5 sm:px-6">
              <h3 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider"><span className="h-1.5 w-1.5 rounded-full bg-logo-magenta" />Line items</h3>
              <span className="flex items-center gap-1.5 text-[11px] font-bold uppercase text-muted-foreground"><PackageCheck className="h-3.5 w-3.5" />{units} unit{units !== 1 ? "s" : ""}</span>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
              {items.length === 0 ? (
                <p className="p-6 text-center text-sm text-muted-foreground">No items on this order.</p>
              ) : (
                <div className="divide-y divide-border/60">
                  {items.map((item) => {
                    const total = item.totalQuantity ?? item.quantity;
                    const stockStyle = getStockStatusStyle(item.stock_status);
                    const secondary = getItemSecondaryDescription(item);
                    return (
                      <div key={item.id} className="group flex items-center gap-4 px-4 py-4 transition-colors hover:bg-muted/30 sm:px-6">
                        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-muted text-xs font-bold text-muted-foreground transition-colors group-hover:text-primary">×{item.quantity}</div>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                            <p className="break-words text-sm font-semibold">{getItemDisplayName(item)}</p>
                            {item.stock_status && <span className={cn("inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold", stockStyle.chip)}><span className={cn("h-1.5 w-1.5 rounded-full", stockStyle.dot)} />{stockStyle.label}</span>}
                          </div>
                          <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                            <span className="font-mono">{item.code || "No SKU"}</span>
                            {secondary && <span className="break-words">{secondary}</span>}
                            {total > item.quantity && <span>{item.quantity} of {total}</span>}
                            {(isMiscellaneousItem(item.code) || isMiscellaneousItem(item.name)) && <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary">custom line</span>}
                          </div>
                        </div>
                        <OrderItemComments orderItemId={item.id} initialCount={item.commentCount || 0} className="h-9 w-9 shrink-0 border border-border bg-muted/40" />
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </section>
        </div>
      </section>
    </div>,
    document.body,
  );
}
