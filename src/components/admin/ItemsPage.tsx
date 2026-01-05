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
import { toast } from "sonner";

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

  const fetchItems = async () => {
    try {
      const { data, error } = await supabase
        .from("items")
        .select("*")
        .order("name");

      if (error) throw error;
      setItems(data || []);
    } catch (error) {
      console.error("Error fetching items:", error);
      toast.error("Failed to load items");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchItems();
  }, []);

  // Import items from CSV
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
      fetchItems();
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
      fetchItems();
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
      fetchItems();
    } catch (error: any) {
      console.error("Error deleting item:", error);
      toast.error(error.message || "Failed to delete item");
    }
  };

  const filteredItems = items.filter(
    (item) =>
      item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.code.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
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

      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search items..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9 h-9"
          />
        </div>
        <div className="flex items-center gap-2">
          <Button 
            onClick={handleImportCSV} 
            size="sm" 
            variant="outline"
            disabled={importing}
          >
            <Upload className="h-4 w-4 mr-1" />
            Import CSV
          </Button>
          <Button onClick={openCreateDialog} size="sm">
            <Plus className="h-4 w-4 mr-1" />
            Add Item
          </Button>
        </div>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-[100px]">Code</TableHead>
                <TableHead>Name</TableHead>
                <TableHead className="w-[80px]">Unit</TableHead>
                <TableHead className="hidden md:table-cell">Description</TableHead>
                <TableHead className="w-[80px] text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredItems.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                    <Package className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    {searchTerm ? "No items found" : "No items yet. Add your first item."}
                  </TableCell>
                </TableRow>
              ) : (
                filteredItems.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="font-mono text-xs font-medium">
                      {item.code}
                    </TableCell>
                    <TableCell className="font-medium">{item.name}</TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {item.unit || "pcs"}
                    </TableCell>
                    <TableCell className="hidden md:table-cell text-muted-foreground text-sm truncate max-w-[200px]">
                      {item.description || "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => openEditDialog(item)}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-destructive hover:text-destructive"
                          onClick={() => openDeleteDialog(item)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

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
