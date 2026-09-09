/** Read-only projections from explicit PO/order links. Never allocates stock or writes operational records. */
export interface ScenarioPO {
  purchaseOrderId: string;
  purchaseOrderNumber: string;
  vendorId: string;
  vendorName: string;
  expectedDeliveryDate: string | null;
  status: string;
  lines: { outstanding?: number; quantity: number; quantityReceived?: number }[];
}
export interface ScenarioOrder {
  id: string;
  order_number: string;
  status: string | null;
  completed_date: string | null;
  company_id: string | null;
  customer: string;
  urgency: string | null;
  fulfillment_scheduled_for: string | null;
}
export interface ScenarioLink { order_id: string; purchase_order_number: string }
export interface ScenarioOptions {
  vendor: string;
  delayDays: number;
  handlingDays: number;
  today: string;
  assumedArrival?: string;
  commitmentOverrides?: Record<string, string>;
}
export interface ScenarioImpact {
  order: ScenarioOrder;
  affectedPOs: ScenarioPO[];
  baseline: string | null;
  projected: string | null;
  shiftDays: number | null;
  commitment: string | null;
  commitmentSource: "simulation" | "scheduled" | "none";
  baselineLateDays: number | null;
  lateDays: number | null;
  unknownDates: number;
  overdueDates: number;
  assumedDates: number;
}
const DAY = 86400000;
export const poReference = (value: string) => value.trim().toUpperCase();
export const vendorKey = (po: ScenarioPO) => po.vendorId || po.vendorName.trim().toLowerCase();
export function dayNumber(value: string | null | undefined): number | null {
  if (!value) return null;
  if (typeof value !== "string" || (value.includes("T") && !Number.isFinite(Date.parse(value)))) return null;
  // Schedules are timestamps; use the business's SAST calendar date.
  const text = value.includes("T")
    ? new Date(new Date(value).getTime() + 2 * 3600000).toISOString().slice(0, 10)
    : value;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
  const parsed = Date.parse(text + "T00:00:00Z");
  return Number.isFinite(parsed) && new Date(parsed).toISOString().slice(0, 10) === text ? parsed / DAY : null;
}
const asDate = (day: number) => new Date(day * DAY).toISOString().slice(0, 10);
export const sastToday = () => new Date(Date.now() + 2 * 3600000).toISOString().slice(0, 10);
export function openPO(po: ScenarioPO): boolean {
  if (["closed", "cancelled", "canceled", "void", "draft", "rejected"].includes(po.status.toLowerCase())) return false;
  return po.lines.some(line => line && (Number.isFinite(line.outstanding)
    ? Number(line.outstanding) > 0
    : Number(line.quantity) > Number(line.quantityReceived || 0)));
}
export function parsePOCache(payload: unknown): ScenarioPO[] {
  if (!Array.isArray(payload)) throw new Error("The PO cache has an unexpected format. Refresh PO Tracking first.");
  return payload.map((value, index) => {
    if (!value || typeof value !== "object" || typeof value.purchaseOrderId !== "string" ||
      typeof value.purchaseOrderNumber !== "string" || !Array.isArray(value.lines)) {
      throw new Error("PO cache entry " + (index + 1) + " is incomplete. Refresh PO Tracking first.");
    }
    return { ...value, vendorId: String(value.vendorId || ""), vendorName: String(value.vendorName || "Unknown supplier"),
      status: String(value.status || ""), expectedDeliveryDate: value.expectedDeliveryDate || null } as ScenarioPO;
  });
}
export function simulateSupplierDelay(pos: ScenarioPO[], orders: ScenarioOrder[], links: ScenarioLink[], options: ScenarioOptions) {
  const today = dayNumber(options.today);
  if (today === null || !Number.isInteger(options.delayDays) || options.delayDays < 0 || options.delayDays > 90 ||
      !Number.isInteger(options.handlingDays) || options.handlingDays < 0 || options.handlingDays > 30) {
    throw new Error("Use a delay of 0–90 days and handling time of 0–30 days.");
  }
  const allOpen = pos.filter(openPO);
  const knownReferences = new Set(pos.map(po => poReference(po.purchaseOrderNumber)));
  const selected = allOpen.filter(po => vendorKey(po) === options.vendor);
  const byReference = new Map<string, ScenarioPO[]>();
  allOpen.forEach(po => {
    const ref = poReference(po.purchaseOrderNumber);
    byReference.set(ref, [...(byReference.get(ref) || []), po]);
  });
  const orderLinks = new Map<string, Set<string>>();
  links.forEach(link => {
    if (!orderLinks.has(link.order_id)) orderLinks.set(link.order_id, new Set());
    orderLinks.get(link.order_id)!.add(poReference(link.purchase_order_number));
  });
  const results: ScenarioImpact[] = [];
  const linkedPOs = new Set<string>();
  for (const order of orders) {
    if (order.completed_date || ["delivered", "completed", "cancelled", "canceled"].includes(order.status || "")) continue;
    const dependencies = [...new Map([...(orderLinks.get(order.id) || [])].flatMap(ref => byReference.get(ref) || [])
      .map(po => [po.purchaseOrderId, po] as const)).values()];
    const affected = dependencies.filter(po => vendorKey(po) === options.vendor);
    if (!affected.length) continue;
    affected.forEach(po => linkedPOs.add(po.purchaseOrderId));
    // Missing linked POs must not make the remaining dependency dates look complete.
    let unknownDates = [...(orderLinks.get(order.id) || [])].filter(ref => !knownReferences.has(ref)).length;
    let overdueDates = 0, assumedDates = 0;
    const baselineDates: number[] = [], projectedDates: number[] = [];
    for (const po of dependencies) {
      const selectedPO = vendorKey(po) === options.vendor;
      let date = dayNumber(po.expectedDeliveryDate);
      if (date === null && selectedPO && options.assumedArrival) {
        date = dayNumber(options.assumedArrival);
        if (date !== null) assumedDates++;
      }
      if (date === null) { unknownDates++; continue; }
      // An overdue PO is unresolved: do not invent an updated arrival date.
      if (date < today) {
        overdueDates++;
        const assumption = selectedPO ? dayNumber(options.assumedArrival) : null;
        if (assumption === null || assumption < today) { unknownDates++; continue; }
        date = assumption;
        assumedDates++;
      }
      baselineDates.push(date);
      projectedDates.push(date + (selectedPO ? options.delayDays : 0));
    }
    const baselineDay = unknownDates ? null : Math.max(...baselineDates) + options.handlingDays;
    const projectedDay = unknownDates ? null : Math.max(...projectedDates) + options.handlingDays;
    const override = options.commitmentOverrides?.[order.id];
    const commitmentDay = dayNumber(override || order.fulfillment_scheduled_for);
    results.push({
      order, affectedPOs: affected,
      baseline: baselineDay === null ? null : asDate(baselineDay),
      projected: projectedDay === null ? null : asDate(projectedDay),
      shiftDays: baselineDay === null || projectedDay === null ? null : projectedDay - baselineDay,
      commitment: commitmentDay === null ? null : asDate(commitmentDay),
      commitmentSource: commitmentDay === null ? "none" : override ? "simulation" : "scheduled",
      baselineLateDays: baselineDay === null || commitmentDay === null ? null : Math.max(0, baselineDay - commitmentDay),
      lateDays: projectedDay === null || commitmentDay === null ? null : Math.max(0, projectedDay - commitmentDay),
      unknownDates, overdueDates, assumedDates,
    });
  }
  results.sort((a, b) => (b.lateDays || 0) - (a.lateDays || 0) ||
    Number(b.order.urgency === "urgent") - Number(a.order.urgency === "urgent") || a.order.order_number.localeCompare(b.order.order_number));
  return { results, selected, unlinked: selected.filter(po => !linkedPOs.has(po.purchaseOrderId)) };
}
