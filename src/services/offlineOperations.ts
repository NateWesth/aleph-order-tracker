import { supabase } from "@/integrations/supabase/client";

const STORAGE_KEY = "aleph-offline-operations-v1";
const CHANGE_EVENT = "aleph:offline-queue-change";

export type OfflineOperation =
  | { id: string; createdAt: string; kind: "update-order"; payload: { orderId: string; patch: Record<string, unknown> } }
  | { id: string; createdAt: string; kind: "upsert-collection"; payload: Record<string, unknown> }
  | { id: string; createdAt: string; kind: "complete-delivery"; payload: { orderId: string } }
  | { id: string; createdAt: string; kind: "record-collection"; payload: Record<string, unknown> }
  | { id: string; createdAt: string; kind: "create-route"; payload: Record<string, unknown> }
  | { id: string; createdAt: string; kind: "timeline-event"; payload: Record<string, unknown> };

const readQueue = (): OfflineOperation[] => {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const writeQueue = (queue: OfflineOperation[]) => {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(queue));
  window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: queue.length }));
};

export const pendingOfflineOperationCount = () => readQueue().length;

export const queueOfflineOperation = (
  operation: Omit<OfflineOperation, "id" | "createdAt">,
) => {
  const queued = {
    ...operation,
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
  } as OfflineOperation;
  writeQueue([...readQueue(), queued]);
  return queued;
};

const executeOperation = async (operation: OfflineOperation) => {
  if (operation.kind === "update-order") {
    const { error } = await supabase.from("orders").update(operation.payload.patch as never).eq("id", operation.payload.orderId);
    if (error) throw error;
    return;
  }
  if (operation.kind === "upsert-collection") {
    const { error } = await supabase.from("po_collection_state").upsert(operation.payload as never, { onConflict: "purchase_order_id" });
    if (error) throw error;
    return;
  }
  if (operation.kind === "complete-delivery") {
    const { error } = await supabase.rpc("complete_fulfillment_delivery", { p_order_id: operation.payload.orderId });
    if (error) throw error;
    return;
  }
  if (operation.kind === "record-collection") {
    const { error } = await supabase.rpc("record_po_collection", operation.payload as never);
    if (error) throw error;
    return;
  }
  if (operation.kind === "create-route") {
    const { error } = await supabase.from("dispatch_routes").insert(operation.payload as never);
    if (error) throw error;
    return;
  }
  const { error } = await supabase.from("fulfillment_timeline_events").insert(operation.payload as never);
  if (error) throw error;
};

let activeFlush: Promise<number> | null = null;

export const flushOfflineOperations = async () => {
  if (activeFlush) return activeFlush;
  activeFlush = (async () => {
    if (!navigator.onLine) return readQueue().length;
    const queue = readQueue();
    const remaining = [...queue];
    for (const operation of queue) {
      try {
        await executeOperation(operation);
        const index = remaining.findIndex((candidate) => candidate.id === operation.id);
        if (index >= 0) remaining.splice(index, 1);
        writeQueue(remaining);
      } catch (error) {
        console.warn("Offline operation is still waiting to sync", operation.kind, error);
        break;
      }
    }
    return remaining.length;
  })().finally(() => {
    activeFlush = null;
  });
  return activeFlush;
};

export const subscribeOfflineQueue = (listener: (count: number) => void) => {
  const handleChange = (event: Event) => listener(Number((event as CustomEvent<number>).detail ?? pendingOfflineOperationCount()));
  window.addEventListener(CHANGE_EVENT, handleChange);
  listener(pendingOfflineOperationCount());
  return () => window.removeEventListener(CHANGE_EVENT, handleChange);
};
