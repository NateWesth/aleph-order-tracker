import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";

export interface AssignmentMember { id: string; full_name: string | null; email: string | null }
export interface AssignmentClient { id: string; name: string; purchasing_invoicing_user_id?: string | null }

export default function ClientOrderAssignmentDialog({ company, team, teamLoading, teamError, onClose, onSaved }: {
  company: AssignmentClient | null; team: AssignmentMember[]; teamLoading: boolean; teamError: string | null;
  onClose: () => void; onSaved: () => void;
}) {
  const [selectedUser, setSelectedUser] = useState("none");
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();
  useEffect(() => { setSelectedUser(company?.purchasing_invoicing_user_id || "none"); }, [company]);
  const save = async () => {
    if (!company) return;
    setSaving(true);
    try {
      const userId = selectedUser === "none" ? null : selectedUser;
      const { data, error } = await supabase.from("companies")
        .update({ purchasing_invoicing_user_id: userId }).eq("id", company.id)
        .select("id, purchasing_invoicing_user_id").single();
      if (error) throw error;
      if (data.purchasing_invoicing_user_id !== userId) throw new Error("The client assignment was not saved.");
      toast({ title: userId ? "Client orders assigned" : "Automatic assignment removed", description: userId ? "Existing and future orders are assigned for purchasing and invoicing." : "Existing order assignments are kept." });
      onSaved();
      onClose();
    } catch (error) {
      toast({ title: "Assignment failed", description: error instanceof Error ? error.message : "Please try again.", variant: "destructive" });
    } finally { setSaving(false); }
  };
  return <Dialog open={Boolean(company)} onOpenChange={(open) => { if (!open && !saving) onClose(); }}>
    <DialogContent className="sm:max-w-md">
      <DialogHeader><DialogTitle>{company?.name} — Purchasing & invoicing</DialogTitle></DialogHeader>
      <div className="space-y-2">
        <Label htmlFor="client-order-user">Assigned user</Label>
        <Select value={selectedUser} onValueChange={setSelectedUser} disabled={saving || teamLoading || Boolean(teamError)}>
          <SelectTrigger id="client-order-user"><SelectValue placeholder="Choose a user" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="none">No automatic assignment</SelectItem>
            {company?.purchasing_invoicing_user_id && !team.some(member => member.id === company.purchasing_invoicing_user_id) && <SelectItem value={company.purchasing_invoicing_user_id} disabled>Previously linked user (unavailable)</SelectItem>}
            {team.map(member => <SelectItem key={member.id} value={member.id}>{member.full_name || member.email || "Team member"}</SelectItem>)}
          </SelectContent>
        </Select>
        {teamError && <p className="text-sm text-destructive">{teamError}</p>}
      </div>
      <DialogFooter><Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button><Button onClick={() => void save()} disabled={saving || teamLoading || Boolean(teamError)}>{saving ? "Saving…" : "Save assignment"}</Button></DialogFooter>
    </DialogContent>
  </Dialog>;
}