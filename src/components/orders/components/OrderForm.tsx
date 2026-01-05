import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Trash2, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { generateOrderNumber } from "../utils/orderUtils";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

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

interface OrderFormProps {
  onSubmit: (orderData: {
    orderNumber: string;
    companyId: string;
    totalAmount: number;
    urgency: string;
    initialStatus: string;
    items: OrderItem[];
  }) => void;
  loading?: boolean;
}

const OrderForm = ({ onSubmit, loading = false }: OrderFormProps) => {
  const [orderNumber, setOrderNumber] = useState("");
  const [companyId, setCompanyId] = useState("");
  const [urgency, setUrgency] = useState("normal");
  const [initialStatus, setInitialStatus] = useState("ordered");
  const [items, setItems] = useState<OrderItem[]>([
    { id: crypto.randomUUID(), name: "", code: "", quantity: 1 },
  ]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [catalogItems, setCatalogItems] = useState<CatalogItem[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [openPopovers, setOpenPopovers] = useState<Record<string, boolean>>({});

  useEffect(() => {
    // Auto-generate order number
    setOrderNumber(generateOrderNumber());

    // Fetch companies and catalog items
    const fetchData = async () => {
      try {
        const [companiesRes, itemsRes] = await Promise.all([
          supabase.from("companies").select("id, name, code").order("name"),
          supabase.from("items").select("id, code, name, unit").order("name"),
        ]);

        if (companiesRes.data) setCompanies(companiesRes.data);
        if (itemsRes.data) setCatalogItems(itemsRes.data);
      } catch (error) {
        console.error("Error fetching data:", error);
      } finally {
        setLoadingData(false);
      }
    };

    fetchData();
  }, []);

  const addItem = () => {
    setItems([
      ...items,
      { id: crypto.randomUUID(), name: "", code: "", quantity: 1 },
    ]);
  };

  const removeItem = (id: string) => {
    if (items.length > 1) {
      setItems(items.filter((item) => item.id !== id));
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

    onSubmit({
      orderNumber: orderNumber || generateOrderNumber(),
      companyId,
      totalAmount: 0,
      urgency,
      initialStatus,
      items: validItems,
    });
  };

  const filterItems = (searchValue: string) => {
    if (!searchValue) return catalogItems;
    const search = searchValue.toLowerCase();
    return catalogItems.filter(
      (item) =>
        item.code.toLowerCase().includes(search) ||
        item.name.toLowerCase().includes(search)
    );
  };

  if (loadingData) {
    return (
      <div className="flex items-center justify-center py-8">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
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

      {/* Initial Status - Where does this order start? */}
      <div className="space-y-3">
        <Label>Starting Stage</Label>
        <div className="grid grid-cols-2 gap-3">
          <div
            onClick={() => setInitialStatus("ordered")}
            className={`p-3 rounded-lg border-2 cursor-pointer transition-all ${
              initialStatus === "ordered"
                ? "border-amber-500 bg-amber-50 dark:bg-amber-950"
                : "border-muted hover:border-muted-foreground/50"
            }`}
          >
            <div className="flex items-center gap-2">
              <div className={`w-3 h-3 rounded-full ${initialStatus === "ordered" ? "bg-amber-500" : "bg-muted"}`} />
              <span className="font-medium text-sm">Awaiting Stock</span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">Items need to be ordered/sourced</p>
          </div>
          <div
            onClick={() => setInitialStatus("partial-stock")}
            className={`p-3 rounded-lg border-2 cursor-pointer transition-all ${
              initialStatus === "partial-stock"
                ? "border-orange-500 bg-orange-50 dark:bg-orange-950"
                : "border-muted hover:border-muted-foreground/50"
            }`}
          >
            <div className="flex items-center gap-2">
              <div className={`w-3 h-3 rounded-full ${initialStatus === "partial-stock" ? "bg-orange-500" : "bg-muted"}`} />
              <span className="font-medium text-sm">Partial Stock</span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">Some items available, others pending</p>
          </div>
          <div
            onClick={() => setInitialStatus("in-stock")}
            className={`p-3 rounded-lg border-2 cursor-pointer transition-all ${
              initialStatus === "in-stock"
                ? "border-sky-500 bg-sky-50 dark:bg-sky-950"
                : "border-muted hover:border-muted-foreground/50"
            }`}
          >
            <div className="flex items-center gap-2">
              <div className={`w-3 h-3 rounded-full ${initialStatus === "in-stock" ? "bg-sky-500" : "bg-muted"}`} />
              <span className="font-medium text-sm">In Stock</span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">All items are already available</p>
          </div>
          <div
            onClick={() => setInitialStatus("in-progress")}
            className={`p-3 rounded-lg border-2 cursor-pointer transition-all ${
              initialStatus === "in-progress"
                ? "border-violet-500 bg-violet-50 dark:bg-violet-950"
                : "border-muted hover:border-muted-foreground/50"
            }`}
          >
            <div className="flex items-center gap-2">
              <div className={`w-3 h-3 rounded-full ${initialStatus === "in-progress" ? "bg-violet-500" : "bg-muted"}`} />
              <span className="font-medium text-sm">In Progress</span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">Work has already started</p>
          </div>
          <div
            onClick={() => setInitialStatus("ready")}
            className={`p-3 rounded-lg border-2 cursor-pointer transition-all ${
              initialStatus === "ready"
                ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-950"
                : "border-muted hover:border-muted-foreground/50"
            }`}
          >
            <div className="flex items-center gap-2">
              <div className={`w-3 h-3 rounded-full ${initialStatus === "ready" ? "bg-emerald-500" : "bg-muted"}`} />
              <span className="font-medium text-sm">Ready for Delivery</span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">Order is complete and ready</p>
          </div>
        </div>
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
                onOpenChange={(open) =>
                  setOpenPopovers({ ...openPopovers, [item.id]: open })
                }
              >
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    className="flex-1 justify-start font-normal"
                  >
                    <Search className="h-4 w-4 mr-2 text-muted-foreground" />
                    {item.name ? (
                      <span>
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
                <PopoverContent className="w-[300px] p-0" align="start">
                  <Command>
                    <CommandInput placeholder="Type code or name..." />
                    <CommandList>
                      <CommandEmpty>
                        <div className="p-2 text-sm text-muted-foreground">
                          No items found. Type a custom name below.
                        </div>
                      </CommandEmpty>
                      <CommandGroup>
                        {catalogItems.map((catalogItem) => (
                          <CommandItem
                            key={catalogItem.id}
                            onSelect={() => selectCatalogItem(item.id, catalogItem)}
                          >
                            <span className="font-mono text-xs mr-2">
                              [{catalogItem.code}]
                            </span>
                            {catalogItem.name}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                  <div className="border-t p-2">
                    <Input
                      placeholder="Or type custom item name"
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
