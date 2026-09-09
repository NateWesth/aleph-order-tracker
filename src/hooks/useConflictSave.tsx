import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
type Pending = { current: Record<string, unknown>; patch: Record<string, unknown>; proceed: (apply: boolean) => void };
const display = (value: unknown) => value === null || value === undefined || value === "" ? "Not set" : String(value);

/** Compare-and-swap runs under database row locks, not an unsafe read-then-write in the browser. */
export function useConflictSave() {
  const [pending, setPending] = useState<Pending | null>(null);
  const resolver = useRef<((value: boolean) => void) | null>(null);
  const busy = useRef(false);
  useEffect(() => () => { resolver.current?.(false); }, []);
  const save = async (table: string, id: string, patch: Record<string, unknown>, expected: string | null) => {
    if (busy.current) throw new Error("Finish the current save first.");
    if (!navigator.onLine) throw new Error("Not synced. Your draft is kept on this device; reconnect before saving.");
    busy.current = true;
    try {
      for (;;) {
        const { data, error } = await (supabase as any).rpc("save_workflow_record", {
          p_table: table, p_id: id, p_patch: patch, p_expected_updated_at: expected,
        });
        if (error) throw new Error(error.message);
        if (data?.saved) return true;
        if (!data?.conflict) throw new Error("The record was removed or is no longer available to you.");
        const apply = await new Promise<boolean>(resolve => {
          resolver.current = resolve;
          setPending({ current: data.current, patch, proceed: resolve });
        });
        resolver.current = null; setPending(null);
        if (!apply) return false;
        expected = data.current.updated_at;
      }
    } finally { busy.current = false; }
  };
  const close = () => pending?.proceed(false);
  const dialog = <Dialog open={!!pending} onOpenChange={open => { if (!open) close(); }}>
    <DialogContent className="z-[200] max-h-[85dvh] overflow-y-auto sm:max-w-2xl">
      <DialogHeader><DialogTitle>This record changed while you were editing</DialogTitle><DialogDescription>Your draft has not been lost or saved over the other update. Review the differences before choosing what to do.</DialogDescription></DialogHeader>
      <div className="space-y-3">{pending && Object.keys(pending.patch).filter(key => JSON.stringify(pending.patch[key]) !== JSON.stringify(pending.current[key])).map(key =>
        <div key={key} className="rounded-xl border p-3"><p className="mb-2 text-xs font-semibold uppercase">{key.split("_").join(" ")}</p><div className="grid grid-cols-2 gap-3 text-sm"><div><p className="text-xs text-muted-foreground">Latest saved value</p><p className="break-words">{display(pending.current[key])}</p></div><div><p className="text-xs text-muted-foreground">Your proposed value</p><p className="break-words">{display(pending.patch[key])}</p></div></div></div>)}</div>
      <p className="text-xs text-muted-foreground">Applying yours replaces only these submitted fields. We check again if someone changes the record during this review.</p>
      <div className="flex flex-wrap justify-end gap-2"><Button variant="outline" onClick={close}>Keep my draft, do not save</Button><Button onClick={() => pending?.proceed(true)}>Apply my changes to latest</Button></div>
    </DialogContent>
  </Dialog>;
  return { save, dialog };
}
