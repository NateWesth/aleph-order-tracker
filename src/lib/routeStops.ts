import type { DispatchDocument } from "@/lib/dispatchDocuments";

export type PartyStop<T extends { doc: DispatchDocument; addr: string }> = {
  key: string; name: string; addr: string; docs: T[]; collections: number; deliveries: number;
};
const norm = (v: string | null | undefined) => (v || "").toLowerCase().replace(/\s+/g, " ").trim();
/** One stop per client/supplier site: same contact name and same address share a stop. */
export const partyKey = (doc: DispatchDocument, addr: string) => norm(doc.contact_name) + "|" + norm(addr);

export function groupByParty<T extends { doc: DispatchDocument; addr: string }>(stops: T[]): PartyStop<T>[] {
  const map = new Map<string, PartyStop<T>>();
  for (const s of stops) {
    const key = partyKey(s.doc, s.addr);
    let p = map.get(key);
    if (!p) { p = { key, name: s.doc.contact_name || "Unknown", addr: s.addr, docs: [], collections: 0, deliveries: 0 }; map.set(key, p); }
    p.docs.push(s);
    if (s.doc.kind === "collection") p.collections++; else p.deliveries++;
  }
  return [...map.values()];
}

/** Rebuild a saved run's per-document stops from an ordered party list; documents in a party stay together. */
export function routeStopsFromParties(parties: { docs: { doc: DispatchDocument; addr: string }[] }[]) {
  let seq = 0;
  return parties.flatMap(p => p.docs.map(s => ({
    sequence: ++seq, stopType: s.doc.kind, entityId: s.doc.id, reference: s.doc.reference,
    label: s.doc.contact_name, address: s.addr, completed: false,
  })));
}
