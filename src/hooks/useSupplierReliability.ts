import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { readAllRows } from '@/lib/readAllRows';
import { scoreSupplierDeliveries, type SupplierDelivery } from '@/lib/supplierReliability';
import { useLiveData } from '@/hooks/useLiveData';

export function useSupplierReliability() {
  const [suppliers, setSuppliers] = useState<{ id: string; name: string }[]>([]);
  const [deliveries, setDeliveries] = useState<SupplierDelivery[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const generation = useRef(0);
  const reload = useCallback(async () => {
    const current = ++generation.current;
    try {
      const [vendors, records] = await Promise.all([
        readAllRows((from, to) => supabase.from('suppliers').select('id,name').order('name').order('id').range(from, to)),
        readAllRows((from, to) => supabase.from('supplier_delivery_tracking').select('*').order('ordered_date', { ascending: false }).order('id').range(from, to)),
      ]);
      if (current !== generation.current) return;
      setSuppliers(vendors); setDeliveries(records); setError(null);
    } catch (e) {
      if (current === generation.current) setError(e instanceof Error ? e.message : 'Supplier deliveries could not load.');
      throw e;
    } finally { if (current === generation.current) setLoading(false); }
  }, []);
  useEffect(() => { void reload().catch(() => undefined); return () => { generation.current++; }; }, [reload]);
  useLiveData(['supplier_delivery_tracking', 'suppliers'], reload, { fallbackIntervalMs: 30_000 });
  const scores = useMemo(() => {
    const grouped = new Map<string, SupplierDelivery[]>();
    for (const delivery of deliveries) grouped.set(delivery.supplier_id, [...(grouped.get(delivery.supplier_id) ?? []), delivery]);
    return new Map(suppliers.map(s => [s.id, scoreSupplierDeliveries(grouped.get(s.id) ?? [])]));
  }, [suppliers, deliveries]);
  return { suppliers, deliveries, scores, loading, error, reload };
}