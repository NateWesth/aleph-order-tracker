import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { PackageCheck, Send, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { getItemDisplayName, getItemSecondaryDescription, isMiscellaneousItem } from "@/lib/itemDisplay";
import OrderItemComments from "./OrderItemComments";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { format } from "date-fns";
import { bubbleClass, bubbleTime, nameColorClass, markCommentsSeen } from "@/lib/commentStyles";

interface OrderUpdate {
  id: string;
  order_id: string;
  user_id: string;
  message: string;
  created_at: string;
  author_name?: string | null;
}

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
  const { user } = useAuth();
  const [updates, setUpdates] = useState<OrderUpdate[]>([]);
  const [updatesLoading, setUpdatesLoading] = useState(false);
  const [newNote, setNewNote] = useState("");
  const [postingNote, setPostingNote] = useState(false);

  useEffect(() => {
    if (order?.id) markCommentsSeen(`order:${order.id}`, order.commentCount || 0);
  }, [order?.id, order?.commentCount]);

  useEffect(() => {
    if (!visibleOrder?.id) {
      setUpdates([]);
      return;
    }

    let cancelled = false;
    setUpdatesLoading(true);

    const fetchUpdates = async () => {
      try {
        const { data, error } = await supabase
          .from("order_updates")
          .select("id, order_id, user_id, message, created_at, profiles!inner(full_name, email)")
          .eq("order_id", visibleOrder.id)
          .order("created_at", { ascending: true });

        if (error) throw error;
        if (cancelled) return;

        setUpdates(
          (data || []).map((row: any) => {
            const profile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
            return {
              id: row.id,
              order_id: row.order_id,
              user_id: row.user_id,
              message: row.message,
              created_at: row.created_at,
              author_name: profile?.full_name || profile?.email || null,
            };
          }),
        );
      } catch (error) {
        console.error("Failed to load order notes:", error);
        if (!cancelled) setUpdates([]);
      } finally {
        if (!cancelled) setUpdatesLoading(false);
      }
    };

    fetchUpdates();
    return () => {
      cancelled = true;
    };
  }, [visibleOrder?.id]);

  const submitNote = async () => {
    const message = newNote.trim();
    if (!message || !user?.id || !visibleOrder) return;

    setPostingNote(true);
    try {
      const { data, error } = await supabase
        .from("order_updates")
        .insert({ order_id: visibleOrder.id, user_id: user.id, message })
        .select("id, order_id, user_id, message, created_at, profiles!inner(full_name, email)")
        .single();

      if (error) throw error;

      const profile = Array.isArray((data as any).profiles) ? (data as any).profiles[0] : (data as any).profiles;
      setUpdates((prev) => [
        ...prev,
        {
          id: data.id,
          order_id: data.order_id,
          user_id: data.user_id,
          message: data.message,
          created_at: data.created_at,
          author_name: profile?.full_name || profile?.email || null,
        },
      ]);
      setNewNote("");
    } catch (error) {
      console.error("Failed to post note:", error);
    } finally {
      setPostingNote(false);
    }
  };

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
              <div>
                <div className="mb-2 flex items-center justify-between gap-2">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Notes & comments</p>
                  <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-bold text-muted-foreground">{updates.length}</span>
                </div>
                <div className="max-h-52 space-y-3 overflow-y-auto pr-1">
                  {updatesLoading ? (
                    <p className="text-xs text-muted-foreground">Loading notes…</p>
                  ) : updates.length === 0 ? (
                    <p className="text-xs text-muted-foreground">No notes yet. Start the conversation below.</p>
                  ) : (
                    updates.map((update) => {
                      return (
                        <div key={update.id} className={cn("flex", update.user_id === user?.id ? "justify-end" : "justify-start")}>
                          <div className={cn("max-w-[80%] rounded-md border px-1 py-px text-[9px] leading-tight", bubbleClass(update.user_id === user?.id))}>
                            <div className="flex items-baseline gap-1.5 text-[7.5px] leading-tight">
                              <span className={cn("font-semibold", nameColorClass(update.user_id))}>{update.user_id === user?.id ? "You" : update.author_name || "Unknown"}</span>
                              <span className="ml-auto text-muted-foreground/80">{bubbleTime(update.created_at)}</span>
                            </div>
                            <p className="whitespace-pre-wrap break-words text-foreground">{update.message}</p>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
                <div className="mt-3 flex items-end gap-2">
                  <textarea
                    value={newNote}
                    onChange={(e) => setNewNote(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        submitNote();
                      }
                    }}
                    placeholder="Add a note…"
                    rows={2}
                    className="min-h-[2.5rem] flex-1 resize-none rounded-xl border border-border bg-background px-3 py-2 text-xs outline-none transition-colors placeholder:text-muted-foreground focus:border-primary/50"
                  />
                  <button
                    type="button"
                    onClick={submitNote}
                    disabled={!newNote.trim() || postingNote}
                    className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground transition-all hover:scale-105 disabled:cursor-not-allowed disabled:opacity-50"
                    aria-label="Post note"
                  >
                    <Send className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
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
