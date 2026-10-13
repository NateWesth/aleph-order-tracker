import { useEffect, useState } from "react";
import { Hammer, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

const db = supabase as any;
type Row = { id: string; material: string; sku: string | null; quantity: number; unit: string | null; project: { name: string; project_number: string | null } | null };

/** Fabrication materials flagged "Reorder" from a project popup. */
export default function FabricationReorderPanel() {
  const [rows, setRows] = useState<Row[]>([]);
  const load = () => db.from("fabrication_materials").select("id,material,sku,quantity,unit,project:fabrication_projects(name,project_number)").eq("needs_reorder", true).order("created_at")
    .then(({ data }: any) => setRows(data || []));
  useEffect(() => { load(); }, []);
  if (!rows.length) return null;
  const clear = async (id: string) => { setRows((r) => r.filter((x) => x.id !== id)); await db.from("fabrication_materials").update({ needs_reorder: false }).eq("id", id); };
  return <section className="rounded-xl border border-logo-magenta/30 bg-logo-magenta/5 p-3">
    <p className="mb-2 flex items-center gap-2 text-sm font-semibold"><Hammer className="h-4 w-4 text-logo-magenta" />Fabrication reorders <span className="text-xs text-muted-foreground">· {rows.length} flagged from projects</span></p>
    <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
      {rows.map((r) => <div key={r.id} className="flex items-center gap-2 rounded-lg border border-border bg-card/70 px-2 py-1.5 text-xs">
        <span className="min-w-0 flex-1"><strong>{r.material}</strong>{r.sku && <span className="text-muted-foreground"> · {r.sku}</span>} · {r.quantity} {r.unit || ""}
          <span className="block truncate text-[10px] text-muted-foreground">{r.project?.project_number ? r.project.project_number + " · " : ""}{r.project?.name}</span></span>
        <button type="button" title="Mark as ordered" onClick={() => clear(r.id)} className="rounded p-1 text-muted-foreground hover:bg-accent"><X className="h-3.5 w-3.5" /></button>
      </div>)}
    </div>
  </section>;
}
