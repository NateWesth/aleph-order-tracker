export interface BuyingSheetRow {
  sku: string;
  itemName: string;
  totalNeeded: number;
  stockOnHand: number;
  onPurchaseOrder: number;
  toOrder: number;
  orders: { orderNumber: string; customerName: string; quantity: number; urgency?: string }[];
  supplierName: string;
  supplierId: string | null;
  supplierEmail?: string;
  daysWaiting: number;
  priorityScore: number;
  coveragePercent: number;
  hasUrgent: boolean;
  demandTrend: "up" | "down" | "stable" | "new";
  lastMonthQty: number;
  prevMonthQty: number;
  stockoutRiskDays: number | null;
  lastPurchasedDate: string | null;
  seasonalPattern: "peak" | "low" | "normal" | null;
  avgLeadTimeDays: number | null;
}

export interface SuggestedRestockRow {
  sku: string;
  itemName: string;
  monthsAppeared: number;
  avgMonthlyQty: number;
  totalOrders: number;
  lastOrderedDate: string;
}

export interface ZohoStockData {
  [sku: string]: { stockOnHand: number; onPurchaseOrder: number; vendorName?: string; vendorEmail?: string };
}

export type SortField = "sku" | "itemName" | "totalNeeded" | "stockOnHand" | "onPurchaseOrder" | "toOrder" | "supplierName" | "daysWaiting" | "priorityScore" | "stockoutRiskDays";
export type SortDirection = "asc" | "desc";
export type PriorityFilter = "all" | "critical" | "high" | "medium" | "low";
export type ViewMode = "table" | "suppliers" | "quick";

export const getPriorityLevel = (score: number): PriorityFilter => {
  if (score >= 70) return "critical";
  if (score >= 50) return "high";
  if (score >= 30) return "medium";
  return "low";
};

export const NOTES_KEY = "buying-sheet-notes";
export const SNAPSHOT_KEY = "buying-sheet-snapshot";

export const loadNotes = (): Record<string, string> => {
  try { return JSON.parse(localStorage.getItem(NOTES_KEY) || "{}"); } catch { return {}; }
};
export const saveNotes = (notes: Record<string, string>) => {
  localStorage.setItem(NOTES_KEY, JSON.stringify(notes));
};
