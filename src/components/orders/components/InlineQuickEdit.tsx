import { useState, useRef, useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Check, X, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

interface InlineStatusEditProps {
  orderId: string;
  currentValue: string | null;
  onSaved?: () => void;
}

const STATUS_OPTIONS = [
  { value: "pending", label: "Pending" },
  { value: "ordered", label: "Awaiting Stock" },
  { value: "in-stock", label: "In Stock" },
  { value: "in-progress", label: "In Progress" },
  { value: "ready", label: "Ready" },
];

const URGENCY_OPTIONS = [
  { value: "low", label: "Low" },
  { value: "normal", label: "Normal" },
  { value: "high", label: "High" },
  { value: "urgent", label: "Urgent" },
];

export function InlineStatusEdit({ orderId, currentValue, onSaved }: InlineStatusEditProps) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const { toast } = useToast();

  const handleChange = async (newValue: string) => {
    if (newValue === currentValue) {
      setEditing(false);
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase
        .from("orders")
        .update({ status: newValue, updated_at: new Date().toISOString() })
        .eq("id", orderId);
      if (error) throw error;
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
      onSaved?.();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
      setEditing(false);
    }
  };

  const getStatusColor = (status: string | null) => {
    switch (status?.toLowerCase()) {
      case "delivered": return "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-300";
      case "in-stock": return "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300";
      case "ordered": return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300";
      case "in-progress": return "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300";
      case "ready": return "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-300";
      case "pending": return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300";
      default: return "bg-muted text-muted-foreground";
    }
  };

  if (saving) {
    return (
      <Badge className="bg-primary/10 text-primary animate-pulse">
        <Loader2 className="h-3 w-3 mr-1 animate-spin" />
        Saving...
      </Badge>
    );
  }

  if (saved) {
    return (
      <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300 transition-all">
        <Check className="h-3 w-3 mr-1" />
        Saved
      </Badge>
    );
  }

  if (editing) {
    return (
      <div onClick={(e) => e.stopPropagation()}>
        <Select defaultValue={currentValue || "pending"} onValueChange={handleChange} open>
          <SelectTrigger className="h-7 text-xs w-[130px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUS_OPTIONS.map(opt => (
              <SelectItem key={opt.value} value={opt.value} className="text-xs">
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    );
  }

  return (
    <Badge
      className={cn(getStatusColor(currentValue), "cursor-pointer hover:ring-2 hover:ring-primary/30 transition-all")}
      onClick={(e) => {
        e.stopPropagation();
        setEditing(true);
      }}
    >
      {currentValue || "pending"}
    </Badge>
  );
}

interface InlineUrgencyEditProps {
  orderId: string;
  currentValue: string | null;
  onSaved?: () => void;
}

export function InlineUrgencyEdit({ orderId, currentValue, onSaved }: InlineUrgencyEditProps) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const { toast } = useToast();

  const handleChange = async (newValue: string) => {
    if (newValue === currentValue) {
      setEditing(false);
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase
        .from("orders")
        .update({ urgency: newValue, updated_at: new Date().toISOString() })
        .eq("id", orderId);
      if (error) throw error;
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
      onSaved?.();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
      setEditing(false);
    }
  };

  const getUrgencyStyle = (urgency: string | null) => {
    switch (urgency) {
      case "urgent": return "bg-destructive text-destructive-foreground";
      case "high": return "bg-amber-500 text-white";
      case "low": return "bg-secondary text-secondary-foreground";
      default: return "bg-muted text-muted-foreground";
    }
  };

  if (saving) {
    return <Badge className="bg-primary/10 text-primary animate-pulse text-[10px]"><Loader2 className="h-3 w-3 animate-spin" /></Badge>;
  }

  if (saved) {
    return <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300 text-[10px]"><Check className="h-3 w-3" /></Badge>;
  }

  if (!currentValue || currentValue === "normal") {
    if (editing) {
      return (
        <div onClick={(e) => e.stopPropagation()}>
          <Select defaultValue="normal" onValueChange={handleChange} open>
            <SelectTrigger className="h-6 text-[10px] w-[100px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {URGENCY_OPTIONS.map(opt => (
                <SelectItem key={opt.value} value={opt.value} className="text-xs">{opt.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      );
    }
    return (
      <span
        className="text-[10px] text-muted-foreground cursor-pointer hover:text-primary transition-colors"
        onClick={(e) => { e.stopPropagation(); setEditing(true); }}
      >
        Set priority
      </span>
    );
  }

  if (editing) {
    return (
      <div onClick={(e) => e.stopPropagation()}>
        <Select defaultValue={currentValue} onValueChange={handleChange} open>
          <SelectTrigger className="h-6 text-[10px] w-[100px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {URGENCY_OPTIONS.map(opt => (
              <SelectItem key={opt.value} value={opt.value} className="text-xs">{opt.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    );
  }

  return (
    <Badge
      className={cn(getUrgencyStyle(currentValue), "text-[10px] font-semibold px-1.5 py-0 cursor-pointer hover:ring-2 hover:ring-primary/30 transition-all")}
      onClick={(e) => { e.stopPropagation(); setEditing(true); }}
    >
      {currentValue}
    </Badge>
  );
}

interface InlineNotesEditProps {
  orderId: string;
  currentValue: string | null;
  onSaved?: () => void;
}

export function InlineNotesEdit({ orderId, currentValue, onSaved }: InlineNotesEditProps) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(currentValue || "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { toast } = useToast();

  useEffect(() => {
    if (editing && textareaRef.current) {
      textareaRef.current.focus();
      textareaRef.current.setSelectionRange(value.length, value.length);
    }
  }, [editing]);

  const handleSave = async () => {
    if (value === (currentValue || "")) {
      setEditing(false);
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase
        .from("orders")
        .update({ notes: value || null, updated_at: new Date().toISOString() })
        .eq("id", orderId);
      if (error) throw error;
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
      onSaved?.();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
      setEditing(false);
    }
  };

  if (editing) {
    return (
      <div className="flex flex-col gap-1" onClick={(e) => e.stopPropagation()}>
        <Textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="text-xs min-h-[60px] resize-none"
          placeholder="Add notes..."
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleSave();
            if (e.key === "Escape") { setValue(currentValue || ""); setEditing(false); }
          }}
        />
        <div className="flex items-center gap-1 justify-end">
          <Button size="sm" variant="ghost" className="h-6 text-xs px-2" onClick={() => { setValue(currentValue || ""); setEditing(false); }}>
            <X className="h-3 w-3" />
          </Button>
          <Button size="sm" className="h-6 text-xs px-2" onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
          </Button>
        </div>
      </div>
    );
  }

  if (saved) {
    return <span className="text-xs text-emerald-600 dark:text-emerald-400 flex items-center gap-1"><Check className="h-3 w-3" /> Saved</span>;
  }

  return (
    <span
      className={cn(
        "text-xs cursor-pointer transition-colors max-w-[200px] truncate block",
        currentValue ? "text-muted-foreground hover:text-foreground" : "text-muted-foreground/50 hover:text-primary italic"
      )}
      onClick={(e) => { e.stopPropagation(); setEditing(true); }}
      title={currentValue || "Click to add notes"}
    >
      {currentValue || "Add notes..."}
    </span>
  );
}
