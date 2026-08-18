import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { Plus, Search, Pencil, Trash2, Package, Upload, Loader2 } from "lucide-react";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import { toast } from "sonner";
import { PageSkeleton } from "@/components/ui/PageSkeleton";
import PageHeader from "@/components/ui/PageHeader";

interface Item {
  id: string;
  name: string;
  code: string;
  unit: string | null;
  description: string | null;
  created_at: string;
}

interface ItemFormData {
  name: string;
  code: string;
  unit: string;
  description: string;
}

const ItemsPage = () => {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<Item | null>(null);
  const [formData, setFormData] = useState<ItemFormData>({
    name: "",
    code: "",
    unit: "pcs",
    description: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState(0);
  const [importTotal, setImportTotal] = useState(0);

  const PAGE_SIZE = 50;
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  const fetchItems = async (opts?: { page?: number; q?: string }) => {
    const nextPage = opts?.page ?? page;
    const q = (opts?.q ?? searchTerm).trim();

    try {
      setLoading(true);

      let query = supabase
        .from("items")
        .select("*", { count: "exact" })
        .order("name")
        .range((nextPage - 1) * PAGE_SIZE, nextPage * PAGE_SIZE - 1);

      if (q) {
        query = query.or(`name.ilike.%${q}%,code.ilike.%${q}%`);
      }

      const { data, error, count } = await query;
      if (error) throw error;

      setItems(data || []);
      setTotalCount(count || 0);
      setPage(nextPage);
    } catch (error) {
      console.error("Error fetching items:", error);
      toast.error("Failed to load items");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchItems({ page: 1 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const t = window.setTimeout(() => {
      fetchItems({ page: 1, q: searchTerm });
    }, 250);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchTerm]);
  const handleImportCSV = async () => {
    setImporting(true);
    setImportProgress(0);
    
    try {
      // Fetch the CSV file
      const response = await fetch('/data/items-import.csv');
      const csvText = await response.text();
      
      // Parse CSV
      const lines = csvText.split('\n');
      const header = lines[0].split(',');
      const codeIndex = header.findIndex(h => h.trim() === 'Code');
      const descIndex = header.findIndex(h => h.trim() === 'Description');
      
      if (codeIndex === -1 || descIndex === -1) {
        throw new Error('CSV must have Code and Description columns');
      }
      
      // Parse all valid items (skip header and empty/invalid rows)
      const itemsToImport: { code: string; name: string }[] = [];
      
      for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        
        // Handle CSV with commas in quoted fields
        const values: string[] = [];
        let current = '';
        let inQuotes = false;
        
        for (const char of line) {
          if (char === '"') {
            inQuotes = !inQuotes;
          } else if (char === ',' && !inQuotes) {
            values.push(current.trim());
            current = '';
          } else {
            current += char;
          }
        }
        values.push(current.trim());
        
        const code = values[codeIndex]?.replace(/^"|"$/g, '').trim();
        const description = values[descIndex]?.replace(/^"|"$/g, '').trim();
        
        // Skip invalid items (empty code or just ".")
        if (!code || code === '.' || !description || description === '.') continue;
        
        itemsToImport.push({
          code: code.toUpperCase(),
          name: description, // Description is the name
        });
      }
      
      setImportTotal(itemsToImport.length);
      
      // Batch insert in chunks of 500
      const batchSize = 500;
      let inserted = 0;
      
      for (let i = 0; i < itemsToImport.length; i += batchSize) {
        const batch = itemsToImport.slice(i, i + batchSize).map(item => ({
          code: item.code,
          name: item.name,
          unit: 'pcs',
          description: null,
        }));
        
        const { error } = await supabase
          .from('items')
          .upsert(batch, { onConflict: 'code', ignoreDuplicates: true });
        
        if (error) {
          console.error('Batch insert error:', error);
        }
        
        inserted += batch.length;
        setImportProgress(Math.round((inserted / itemsToImport.length) * 100));
      }
      
      toast.success(`Imported ${itemsToImport.length} items successfully`);
      fetchItems({ page: 1 });
    } catch (error: any) {
      console.error('Import error:', error);
      toast.error(error.message || 'Failed to import items');
    } finally {
      setImporting(false);
      setImportProgress(0);
    }
  };

  const openCreateDialog = () => {
    setSelectedItem(null);
    setFormData({ name: "", code: "", unit: "pcs", description: "" });
    setDialogOpen(true);
  };

  const openEditDialog = (item: Item) => {
    setSelectedItem(item);
    setFormData({
      name: item.name,
      code: item.code,
      unit: item.unit || "pcs",
      description: item.description || "",
    });
    setDialogOpen(true);
  };

  const openDeleteDialog = (item: Item) => {
    setSelectedItem(item);
    setDeleteDialogOpen(true);
  };

  const handleSubmit = async () => {
    if (!formData.name.trim() || !formData.code.trim()) {
      toast.error("Name and code are required");
      return;
    }

    setSubmitting(true);
    try {
      if (selectedItem) {
        const { error } = await supabase
          .from("items")
          .update({
            name: formData.name.trim(),
            code: formData.code.trim().toUpperCase(),
            unit: formData.unit.trim() || "pcs",
            description: formData.description.trim() || null,
          })
          .eq("id", selectedItem.id);

        if (error) throw error;
        toast.success("Item updated");
      } else {
        const { error } = await supabase.from("items").insert({
          name: formData.name.trim(),
          code: formData.code.trim().toUpperCase(),
          unit: formData.unit.trim() || "pcs",
          description: formData.description.trim() || null,
        });

        if (error) throw error;
        toast.success("Item created");
      }

      setDialogOpen(false);
      fetchItems({ page });
    } catch (error: any) {
      console.error("Error saving item:", error);
      toast.error(error.message || "Failed to save item");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedItem) return;

    try {
      const { error } = await supabase
        .from("items")
        .delete()
        .eq("id", selectedItem.id);

      if (error) throw error;
      toast.success("Item deleted");
      setDeleteDialogOpen(false);
      fetchItems({ page });
    } catch (error: any) {
      console.error("Error deleting item:", error);
      toast.error(error.message || "Failed to delete item");
    }
  };

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const rangeStart = totalCount === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const rangeEnd = Math.min(page * PAGE_SIZE, totalCount);
  const canPrev = page > 1;
  const canNext = page < totalPages;

  if (loading) {
    return <PageSkeleton variant="table" />;
  }

  return (
    <div className="aleph-page-workspace aleph-items-workspace space-y-5">
      {/* Import Progress */}
      {importing && (
        <Card className="p-4">
          <div className="flex items-center gap-3 mb-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="text-sm font-medium">
              Importing items... {importProgress}% ({Math.round((importProgress / 100) * importTotal)} of {importTotal})
            </span>
          </div>
          <Progress value={importProgress} className="h-2" />
        </Card>
      )}

      <PageHeader
        title="Items"
        icon={Package}
        description={`Showing ${rangeStart}-${rangeEnd} of ${totalCount} catalogue items`}
        actions={
          <>
            <Button onClick={handleImportCSV} variant="outline" disabled={importing}>
              <Upload className="h-4 w-4 mr-2" />
              Import CSV
            </Button>
            <Button onClick={openCreateDialog}>
              <Plus className="h-4 w-4 mr-2" />
              Add Item
            </Button>
          </>
        }
        toolbar={
          <div className="relative w-full sm:max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search items..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9"
            />
          </div>
        }
      />


      {/* Catalogue card workspace */}
      {items.length === 0 ? (
        <div className="rounded-[28px] border-2 border-dashed border-border bg-card/45 py-16 text-center text-muted-foreground">
          <Package className="mx-auto mb-3 h-10 w-10 opacity-40" />
          <p className="font-semibold text-foreground">{searchTerm ? "No matching items" : "Your catalogue is empty"}</p>
          <p className="mt-1 text-sm">{searchTerm ? "Try a different name or item code." : "Add or import the first catalogue item."}</p>
        </div>
      ) : (
        <div className="catalogue-card-grid grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {items.map((item, index) => (
            <article key={item.id} className="group relative isolate overflow-hidden rounded-[24px] border border-border/60 bg-card/90 p-4 shadow-[0_22px_48px_-42px_hsl(var(--foreground)/.5)] transition-all duration-200 hover:-translate-y-1 hover:border-primary/25 hover:shadow-[0_28px_58px_-40px_hsl(var(--primary)/.35)]">
              <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-primary via-primary/35 to-transparent" aria-hidden />
              <div className="flex items-start gap-3">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary/10 font-display text-sm font-black text-primary">
                  {String((page - 1) * PAGE_SIZE + index + 1).padStart(2, "0")}
                </span>
                <div className="min-w-0 flex-1">
                  <span className="inline-flex max-w-full rounded-lg bg-muted px-2 py-1 font-mono text-[10px] font-bold text-muted-foreground">{item.code}</span>
                  <h3 className="mt-2 line-clamp-2 font-display text-base font-black leading-tight text-foreground">{item.name}</h3>
                </div>
              </div>

              <div className="mt-4 min-h-[52px] rounded-2xl bg-muted/35 px-3 py-2.5">
                <p className="line-clamp-2 text-xs leading-relaxed text-muted-foreground">{item.description || "No description has been added yet."}</p>
              </div>

              <div className="mt-3 flex items-center justify-between gap-3 border-t border-border/45 pt-3">
                <div>
                  <p className="text-[9px] font-black uppercase tracking-[0.14em] text-muted-foreground">Stock unit</p>
                  <p className="mt-0.5 text-sm font-bold text-foreground">{item.unit || "pcs"}</p>
                </div>
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="icon" className="h-9 w-9 rounded-xl" onClick={() => openEditDialog(item)} aria-label={`Edit ${item.name}`}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-9 w-9 rounded-xl text-destructive hover:text-destructive" onClick={() => openDeleteDialog(item)} aria-label={`Delete ${item.name}`}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <Pagination className="justify-end">
          <PaginationContent>
            <PaginationItem>
              <PaginationPrevious
                href="#"
                className={!canPrev ? "pointer-events-none opacity-50" : ""}
                onClick={(e) => {
                  e.preventDefault();
                  if (!canPrev) return;
                  fetchItems({ page: page - 1 });
                }}
              />
            </PaginationItem>
            <PaginationItem>
              <PaginationLink href="#" size="default" isActive onClick={(e) => e.preventDefault()}>
                Page {page} / {totalPages}
              </PaginationLink>
            </PaginationItem>
            <PaginationItem>
              <PaginationNext
                href="#"
                className={!canNext ? "pointer-events-none opacity-50" : ""}
                onClick={(e) => {
                  e.preventDefault();
                  if (!canNext) return;
                  fetchItems({ page: page + 1 });
                }}
              />
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {selectedItem ? "Edit Item" : "Add New Item"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="code">Code *</Label>
                <Input
                  id="code"
                  value={formData.code}
                  onChange={(e) =>
                    setFormData({ ...formData, code: e.target.value.toUpperCase() })
                  }
                  placeholder="e.g. SKU001"
                  className="font-mono"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="unit">Unit</Label>
                <Input
                  id="unit"
                  value={formData.unit}
                  onChange={(e) =>
                    setFormData({ ...formData, unit: e.target.value })
                  }
                  placeholder="e.g. pcs, kg, m"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="name">Name *</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) =>
                  setFormData({ ...formData, name: e.target.value })
                }
                placeholder="Item name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) =>
                  setFormData({ ...formData, description: e.target.value })
                }
                placeholder="Optional description"
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={submitting}>
              {submitting ? "Saving..." : selectedItem ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Item</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{selectedItem?.name}"? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default ItemsPage;
