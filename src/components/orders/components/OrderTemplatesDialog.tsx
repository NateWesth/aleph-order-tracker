import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { BookTemplate, Plus, Trash2, Zap, Save } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface TemplateItem {
  name: string;
  code: string;
  quantity: number;
}

interface OrderTemplate {
  id: string;
  name: string;
  description: string | null;
  company_id: string | null;
  default_items: TemplateItem[];
  default_notes: string | null;
  default_urgency: string;
  created_at: string;
}

interface OrderTemplatesDialogProps {
  companies: { id: string; name: string }[];
  onUseTemplate: (template: {
    companyId: string | null;
    urgency: string;
    notes: string;
    items: TemplateItem[];
  }) => void;
}

export default function OrderTemplatesDialog({
  companies,
  onUseTemplate,
}: OrderTemplatesDialogProps) {
  const [open, setOpen] = useState(false);
  const [templates, setTemplates] = useState<OrderTemplate[]>([]);
  const [loading, setLoading] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const { user } = useAuth();
  const { toast } = useToast();

  // Create form state
  const [newName, setNewName] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newCompanyId, setNewCompanyId] = useState<string>("");
  const [newUrgency, setNewUrgency] = useState("normal");
  const [newNotes, setNewNotes] = useState("");
  const [newItems, setNewItems] = useState<TemplateItem[]>([
    { name: "", code: "", quantity: 1 },
  ]);

  const fetchTemplates = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("order_templates")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      setTemplates(
        (data || []).map((t: any) => ({
          ...t,
          default_items: Array.isArray(t.default_items) ? t.default_items : [],
        }))
      );
    } catch (error) {
      console.error("Error fetching templates:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) fetchTemplates();
  }, [open, fetchTemplates]);

  const handleUseTemplate = (template: OrderTemplate) => {
    onUseTemplate({
      companyId: template.company_id,
      urgency: template.default_urgency,
      notes: template.default_notes || "",
      items: template.default_items,
    });
    setOpen(false);
    toast({
      title: "Template Applied",
      description: `"${template.name}" loaded into the order form.`,
    });
  };

  const handleCreateTemplate = async () => {
    if (!newName.trim() || !user?.id) return;

    const validItems = newItems.filter((i) => i.name.trim());
    try {
      const { error } = await supabase.from("order_templates").insert([{
        name: newName.trim(),
        description: newDescription.trim() || null,
        company_id: newCompanyId || null,
        default_items: validItems as any,
        default_notes: newNotes.trim() || null,
        default_urgency: newUrgency,
        created_by: user.id,
      }]);

      if (error) throw error;

      toast({ title: "Template Saved", description: `"${newName}" is ready to use.` });
      setShowCreate(false);
      resetForm();
      fetchTemplates();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to save template",
        variant: "destructive",
      });
    }
  };

  const handleDeleteTemplate = async (id: string) => {
    try {
      const { error } = await supabase.from("order_templates").delete().eq("id", id);
      if (error) throw error;
      fetchTemplates();
      toast({ title: "Template Deleted" });
    } catch {
      toast({ title: "Error", description: "Failed to delete", variant: "destructive" });
    }
  };

  const resetForm = () => {
    setNewName("");
    setNewDescription("");
    setNewCompanyId("");
    setNewUrgency("normal");
    setNewNotes("");
    setNewItems([{ name: "", code: "", quantity: 1 }]);
  };

  const addItem = () => setNewItems((prev) => [...prev, { name: "", code: "", quantity: 1 }]);
  const removeItem = (i: number) => setNewItems((prev) => prev.filter((_, idx) => idx !== i));
  const updateItem = (i: number, field: keyof TemplateItem, value: any) =>
    setNewItems((prev) => prev.map((item, idx) => (idx === i ? { ...item, [field]: value } : item)));

  const urgencyColors: Record<string, string> = {
    urgent: "bg-destructive/10 text-destructive border-destructive/30",
    high: "bg-orange-500/10 text-orange-600 border-orange-500/30",
    normal: "bg-muted text-muted-foreground border-border",
    low: "bg-sky-500/10 text-sky-600 border-sky-500/30",
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="h-9 shrink-0 gap-1.5">
          <BookTemplate className="h-4 w-4" />
          <span className="hidden sm:inline">Templates</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BookTemplate className="h-5 w-5" />
            Order Templates
          </DialogTitle>
          <DialogDescription>
            Save and reuse common order configurations for one-click creation.
          </DialogDescription>
        </DialogHeader>

        {!showCreate ? (
          <div className="space-y-3">
            <Button
              size="sm"
              variant="outline"
              className="w-full gap-2"
              onClick={() => setShowCreate(true)}
            >
              <Plus className="h-4 w-4" />
              Create New Template
            </Button>

            {loading ? (
              <p className="text-sm text-muted-foreground text-center py-6">Loading...</p>
            ) : templates.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <BookTemplate className="h-10 w-10 mx-auto mb-2 opacity-40" />
                <p className="text-sm">No templates yet. Create one to get started!</p>
              </div>
            ) : (
              templates.map((t) => {
                const company = companies.find((c) => c.id === t.company_id);
                return (
                  <div
                    key={t.id}
                    className="border border-border rounded-xl p-3 space-y-2 hover:bg-accent/50 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <h4 className="font-medium text-sm truncate">{t.name}</h4>
                        {t.description && (
                          <p className="text-xs text-muted-foreground truncate">{t.description}</p>
                        )}
                      </div>
                      <Badge
                        variant="outline"
                        className={cn("text-[10px] shrink-0", urgencyColors[t.default_urgency])}
                      >
                        {t.default_urgency}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      {company && (
                        <Badge variant="secondary" className="text-[10px]">
                          {company.name}
                        </Badge>
                      )}
                      {t.default_items.length > 0 && (
                        <span className="text-[10px] text-muted-foreground">
                          {t.default_items.length} item{t.default_items.length !== 1 ? "s" : ""}
                        </span>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        className="flex-1 gap-1.5 h-8"
                        onClick={() => handleUseTemplate(t)}
                      >
                        <Zap className="h-3.5 w-3.5" />
                        Use Template
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                        onClick={() => handleDeleteTemplate(t.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        ) : (
          /* Create Template Form */
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Template Name *</Label>
              <Input
                placeholder="e.g. Weekly Office Supply"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Input
                placeholder="Optional description"
                value={newDescription}
                onChange={(e) => setNewDescription(e.target.value)}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Default Client</Label>
                <Select value={newCompanyId} onValueChange={setNewCompanyId}>
                  <SelectTrigger>
                    <SelectValue placeholder="None" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {companies.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Default Urgency</Label>
                <Select value={newUrgency} onValueChange={setNewUrgency}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="normal">Normal</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="urgent">Urgent</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Default Notes</Label>
              <Textarea
                placeholder="Notes to pre-fill..."
                value={newNotes}
                onChange={(e) => setNewNotes(e.target.value)}
                rows={2}
              />
            </div>

            {/* Items */}
            <div className="space-y-2">
              <Label>Default Items</Label>
              {newItems.map((item, i) => (
                <div key={i} className="flex gap-2 items-center">
                  <Input
                    placeholder="Item name"
                    className="flex-1"
                    value={item.name}
                    onChange={(e) => updateItem(i, "name", e.target.value)}
                  />
                  <Input
                    placeholder="Code"
                    className="w-20"
                    value={item.code}
                    onChange={(e) => updateItem(i, "code", e.target.value)}
                  />
                  <Input
                    type="number"
                    min={1}
                    className="w-16"
                    value={item.quantity}
                    onChange={(e) => updateItem(i, "quantity", parseInt(e.target.value) || 1)}
                  />
                  {newItems.length > 1 && (
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8 shrink-0"
                      onClick={() => removeItem(i)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              ))}
              <Button size="sm" variant="outline" onClick={addItem} className="w-full gap-1.5">
                <Plus className="h-3.5 w-3.5" />
                Add Item
              </Button>
            </div>

            <div className="flex gap-2 pt-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => {
                  setShowCreate(false);
                  resetForm();
                }}
              >
                Cancel
              </Button>
              <Button
                className="flex-1 gap-1.5"
                disabled={!newName.trim()}
                onClick={handleCreateTemplate}
              >
                <Save className="h-4 w-4" />
                Save Template
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
