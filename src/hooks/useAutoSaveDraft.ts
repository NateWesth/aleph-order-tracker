import { useState, useEffect, useCallback, useRef } from "react";

const DRAFT_KEY = "order-form-draft";
const DEBOUNCE_MS = 500;

export interface OrderDraft {
  companyId: string;
  urgency: string;
  items: Array<{ id: string; name: string; code: string; quantity: number }>;
  purchaseOrders: Array<{ id: string; supplierId: string; purchaseOrderNumber: string }>;
  savedAt: number;
}

export function useAutoSaveDraft() {
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  const loadDraft = useCallback((): OrderDraft | null => {
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (!raw) return null;
      const draft: OrderDraft = JSON.parse(raw);
      // Expire drafts older than 24 hours
      if (Date.now() - draft.savedAt > 24 * 60 * 60 * 1000) {
        localStorage.removeItem(DRAFT_KEY);
        return null;
      }
      return draft;
    } catch {
      return null;
    }
  }, []);

  const saveDraft = useCallback((draft: Omit<OrderDraft, "savedAt">) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      try {
        localStorage.setItem(DRAFT_KEY, JSON.stringify({ ...draft, savedAt: Date.now() }));
      } catch {
        // localStorage full or unavailable
      }
    }, DEBOUNCE_MS);
  }, []);

  const clearDraft = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    localStorage.removeItem(DRAFT_KEY);
  }, []);

  const hasDraft = useCallback(() => {
    return loadDraft() !== null;
  }, [loadDraft]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  return { loadDraft, saveDraft, clearDraft, hasDraft };
}
