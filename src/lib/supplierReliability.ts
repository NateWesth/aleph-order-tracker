export type SupplierDelivery = {
  id: string;
  supplier_id: string;
  purchase_order_number: string;
  ordered_date: string;
  expected_date: string;
  received_date: string | null;
  cancelled: boolean;
  notes: string;
  updated_at: string;
};

export type SupplierScore = {
  samples: number;
  onTimePercent: number | null;
  averageLeadDays: number | null;
  averageDelayDays: number | null;
  safetyDays: number;
  overdue: number;
};

export const supplierNameKey = (name: string) => name.trim().replace(/\s+/g, ' ').toLocaleLowerCase('en-ZA');
export const supplierToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Johannesburg', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const day = (value: string) => Date.parse(`${value}T00:00:00Z`) / 86_400_000;

export function deliveryDateError(record: Pick<SupplierDelivery, 'ordered_date' | 'expected_date' | 'received_date' | 'cancelled'>, today = supplierToday()): string | null {
  const valid = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(day(value)) && new Date(day(value) * 86_400_000).toISOString().slice(0, 10) === value;
  if (!valid(record.ordered_date) || !valid(record.expected_date) || (record.received_date && !valid(record.received_date))) return 'Enter valid delivery dates.';
  if (record.ordered_date > today) return 'Ordered date cannot be in the future.';
  if (record.expected_date < record.ordered_date) return 'Expected date cannot precede ordered date.';
  if (record.received_date && (record.received_date < record.ordered_date || record.received_date > today)) return 'Fully received date must be between ordered date and today.';
  if (record.cancelled && record.received_date) return 'Cancelled deliveries cannot have a fully received date.';
  return null;
}

/** Only measured full receipts from the last 365 calendar days count, never customer-order completion dates. */
export function scoreSupplierDeliveries(records: SupplierDelivery[], today = supplierToday()): SupplierScore {
  const active = records.filter(r => !r.cancelled && !deliveryDateError(r, today));
  const measured = active.filter(r => r.received_date && day(r.received_date) >= day(today) - 365);
  const delays = measured.map(r => Math.max(0, day(r.received_date ?? r.expected_date) - day(r.expected_date))).sort((a, b) => a - b);
  const samples = measured.length;
  return {
    samples,
    onTimePercent: samples ? Math.round(100 * measured.filter(r => (r.received_date ?? '') <= r.expected_date).length / samples) : null,
    averageLeadDays: samples ? Math.ceil(measured.reduce((sum, r) => sum + day(r.received_date ?? r.ordered_date) - day(r.ordered_date), 0) / samples) : null,
    averageDelayDays: samples ? Math.round(delays.reduce((sum, n) => sum + n, 0) / samples * 10) / 10 : null,
    // Nearest-rank 90th percentile; wait for three measurements and bound excessive recommendations.
    safetyDays: samples >= 3 ? Math.min(30, Math.ceil(delays[Math.ceil(samples * 0.9) - 1] ?? 0)) : 0,
    overdue: active.filter(r => !r.received_date && r.expected_date < today).length,
  };
}

export function supplierSafetyStock(demandBuffer: number, dailyBurn: number, safetyDays: number): number {
  return Math.max(0, demandBuffer) + Math.ceil(Math.max(0, dailyBurn) * Math.max(0, safetyDays));
}

/** Do not apply a different vendor's history when Zoho changes the suggested supplier. Ambiguous names remain unknown. */
export function resolveSupplier<T extends { id: string; name: string }>(suppliers: T[], name: string, localId?: string | null): T | undefined {
  const matches = suppliers.filter(s => supplierNameKey(s.name) === supplierNameKey(name));
  if (matches.length === 1) return matches[0];
  return matches.find(s => s.id === localId);
}