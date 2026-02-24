import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Bookmark, Plus, X, Filter, Save } from "lucide-react";
import { cn } from "@/lib/utils";

const SAVED_FILTERS_KEY = "order-saved-filters";

export interface OrderFilter {
  id: string;
  name: string;
  companyId: string;
  urgency: string;
  dateRange: string; // "all" | "today" | "week" | "month"
}

interface SavedFiltersBarProps {
  activeFilter: OrderFilter | null;
  onApplyFilter: (filter: OrderFilter | null) => void;
  companies: { id: string; name: string }[];
}

const DEFAULT_FILTER: Omit<OrderFilter, "id" | "name"> = {
  companyId: "all",
  urgency: "all",
  dateRange: "all",
};

export default function SavedFiltersBar({ activeFilter, onApplyFilter, companies }: SavedFiltersBarProps) {
  const [savedFilters, setSavedFilters] = useState<OrderFilter[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [filterName, setFilterName] = useState("");
  const [draft, setDraft] = useState<Omit<OrderFilter, "id" | "name">>(DEFAULT_FILTER);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(SAVED_FILTERS_KEY);
      if (saved) setSavedFilters(JSON.parse(saved));
    } catch { /* use defaults */ }
  }, []);

  const persist = (filters: OrderFilter[]) => {
    setSavedFilters(filters);
    localStorage.setItem(SAVED_FILTERS_KEY, JSON.stringify(filters));
  };

  const handleSave = () => {
    if (!filterName.trim()) return;
    const newFilter: OrderFilter = {
      id: Date.now().toString(),
      name: filterName.trim(),
      ...draft,
    };
    persist([...savedFilters, newFilter]);
    onApplyFilter(newFilter);
    setFilterName("");
    setDraft(DEFAULT_FILTER);
    setDialogOpen(false);
  };

  const handleDelete = (id: string) => {
    persist(savedFilters.filter(f => f.id !== id));
    if (activeFilter?.id === id) onApplyFilter(null);
  };

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {/* Saved filter chips */}
      {savedFilters.map(filter => (
        <Badge
          key={filter.id}
          variant={activeFilter?.id === filter.id ? "default" : "outline"}
          className={cn(
            "cursor-pointer gap-1 pl-2 pr-1 py-1 transition-all",
            activeFilter?.id === filter.id && "shadow-glow-sm"
          )}
          onClick={() => onApplyFilter(activeFilter?.id === filter.id ? null : filter)}
        >
          <Bookmark className="h-3 w-3" />
          {filter.name}
          <button
            onClick={(e) => { e.stopPropagation(); handleDelete(filter.id); }}
            className="ml-1 p-0.5 rounded-full hover:bg-background/50"
          >
            <X className="h-2.5 w-2.5" />
          </button>
        </Badge>
      ))}

      {/* Create new filter */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogTrigger asChild>
          <Button variant="outline" size="sm" className="h-7 gap-1 text-xs rounded-full">
            <Plus className="h-3 w-3" />
            Save Filter
          </Button>
        </DialogTrigger>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Filter className="h-4 w-4" />
              Create Saved Filter
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium text-foreground">Filter Name</label>
              <Input
                value={filterName}
                onChange={e => setFilterName(e.target.value)}
                placeholder="e.g. Urgent this week"
                className="mt-1"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-foreground">Client</label>
              <Select value={draft.companyId} onValueChange={v => setDraft(d => ({ ...d, companyId: v }))}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Clients</SelectItem>
                  {companies.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium text-foreground">Urgency</label>
              <Select value={draft.urgency} onValueChange={v => setDraft(d => ({ ...d, urgency: v }))}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Any</SelectItem>
                  <SelectItem value="urgent">Urgent</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="normal">Normal</SelectItem>
                  <SelectItem value="low">Low</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium text-foreground">Date Range</label>
              <Select value={draft.dateRange} onValueChange={v => setDraft(d => ({ ...d, dateRange: v }))}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Time</SelectItem>
                  <SelectItem value="today">Today</SelectItem>
                  <SelectItem value="week">This Week</SelectItem>
                  <SelectItem value="month">This Month</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button onClick={handleSave} disabled={!filterName.trim()} className="w-full gap-2">
              <Save className="h-4 w-4" />
              Save Filter
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Clear active filter */}
      {activeFilter && (
        <Button variant="ghost" size="sm" className="h-7 text-xs text-muted-foreground" onClick={() => onApplyFilter(null)}>
          Clear
        </Button>
      )}
    </div>
  );
}
