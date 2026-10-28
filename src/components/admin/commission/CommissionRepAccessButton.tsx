import { useEffect, useState } from "react";
import { Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

type Rep = { id: string; name: string };

/** Admin picker: which reps' commission a user may view and work with. None picked = all reps. */
export const CommissionRepAccessButton = ({ userId }: { userId: string }) => {
  const { toast } = useToast();
  const [reps, setReps] = useState<Rep[]>([]);
  const [allowed, setAllowed] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const [r, a] = await Promise.all([
      supabase.from("reps").select("id, name").order("name"),
      (supabase as any).from("commission_rep_access").select("rep_id").eq("user_id", userId),
    ]);
    setReps((r.data as Rep[]) || []);
    setAllowed(new Set(((a.data as { rep_id: string }[]) || []).map((x) => x.rep_id)));
  };
  useEffect(() => { void load(); }, [userId]);

  const toggle = async (repId: string, on: boolean) => {
    setBusy(true);
    const { data: { user } } = await supabase.auth.getUser();
    const q = (supabase as any).from("commission_rep_access");
    const { error } = on
      ? await q.insert({ user_id: userId, rep_id: repId, created_by: user?.id ?? null })
      : await q.delete().eq("user_id", userId).eq("rep_id", repId);
    setBusy(false);
    if (error) { toast({ title: "Could not save", description: error.message, variant: "destructive" }); return; }
    await load();
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button size="sm" variant="outline" className="sm:col-span-2">
          <Users className="mr-1 h-4 w-4" />
          {allowed.size === 0 ? "Commission: all reps" : `Commission: ${allowed.size} rep${allowed.size === 1 ? "" : "s"}`}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 max-h-80 overflow-y-auto">
        <p className="mb-1 text-sm font-medium">Whose commission can they see?</p>
        <p className="mb-2 text-xs text-muted-foreground">Tick reps to limit access. Nothing ticked means all reps.</p>
        <div className="space-y-1.5">
          {reps.map((r) => (
            <label key={r.id} className="flex cursor-pointer items-center gap-2 text-sm">
              <Checkbox checked={allowed.has(r.id)} disabled={busy} onCheckedChange={(v) => toggle(r.id, !!v)} />
              {r.name}
            </label>
          ))}
          {reps.length === 0 && <p className="text-xs text-muted-foreground">No reps yet.</p>}
        </div>
      </PopoverContent>
    </Popover>
  );
};
