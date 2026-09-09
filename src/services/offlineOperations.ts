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

// Legacy entries have no owner identity, expected version or idempotency key.
// Preserve them for manual reconciliation instead of overwriting newer work.
export const flushOfflineOperations = async () => readQueue().length;

export const subscribeOfflineQueue = (listener: (count: number) => void) => {
  const handleChange = (event: Event) => listener(Number((event as CustomEvent<number>).detail ?? pendingOfflineOperationCount()));
  window.addEventListener(CHANGE_EVENT, handleChange);
  listener(pendingOfflineOperationCount());
  return () => window.removeEventListener(CHANGE_EVENT, handleChange);
};
