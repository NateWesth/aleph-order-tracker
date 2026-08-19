import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { useLiveData } from "@/hooks/useLiveData";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ArrowUpRight,
  CheckCircle2,
  CircleDashed,
  Clock,
  Loader2,
  Plus,
  Radar,
  Trash2,
} from "lucide-react";
import { cn } from "@/lib/utils";

type Priority = "critical" | "high" | "medium" | "low";
type Status = "open" | "in_progress" | "done";

const WORKSPACES = [
  { id: "orders", label: "Orders" },
  { id: "buying-sheet", label: "Buying Sheet" },
  { id: "po-tracking", label: "PO Tracking" },
  { id: "clients", label: "Clients" },
  { id: "suppliers", label: "Suppliers" },
  { id: "items", label: "Items" },
  { id: "commission", label: "Commission" },
  { id: "stats", label: "Stats" },
] as const;

const PRIORITY_ORDER: Record<Priority, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

const PRIORITY_STYLES: Record<Priority, string> = {
  critical: "border-destructive/40 bg-destructive/10 text-destructive",
  high: "border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400",
  medium: "border-primary/30 bg-primary/10 text-primary",
  low: "border-border bg-muted text-muted-foreground",
};

const STATUS_LABEL: Record<Status, string> = {
  open: "Open",
  in_progress: "In progress",
  done: "Done",
};

interface ActionItem {
  id: string;
  title: string;
  description: string | null;
  priority: Priority;
  status: Status;
  workspace: string;
  entity_id: string | null;
  created_by: string;
  assigned_to: string | null;
  due_at: string | null;
  completed_at: string | null;
  created_at: string;
}

interface TeamMember {
  id: string;
  full_name: string | null;
  email: string | null;
}

const formatDue = (value: string | null) => {
  if (!value) return null;
  const date = new Date(value);
  const today = new Date();
  const overdue = date.getTime() < today.getTime();
  return {
    overdue,
    label: date.toLocaleDateString("en-ZA", { day: "numeric", month: "short" }),
  };
};

export default function OperationsControlTower() {
  const { user } = useAuth();
  const { toast } = useToast();

  const [items, setItems] = useState<ActionItem[]>([]);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [statusFilter, setStatusFilter] = useState<"active" | Status>("active");

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<Priority>("medium");
  const [workspace, setWorkspace] = useState<string>("orders");
  const [assignedTo, setAssignedTo] = useState<string>("unassigned");
  const [dueAt, setDueAt] = useState("");

  const fetchItems = useCallback(async () => {
    const { data, error } = await supabase
      .from("team_action_items")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200);

    if (error) {
      console.error("Failed to load action items", error);
      return;
    }
    setItems((data ?? []) as ActionItem[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    void fetchItems();
    void (async () => {
      const { data } = await supabase
        .from("profiles")
        .select("id, full_name, email")
        .order("full_name", { ascending: true });
      setMembers((data ?? []) as TeamMember[]);
    })();
  }, [fetchItems]);

  useLiveData(["team_action_items"], fetchItems, { channelName: "control-tower" });

  const memberName = useCallback(
    (id: string | null) => {
      if (!id) return null;
      const match = members.find((m) => m.id === id);
      return match?.full_name || match?.email || "Team member";
    },
    [members]
  );

  const visibleItems = useMemo(() => {
    const filtered = items.filter((item) =>
      statusFilter === "active" ? item.status !== "done" : item.status === statusFilter
    );
    return filtered.sort((a, b) => {
      const p = PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
      if (p !== 0) return p;
      if (a.due_at && b.due_at) return a.due_at.localeCompare(b.due_at);
      if (a.due_at) return -1;
      if (b.due_at) return 1;
      return b.created_at.localeCompare(a.created_at);
    });
  }, [items, statusFilter]);

  const counts = useMemo(
    () => ({
      open: items.filter((i) => i.status === "open").length,
      in_progress: items.filter((i) => i.status === "in_progress").length,
      done: items.filter((i) => i.status === "done").length,
      overdue: items.filter(
        (i) => i.status !== "done" && i.due_at && new Date(i.due_at).getTime() < Date.now()
      ).length,
    }),
    [items]
  );

  const resetForm = () => {
    setTitle("");
    setDescription("");
    setPriority("medium");
    setWorkspace("orders");
    setAssignedTo("unassigned");
    setDueAt("");
  };

  const createItem = async () => {
    if (!user) return;
    const trimmed = title.trim();
    if (trimmed.length < 2) {
      toast({ title: "Add a title", description: "Give the task a short, clear name.", variant: "destructive" });
      return;
    }

    setSaving(true);
    const { error } = await supabase.from("team_action_items").insert({
      title: trimmed,
      description: description.trim() || null,
      priority,
      workspace,
      assigned_to: assignedTo === "unassigned" ? null : assignedTo,
      due_at: dueAt ? new Date(dueAt).toISOString() : null,
      created_by: user.id,
    });
    setSaving(false);

    if (error) {
      toast({ title: "Could not add task", description: error.message, variant: "destructive" });
      return;
    }
    resetForm();
    void fetchItems();
  };

  const updateItem = async (item: ActionItem, patch: Partial<ActionItem>) => {
    setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, ...patch } : i)));
    const { error } = await supabase
      .from("team_action_items")
      .update(patch as never)
      .eq("id", item.id);
    if (error) {
      toast({ title: "Update failed", description: error.message, variant: "destructive" });
      void fetchItems();
    }
  };

  const cycleStatus = (item: ActionItem) => {
    const next: Status =
      item.status === "open" ? "in_progress" : item.status === "in_progress" ? "done" : "open";
    void updateItem(item, {
      status: next,
      completed_at: next === "done" ? new Date().toISOString() : null,
    });
  };

  const removeItem = async (item: ActionItem) => {
    setItems((prev) => prev.filter((i) => i.id !== item.id));
    const { error } = await supabase.from("team_action_items").delete().eq("id", item.id);
    if (error) {
      toast({ title: "Could not remove task", description: error.message, variant: "destructive" });
      void fetchItems();
    }
  };

  const openWorkspace = (view: string) => {
    window.dispatchEvent(new CustomEvent("setActiveView", { detail: view }));
  };

  return (
    <div className="space-y-4">
      <Card className="glass-panel">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Radar className="h-4 w-4 text-primary" />
            Operations Control Tower
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            One shared queue for whatever the team needs to chase next.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[
              { label: "Open", value: counts.open },
              { label: "In progress", value: counts.in_progress },
              { label: "Overdue", value: counts.overdue },
              { label: "Done", value: counts.done },
            ].map((stat) => (
              <div key={stat.label} className="rounded-lg border border-border/60 bg-card/50 p-3">
                <div className="text-xl font-semibold tabular-nums">{stat.value}</div>
                <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
                  {stat.label}
                </div>
              </div>
            ))}
          </div>

          <div className="grid gap-2 rounded-lg border border-border/60 bg-card/40 p-3 md:grid-cols-[minmax(0,2fr)_repeat(3,minmax(0,1fr))_auto]">
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="What needs to happen?"
              className="h-9"
              onKeyDown={(e) => {
                if (e.key === "Enter") void createItem();
              }}
            />
            <Select value={priority} onValueChange={(v) => setPriority(v as Priority)}>
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="critical">Critical</SelectItem>
                <SelectItem value="high">High</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="low">Low</SelectItem>
              </SelectContent>
            </Select>
            <Select value={workspace} onValueChange={setWorkspace}>
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {WORKSPACES.map((w) => (
                  <SelectItem key={w.id} value={w.id}>
                    {w.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={assignedTo} onValueChange={setAssignedTo}>
              <SelectTrigger className="h-9">
                <SelectValue placeholder="Assign" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="unassigned">Unassigned</SelectItem>
                {members.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.full_name || m.email || "Team member"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button onClick={() => void createItem()} disabled={saving} className="h-9">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              <span className="ml-1">Add</span>
            </Button>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional detail or context"
              className="min-h-[38px] md:col-span-3"
              rows={1}
            />
            <Input
              type="date"
              value={dueAt}
              onChange={(e) => setDueAt(e.target.value)}
              className="h-9 md:col-span-2"
            />
          </div>

          <div className="flex flex-wrap gap-1.5">
            {(["active", "open", "in_progress", "done"] as const).map((key) => (
              <Button
                key={key}
                size="sm"
                variant={statusFilter === key ? "secondary" : "ghost"}
                className="h-7 text-xs"
                onClick={() => setStatusFilter(key)}
              >
                {key === "active" ? "Active" : STATUS_LABEL[key]}
              </Button>
            ))}
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-10 text-sm text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading action queue…
            </div>
          ) : visibleItems.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border/60 py-10 text-center">
              <CheckCircle2 className="mx-auto mb-2 h-8 w-8 text-primary/60" />
              <p className="text-sm font-medium">Nothing in this lane</p>
              <p className="text-xs text-muted-foreground">Add a task above to get the team moving.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {visibleItems.map((item) => {
                const due = formatDue(item.due_at);
                const assignee = memberName(item.assigned_to);
                return (
                  <div
                    key={item.id}
                    className={cn(
                      "flex items-start gap-3 rounded-lg border border-border/60 bg-card/50 p-3 transition-colors hover:bg-muted/50",
                      item.status === "done" && "opacity-60"
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => cycleStatus(item)}
                      className="mt-0.5 text-muted-foreground transition-colors hover:text-primary"
                      aria-label={`Mark task ${STATUS_LABEL[item.status]}`}
                    >
                      {item.status === "done" ? (
                        <CheckCircle2 className="h-5 w-5 text-primary" />
                      ) : item.status === "in_progress" ? (
                        <Clock className="h-5 w-5 text-amber-500" />
                      ) : (
                        <CircleDashed className="h-5 w-5" />
                      )}
                    </button>

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={cn(
                            "text-sm font-medium",
                            item.status === "done" && "line-through"
                          )}
                        >
                          {item.title}
                        </span>
                        <Badge variant="outline" className={cn("text-[10px]", PRIORITY_STYLES[item.priority])}>
                          {item.priority}
                        </Badge>
                        <Badge variant="outline" className="text-[10px]">
                          {STATUS_LABEL[item.status]}
                        </Badge>
                        {due && (
                          <Badge
                            variant="outline"
                            className={cn(
                              "text-[10px]",
                              due.overdue && item.status !== "done" &&
                                "border-destructive/40 bg-destructive/10 text-destructive"
                            )}
                          >
                            Due {due.label}
                          </Badge>
                        )}
                      </div>
                      {item.description && (
                        <p className="mt-1 text-xs text-muted-foreground">{item.description}</p>
                      )}
                      <div className="mt-1 text-[11px] text-muted-foreground">
                        {assignee ? `Assigned to ${assignee}` : "Unassigned"}
                      </div>
                    </div>

                    <div className="flex items-center gap-1">
                      <Select
                        value={item.assigned_to ?? "unassigned"}
                        onValueChange={(v) =>
                          void updateItem(item, { assigned_to: v === "unassigned" ? null : v })
                        }
                      >
                        <SelectTrigger className="hidden h-7 w-[140px] text-xs sm:flex">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="unassigned">Unassigned</SelectItem>
                          {members.map((m) => (
                            <SelectItem key={m.id} value={m.id}>
                              {m.full_name || m.email || "Team member"}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7"
                        title={`Open ${item.workspace}`}
                        onClick={() => openWorkspace(item.workspace)}
                      >
                        <ArrowUpRight className="h-4 w-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 text-muted-foreground hover:text-destructive"
                        onClick={() => void removeItem(item)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
