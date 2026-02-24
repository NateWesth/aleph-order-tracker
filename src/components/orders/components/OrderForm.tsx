import { useState, useEffect, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Trash2, Search, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { generateOrderNumber } from "../utils/orderUtils";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useAutoSaveDraft } from "@/hooks/useAutoSaveDraft";

interface OrderItem {
  id: string;
  name: string;
  code: string;
  quantity: number;
}

interface CatalogItem {
  id: string;
  code: string;
  name: string;
  unit: string;
}

interface Company {
  id: string;
  name: string;
  code: string;
}

interface Supplier {
  id: string;
  name: string;
  code: string;
}

interface PurchaseOrderEntry {
  id: string;
  supplierId: string;
  purchaseOrderNumber: string;
}

interface TemplatePrefill {
  companyId: string | null;
  urgency: string;
  notes: string;
  items: { name: string; code: string; quantity: number }[];
}

interface OrderFormProps {
  onSubmit: (orderData: {
    orderNumber: string;
    companyId: string;
    totalAmount: number;
    urgency: string;
    items: OrderItem[];
    purchaseOrders: PurchaseOrderEntry[];
  }) => void;
  loading?: boolean;
  templatePrefill?: TemplatePrefill | null;
}

const OrderForm = ({ onSubmit, loading = false, templatePrefill }: OrderFormProps) => {
  const { loadDraft, saveDraft, clearDraft } = useAutoSaveDraft();
  const [orderNumber, setOrderNumber] = useState("");
  const [companyId, setCompanyId] = useState("");
  const [urgency, setUrgency] = useState("normal");
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrderEntry[]>([]);
  const [items, setItems] = useState<OrderItem[]>([
    { id: crypto.randomUUID(), name: "", code: "", quantity: 1 },
  ]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [openPopovers, setOpenPopovers] = useState<Record<string, boolean>>({});
  const [searchQueries, setSearchQueries] = useState<Record<string, string>>({});
  const [searchResults, setSearchResults] = useState<Record<string, CatalogItem[]>>({});
  const [searchLoading, setSearchLoading] = useState<Record<string, boolean>>({});
  const [draftRestored, setDraftRestored] = useState(false);
  const initialized = useRef(false);

  // Restore draft on mount
  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    const draft = loadDraft();
    if (draft) {
      setCompanyId(draft.companyId || "");
      setUrgency(draft.urgency || "normal");
      if (draft.items?.length > 0) setItems(draft.items);
      if (draft.purchaseOrders?.length > 0) setPurchaseOrders(draft.purchaseOrders);
      setDraftRestored(true);
    }
  }, [loadDraft]);

  // Apply template prefill
  useEffect(() => {
    if (templatePrefill) {
      if (templatePrefill.companyId) setCompanyId(templatePrefill.companyId);
      if (templatePrefill.urgency) setUrgency(templatePrefill.urgency);
      if (templatePrefill.items?.length > 0) {
        setItems(templatePrefill.items.map(i => ({
          id: crypto.randomUUID(),
          name: i.name,
          code: i.code || "",
          quantity: i.quantity || 1,
        })));
      }
    }
  }, [templatePrefill]);

  // Auto-save draft on field changes
  useEffect(() => {
    if (!initialized.current) return;
    const hasContent = companyId || urgency !== "normal" || items.some(i => i.name.trim()) || purchaseOrders.length > 0;
    if (hasContent) {
      saveDraft({ companyId, urgency, items, purchaseOrders });
    }
  }, [companyId, urgency, items, purchaseOrders, saveDraft]);

  useEffect(() => {
    setOrderNumber(generateOrderNumber());

    const fetchData = async () => {
      try {
        const [companiesRes, suppliersRes] = await Promise.all([
          supabase.from("companies").select("id, name, code").order("name"),
          supabase.from("suppliers").select("id, name, code").order("name"),
        ]);
        
        if (companiesRes.data) setCompanies(companiesRes.data);
        if (suppliersRes.data) setSuppliers(suppliersRes.data);
      } catch (error) {
        console.error("Error fetching data:", error);
      } finally {
        setLoadingData(false);
      }
    };

    fetchData();
  }, []);

  // Debounced search function
  const searchItems = useCallback(async (itemId: string, query: string) => {
    if (!query || query.length < 2) {
      setSearchResults(prev => ({ ...prev, [itemId]: [] }));
      return;
    }

    setSearchLoading(prev => ({ ...prev, [itemId]: true }));

    try {
      const searchTerm = query.trim().toUpperCase();
      
      // Search by code (exact prefix match) OR name/description (contains)
      const { data, error } = await supabase
        .from("items")
        .select("id, code, name, unit")
        .or(`code.ilike.${searchTerm}%,name.ilike.%${searchTerm}%`)
        .limit(50)
        .order("code");

      if (error) throw error;
      
      setSearchResults(prev => ({ ...prev, [itemId]: data || [] }));
    } catch (error) {
      console.error("Error searching items:", error);
      setSearchResults(prev => ({ ...prev, [itemId]: [] }));
    } finally {
      setSearchLoading(prev => ({ ...prev, [itemId]: false }));
    }
  }, []);

  // Debounce search
  useEffect(() => {
    const timers: Record<string, NodeJS.Timeout> = {};
    
    Object.entries(searchQueries).forEach(([itemId, query]) => {
      timers[itemId] = setTimeout(() => {
        searchItems(itemId, query);
      }, 300);
    });

    return () => {
      Object.values(timers).forEach(timer => clearTimeout(timer));
    };
  }, [searchQueries, searchItems]);

  const addItem = () => {
    setItems([
      ...items,
      { id: crypto.randomUUID(), name: "", code: "", quantity: 1 },
    ]);
  };

  const removeItem = (id: string) => {
    if (items.length > 1) {
      setItems(items.filter((item) => item.id !== id));
      // Clean up search state for removed item
      setSearchQueries(prev => {
        const { [id]: _, ...rest } = prev;
        return rest;
      });
      setSearchResults(prev => {
        const { [id]: _, ...rest } = prev;
        return rest;
      });
    }
  };

  const updateItem = (id: string, field: keyof OrderItem, value: string | number) => {
    setItems(
      items.map((item) =>
        item.id === id ? { ...item, [field]: value } : item
      )
    );
  };

  const selectCatalogItem = (itemId: string, catalogItem: CatalogItem) => {
    setItems(
      items.map((item) =>
        item.id === itemId
          ? { ...item, name: catalogItem.name, code: catalogItem.code }
          : item
      )
    );
    setOpenPopovers({ ...openPopovers, [itemId]: false });
    setSearchQueries(prev => ({ ...prev, [itemId]: "" }));
    setSearchResults(prev => ({ ...prev, [itemId]: [] }));
  };

  const handleSearchChange = (itemId: string, value: string) => {
    setSearchQueries(prev => ({ ...prev, [itemId]: value }));
  };

  // Purchase order management
  const addPurchaseOrder = () => {
    setPurchaseOrders([
      ...purchaseOrders,
      { id: crypto.randomUUID(), supplierId: "", purchaseOrderNumber: "" },
    ]);
  };

  const removePurchaseOrder = (id: string) => {
    setPurchaseOrders(purchaseOrders.filter((po) => po.id !== id));
  };

  const updatePurchaseOrder = (id: string, field: keyof PurchaseOrderEntry, value: string) => {
    setPurchaseOrders(
      purchaseOrders.map((po) =>
        po.id === id ? { ...po, [field]: value } : po
      )
    );
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const validItems = items.filter(
      (item) => item.name.trim() && item.quantity > 0
    );

    if (validItems.length === 0) {
      return;
    }

    if (!companyId) {
      return;
    }

    // Filter valid purchase orders (both supplier and PO number required)
    const validPurchaseOrders = purchaseOrders.filter(
      (po) => po.supplierId && po.purchaseOrderNumber.trim()
    );

    clearDraft();

    onSubmit({
      orderNumber: orderNumber || generateOrderNumber(),
      companyId,
      totalAmount: 0,
      urgency,
      items: validItems,
      purchaseOrders: validPurchaseOrders,
    });
  };

  if (loadingData) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Draft restored banner */}
      {draftRestored && (
        <div className="flex items-center justify-between p-3 bg-primary/5 rounded-lg border border-primary/20">
          <span className="text-sm text-primary font-medium">📝 Draft restored from your last session</span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              clearDraft();
              setDraftRestored(false);
              setCompanyId("");
              setUrgency("normal");
              setItems([{ id: crypto.randomUUID(), name: "", code: "", quantity: 1 }]);
              setPurchaseOrders([]);
            }}
            className="text-xs text-muted-foreground hover:text-destructive"
          >
            Clear Draft
          </Button>
        </div>
      )}

      {/* Order Number */}
      <div className="space-y-2">
        <Label htmlFor="orderNumber">Order Number</Label>
        <Input
          id="orderNumber"
          value={orderNumber}
          onChange={(e) => setOrderNumber(e.target.value)}
          placeholder="Auto-generated if empty"
        />
        <p className="text-xs text-muted-foreground">
          Leave empty to auto-generate
        </p>
      </div>

      {/* Client Selection */}
      <div className="space-y-2">
        <Label htmlFor="client">Client *</Label>
        <Select value={companyId} onValueChange={setCompanyId}>
          <SelectTrigger>
            <SelectValue placeholder="Select a client" />
          </SelectTrigger>
          <SelectContent>
            {companies.map((company) => (
              <SelectItem key={company.id} value={company.id}>
                {company.name} ({company.code})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Urgency */}
      <div className="space-y-2">
        <Label htmlFor="urgency">Urgency</Label>
        <Select value={urgency} onValueChange={setUrgency}>
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

      {/* Supplier Purchase Orders (Optional) */}
      <div className="p-4 bg-muted/50 rounded-lg border border-border space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <span>🔗 Link to Supplier Purchase Orders (Optional)</span>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={addPurchaseOrder}
          >
            <Plus className="h-4 w-4 mr-1" />
            Add PO
          </Button>
        </div>
        
        {purchaseOrders.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-2">
            No purchase orders linked. Click "Add PO" to link supplier purchase orders.
          </p>
        ) : (
          <div className="space-y-3">
            {purchaseOrders.map((po, index) => (
              <div key={po.id} className="flex items-end gap-2 p-3 bg-background rounded-lg border">
                <span className="text-sm text-muted-foreground pb-2">
                  {index + 1}.
                </span>
                <div className="flex-1 space-y-2">
                  <Label className="text-xs">Supplier</Label>
                  <Select 
                    value={po.supplierId} 
                    onValueChange={(val) => updatePurchaseOrder(po.id, "supplierId", val)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select supplier" />
                    </SelectTrigger>
                    <SelectContent>
                      {suppliers.map((supplier) => (
                        <SelectItem key={supplier.id} value={supplier.id}>
                          {supplier.name} ({supplier.code})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex-1 space-y-2">
                  <Label className="text-xs">PO Number</Label>
                  <Input
                    value={po.purchaseOrderNumber}
                    onChange={(e) => updatePurchaseOrder(po.id, "purchaseOrderNumber", e.target.value)}
                    placeholder="e.g., PO-2024-001"
                  />
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => removePurchaseOrder(po.id)}
                  className="shrink-0"
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Note */}
      <div className="p-3 bg-amber-50 dark:bg-amber-950/50 rounded-lg border border-amber-200 dark:border-amber-800">
        <p className="text-sm text-amber-800 dark:text-amber-200">
          <strong>Note:</strong> Orders start in "Awaiting Stock". You can mark individual items as received on the orders board - when all items are in stock, the order automatically moves forward.
        </p>
      </div>

      {/* Order Items */}
      <div className="space-y-4">
        <Label>Order Items *</Label>
        <div className="space-y-3">
          {items.map((item, index) => (
            <div
              key={item.id}
              className="flex items-center gap-2 p-3 bg-muted/50 rounded-lg"
            >
              <span className="text-sm text-muted-foreground w-6">
                {index + 1}.
              </span>

              {/* Item Search/Select */}
              <Popover
                open={openPopovers[item.id]}
                onOpenChange={(open) => {
                  setOpenPopovers({ ...openPopovers, [item.id]: open });
                  if (!open) {
                    setSearchQueries(prev => ({ ...prev, [item.id]: "" }));
                    setSearchResults(prev => ({ ...prev, [item.id]: [] }));
                  }
                }}
              >
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    className="flex-1 justify-start font-normal"
                  >
                    <Search className="h-4 w-4 mr-2 text-muted-foreground" />
                    {item.name ? (
                      <span className="truncate">
                        {item.code && `[${item.code}] `}
                        {item.name}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">
                        Search item by code or name...
                      </span>
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[350px] p-0" align="start">
                  <div className="p-3 border-b">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        placeholder="Type code or name (min 2 chars)..."
                        value={searchQueries[item.id] || ""}
                        onChange={(e) => handleSearchChange(item.id, e.target.value)}
                        className="pl-9"
                        autoFocus
                      />
                    </div>
                  </div>
                  
                  <ScrollArea className="h-[250px]">
                    {searchLoading[item.id] ? (
                      <div className="flex items-center justify-center py-6">
                        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                        <span className="ml-2 text-sm text-muted-foreground">Searching...</span>
                      </div>
                    ) : searchResults[item.id]?.length > 0 ? (
                      <div className="p-2">
                        {searchResults[item.id].map((catalogItem) => (
                          <button
                            key={catalogItem.id}
                            type="button"
                            onClick={() => selectCatalogItem(item.id, catalogItem)}
                            className="w-full text-left px-3 py-2 rounded-md hover:bg-accent transition-colors flex items-start gap-2"
                          >
                            <span className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded shrink-0">
                              {catalogItem.code}
                            </span>
                            <span className="text-sm line-clamp-2">{catalogItem.name}</span>
                          </button>
                        ))}
                      </div>
                    ) : searchQueries[item.id]?.length >= 2 ? (
                      <div className="flex flex-col items-center justify-center py-6 text-center px-4">
                        <p className="text-sm text-muted-foreground">No items found</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          Try a different search term or enter a custom name below
                        </p>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center justify-center py-6 text-center px-4">
                        <Search className="h-8 w-8 text-muted-foreground/50 mb-2" />
                        <p className="text-sm text-muted-foreground">
                          Type at least 2 characters to search
                        </p>
                      </div>
                    )}
                  </ScrollArea>

                  <div className="border-t p-3">
                    <Label className="text-xs text-muted-foreground mb-1.5 block">
                      Or enter custom item name:
                    </Label>
                    <Input
                      placeholder="Custom item name"
                      value={item.name}
                      onChange={(e) => updateItem(item.id, "name", e.target.value)}
                    />
                  </div>
                </PopoverContent>
              </Popover>

              {/* Quantity */}
              <div className="flex items-center gap-1">
                <Label className="text-xs text-muted-foreground">Qty:</Label>
                <Input
                  type="number"
                  min="1"
                  value={item.quantity}
                  onChange={(e) =>
                    updateItem(item.id, "quantity", parseInt(e.target.value) || 1)
                  }
                  className="w-20"
                />
              </div>

              {/* Remove Button */}
              {items.length > 1 && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => removeItem(item.id)}
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              )}
            </div>
          ))}
        </div>

        <Button
          type="button"
          variant="outline"
          onClick={addItem}
          className="w-full"
        >
          <Plus className="h-4 w-4 mr-2" />
          Add Item
        </Button>
      </div>

      {/* Submit */}
      <Button
        type="submit"
        className="w-full"
        disabled={loading || !companyId || items.every((i) => !i.name.trim())}
      >
        {loading ? "Creating..." : "Create Order"}
      </Button>
    </form>
  );
};

export default OrderForm;
