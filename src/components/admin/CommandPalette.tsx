import { useState, useEffect, useMemo } from "react";
import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator } from "@/components/ui/command";
import { Package, History, Building2, Truck, FileText, Box, Users, BarChart3, Settings, Home, LogOut, Mic, ShoppingCart, Percent, Hash, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onNavigate: (view: string, payload?: any) => void;
  onAction: (action: string) => void;
  isAdmin: boolean;
}

const NAVIGATION_ITEMS = [
  { id: "home", label: "Home Dashboard", icon: Home, keywords: "home dashboard welcome" },
  { id: "orders", label: "Orders Board", icon: Package, keywords: "orders board kanban active" },
  { id: "history", label: "Order History", icon: History, keywords: "history completed delivered past" },
  { id: "clients", label: "Clients", icon: Building2, keywords: "clients companies customers" },
  { id: "suppliers", label: "Suppliers", icon: Truck, keywords: "suppliers vendors" },
  { id: "po-tracking", label: "PO Tracking", icon: FileText, keywords: "purchase orders po tracking" },
  { id: "buying-sheet", label: "Buying Sheet", icon: ShoppingCart, keywords: "buying sheet procurement restock" },
  { id: "items", label: "Items Catalog", icon: Box, keywords: "items products catalog inventory" },
  { id: "commission", label: "Commissions", icon: Percent, keywords: "commission rep earnings sales payout" },
  { id: "stats", label: "Stats & Reports", icon: BarChart3, keywords: "stats analytics reports charts" },
];

const ADMIN_ITEMS = [
  { id: "users", label: "Users Management", icon: Users, keywords: "users management roles" },
];

const ACTION_ITEMS = [
  { id: "create-order", label: "Create New Order", icon: Package, keywords: "create new order add" },
  { id: "toggle-voice", label: "Toggle Voice Commands", icon: Mic, keywords: "voice command speak microphone" },
  { id: "settings", label: "Open Settings", icon: Settings, keywords: "settings preferences profile" },
  { id: "logout", label: "Log Out", icon: LogOut, keywords: "logout sign out exit" },
];

interface SearchResult {
  type: "order" | "client" | "supplier" | "item";
  id: string;
  label: string;
  hint?: string;
}

export default function CommandPalette({ open, onOpenChange, onNavigate, onAction, isAdmin }: CommandPaletteProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);

  // Reset on close
  useEffect(() => {
    if (!open) {
      setQuery("");
      setResults([]);
    }
  }, [open]);

  // Debounced live search
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    const handle = setTimeout(async () => {
      try {
        const like = `%${q}%`;
        const [ordersRes, companiesRes, suppliersRes, itemsRes] = await Promise.all([
          supabase
            .from("orders")
            .select("id, order_number, description, status")
            .or(`order_number.ilike.${like},description.ilike.${like}`)
            .limit(6),
          supabase
            .from("companies")
            .select("id, name, code")
            .or(`name.ilike.${like},code.ilike.${like}`)
            .limit(5),
          supabase
            .from("suppliers")
            .select("id, name, code")
            .or(`name.ilike.${like},code.ilike.${like}`)
            .limit(5),
          supabase
            .from("items")
            .select("id, name, code")
            .or(`name.ilike.${like},code.ilike.${like}`)
            .limit(5),
        ]);

        const merged: SearchResult[] = [
          ...(ordersRes.data || []).map((o: any) => ({
            type: "order" as const,
            id: o.id,
            label: o.order_number,
            hint: o.description || o.status || "",
          })),
          ...(companiesRes.data || []).map((c: any) => ({
            type: "client" as const,
            id: c.id,
            label: c.name,
            hint: c.code,
          })),
          ...(suppliersRes.data || []).map((s: any) => ({
            type: "supplier" as const,
            id: s.id,
            label: s.name,
            hint: s.code,
          })),
          ...(itemsRes.data || []).map((i: any) => ({
            type: "item" as const,
            id: i.id,
            label: i.name,
            hint: i.code,
          })),
        ];
        setResults(merged);
      } catch (e) {
        console.error("Command palette search error", e);
      } finally {
        setSearching(false);
      }
    }, 200);
    return () => clearTimeout(handle);
  }, [query]);

  const groupedResults = useMemo(() => {
    return {
      order: results.filter(r => r.type === "order"),
      client: results.filter(r => r.type === "client"),
      supplier: results.filter(r => r.type === "supplier"),
      item: results.filter(r => r.type === "item"),
    };
  }, [results]);

  const handleResultSelect = (r: SearchResult) => {
    if (r.type === "order") onNavigate("orders", { highlightOrderId: r.id });
    else if (r.type === "client") onNavigate("clients", { highlightId: r.id });
    else if (r.type === "supplier") onNavigate("suppliers", { highlightId: r.id });
    else if (r.type === "item") onNavigate("items", { highlightId: r.id });
    onOpenChange(false);
  };

  const iconFor = (t: SearchResult["type"]) => {
    if (t === "order") return Hash;
    if (t === "client") return Building2;
    if (t === "supplier") return Truck;
    return Box;
  };

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput
        placeholder="Search orders, clients, suppliers, items… or type a command"
        value={query}
        onValueChange={setQuery}
      />
      <CommandList>
        <CommandEmpty>
          {searching ? (
            <div className="flex items-center justify-center gap-2 py-4 text-sm text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Searching…
            </div>
          ) : (
            "No results found."
          )}
        </CommandEmpty>

        {/* Live search results */}
        {groupedResults.order.length > 0 && (
          <CommandGroup heading="Orders">
            {groupedResults.order.map(r => {
              const Icon = iconFor(r.type);
              return (
                <CommandItem key={`order-${r.id}`} value={`order ${r.label} ${r.hint}`} onSelect={() => handleResultSelect(r)}>
                  <Icon className="mr-2 h-4 w-4 text-primary" />
                  <span className="font-medium">{r.label}</span>
                  {r.hint && <span className="ml-2 text-xs text-muted-foreground truncate">{r.hint}</span>}
                </CommandItem>
              );
            })}
          </CommandGroup>
        )}

        {groupedResults.client.length > 0 && (
          <CommandGroup heading="Clients">
            {groupedResults.client.map(r => (
              <CommandItem key={`client-${r.id}`} value={`client ${r.label} ${r.hint}`} onSelect={() => handleResultSelect(r)}>
                <Building2 className="mr-2 h-4 w-4 text-emerald-500" />
                <span>{r.label}</span>
                {r.hint && <span className="ml-2 text-xs text-muted-foreground">{r.hint}</span>}
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {groupedResults.supplier.length > 0 && (
          <CommandGroup heading="Suppliers">
            {groupedResults.supplier.map(r => (
              <CommandItem key={`sup-${r.id}`} value={`supplier ${r.label} ${r.hint}`} onSelect={() => handleResultSelect(r)}>
                <Truck className="mr-2 h-4 w-4 text-violet-500" />
                <span>{r.label}</span>
                {r.hint && <span className="ml-2 text-xs text-muted-foreground">{r.hint}</span>}
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {groupedResults.item.length > 0 && (
          <CommandGroup heading="Items">
            {groupedResults.item.map(r => (
              <CommandItem key={`item-${r.id}`} value={`item ${r.label} ${r.hint}`} onSelect={() => handleResultSelect(r)}>
                <Box className="mr-2 h-4 w-4 text-amber-500" />
                <span>{r.label}</span>
                {r.hint && <span className="ml-2 text-xs text-muted-foreground">{r.hint}</span>}
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {results.length > 0 && <CommandSeparator />}

        <CommandGroup heading="Navigation">
          {NAVIGATION_ITEMS.map((item) => (
            <CommandItem
              key={item.id}
              value={`${item.label} ${item.keywords}`}
              onSelect={() => {
                onNavigate(item.id);
                onOpenChange(false);
              }}
            >
              <item.icon className="mr-2 h-4 w-4" />
              <span>{item.label}</span>
            </CommandItem>
          ))}
          {isAdmin && ADMIN_ITEMS.map((item) => (
            <CommandItem
              key={item.id}
              value={`${item.label} ${item.keywords}`}
              onSelect={() => {
                onNavigate(item.id);
                onOpenChange(false);
              }}
            >
              <item.icon className="mr-2 h-4 w-4" />
              <span>{item.label}</span>
            </CommandItem>
          ))}
        </CommandGroup>

        <CommandSeparator />

        <CommandGroup heading="Actions">
          {ACTION_ITEMS.map((item) => (
            <CommandItem
              key={item.id}
              value={`${item.label} ${item.keywords}`}
              onSelect={() => {
                onAction(item.id);
                onOpenChange(false);
              }}
            >
              <item.icon className="mr-2 h-4 w-4" />
              <span>{item.label}</span>
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
