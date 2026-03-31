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
  // New functional fields
  safetyStock: number;
  dailyBurnRate: number;
  demandVariability: "stable" | "moderate" | "erratic";
  distinctCustomers: number;
  recommendedOrderQty: number; // toOrder + safetyStock buffer
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
export type ViewDensity = "compact" | "comfortable";

export const PINNED_KEY = "buying-sheet-pinned";
export const DENSITY_KEY = "buying-sheet-density";
export const RECENTLY_ORDERED_KEY = "buying-sheet-recently-ordered";

export const loadPinned = (): string[] => {
  try { return JSON.parse(localStorage.getItem(PINNED_KEY) || "[]"); } catch { return []; }
};
export const savePinned = (pinned: string[]) => {
  localStorage.setItem(PINNED_KEY, JSON.stringify(pinned));
};
export const loadDensity = (): ViewDensity => {
  return (localStorage.getItem(DENSITY_KEY) as ViewDensity) || "comfortable";
};
export const saveDensity = (density: ViewDensity) => {
  localStorage.setItem(DENSITY_KEY, density);
};

export interface RecentlyOrderedItem {
  sku: string;
  itemName: string;
  quantity: number;
  orderedAt: string;
  supplier: string;
}

export const loadRecentlyOrdered = (): RecentlyOrderedItem[] => {
  try { return JSON.parse(localStorage.getItem(RECENTLY_ORDERED_KEY) || "[]"); } catch { return []; }
};
export const saveRecentlyOrdered = (items: RecentlyOrderedItem[]) => {
  localStorage.setItem(RECENTLY_ORDERED_KEY, JSON.stringify(items.slice(0, 50)));
};

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
