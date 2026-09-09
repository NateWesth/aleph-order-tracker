import { useState, useEffect, useRef, useCallback } from "react";
import { Search, X, Clock, Package, Building2, Box, Truck, ArrowRight, Loader2, RefreshCcw, Wrench, CalendarCheck } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

interface SearchResult {
  id: string;
  type: "order" | "company" | "item" | "supplier" | "return" | "loan" | "calibration";
  title: string;
  subtitle: string;
  badge?: string;
  badgeVariant?: "default" | "secondary" | "destructive" | "outline";
}

interface SmartSearchProps {
  onNavigate: (view: string) => void;
  onSelectResult?: (result: SearchResult) => void;
  className?: string;
}

const RECENT_SEARCHES_KEY = "smart-search-recent";
const MAX_RECENT = 5;

function fuzzyMatch(text: string, query: string): boolean {
  const lower = text.toLowerCase();
  const q = query.toLowerCase();
  let qi = 0;
  for (let i = 0; i < lower.length && qi < q.length; i++) {
    if (lower[i] === q[qi]) qi++;
  }
  return qi === q.length;
}

function scoreMatch(text: string, query: string): number {
  const lower = text.toLowerCase();
  const q = query.toLowerCase();
  if (lower === q) return 100;
  if (lower.startsWith(q)) return 90;
  if (lower.includes(q)) return 70;
  // fuzzy score
  let qi = 0;
  let gaps = 0;
  for (let i = 0; i < lower.length && qi < q.length; i++) {
    if (lower[i] === q[qi]) {
      qi++;
    } else if (qi > 0) {
      gaps++;
    }
  }
  return qi === q.length ? Math.max(10, 60 - gaps * 5) : 0;
}

const TYPE_CONFIG = {
  order: { icon: Package, label: "Order", color: "text-blue-500", bg: "bg-blue-500/10" },
  company: { icon: Building2, label: "Company", color: "text-emerald-500", bg: "bg-emerald-500/10" },
  item: { icon: Box, label: "Item", color: "text-amber-500", bg: "bg-amber-500/10" },
  supplier: { icon: Truck, label: "Supplier", color: "text-purple-500", bg: "bg-purple-500/10" },
  return: { icon: RefreshCcw, label: "Return", color: "text-pink-500", bg: "bg-pink-500/10" },
  loan: { icon: Wrench, label: "Loan tool", color: "text-violet-500", bg: "bg-violet-500/10" },
  calibration: { icon: CalendarCheck, label: "Calibration", color: "text-cyan-600", bg: "bg-cyan-500/10" },
};

export default function SmartSearch({ onNavigate, onSelectResult, className }: SmartSearchProps) {
  const [query, setQuery] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<NodeJS.Timeout>();

  // Load recent searches
  useEffect(() => {
    try {
      const stored = localStorage.getItem(RECENT_SEARCHES_KEY);
      if (stored) setRecentSearches(JSON.parse(stored));
    } catch {}
  }, []);

  const saveRecentSearch = (term: string) => {
    const updated = [term, ...recentSearches.filter((s) => s !== term)].slice(0, MAX_RECENT);
    setRecentSearches(updated);
    localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(updated));
  };

  const clearRecentSearches = () => {
    setRecentSearches([]);
    localStorage.removeItem(RECENT_SEARCHES_KEY);
  };

  const performSearch = useCallback(async (searchQuery: string, signal: AbortSignal) => {
    if (!searchQuery.trim() || searchQuery.length < 2) {
      setResults([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const q = searchQuery.trim().replace(/[,()%_\\"]/g, " ").trim();
    if (q.length < 2) { setResults([]); setLoading(false); return; }

    try {
      const [ordersRes, companiesRes, itemsRes, suppliersRes, returnsRes, loansRes, calibrationRes] = await Promise.all([
        supabase
          .from("orders")
          .select("id, order_number, status, description, reference, urgency")
          .or(`order_number.ilike.%${q}%,description.ilike.%${q}%,reference.ilike.%${q}%`)
          .limit(5).abortSignal(signal),
        supabase
          .from("companies")
          .select("id, name, code, contact_person")
          .or(`name.ilike.%${q}%,code.ilike.%${q}%,contact_person.ilike.%${q}%`)
          .limit(5).abortSignal(signal),
        supabase
          .from("items")
          .select("id, name, code, description")
          .or(`name.ilike.%${q}%,code.ilike.%${q}%,description.ilike.%${q}%`)
          .limit(5).abortSignal(signal),
        supabase
          .from("suppliers")
          .select("id, name, code, contact_person")
          .or(`name.ilike.%${q}%,code.ilike.%${q}%,contact_person.ilike.%${q}%`)
          .limit(5).abortSignal(signal),
        (supabase as any).from("return_cases").select("id,rma_number,client_name,item_description,status").or(`rma_number.ilike.%${q}%,client_name.ilike.%${q}%,item_description.ilike.%${q}%`).limit(5).abortSignal(signal),
        (supabase as any).from("loan_assets").select("id,asset_code,tool_name,serial_number,borrower_name").or(`asset_code.ilike.%${q}%,tool_name.ilike.%${q}%,serial_number.ilike.%${q}%,borrower_name.ilike.%${q}%`).limit(5).abortSignal(signal),
        (supabase as any).from("calibration_assets").select("id,asset_code,tool_name,serial_number,status").or(`asset_code.ilike.%${q}%,tool_name.ilike.%${q}%,serial_number.ilike.%${q}%`).limit(5).abortSignal(signal),
      ]);

      if (signal.aborted) return;
      const failed = [ordersRes, companiesRes, itemsRes, suppliersRes, returnsRes, loansRes, calibrationRes].filter(r => r.error);
      setSearchError(failed.length ? "Some sources could not be searched. Results may be incomplete." : "");
      const allResults: (SearchResult & { score: number })[] = [];

      (ordersRes.data || []).forEach((o) => {
        const matchText = `${o.order_number} ${o.description || ""} ${o.reference || ""}`;
        const score = scoreMatch(matchText, q);
        if (score > 0 || fuzzyMatch(matchText, q)) {
          allResults.push({
            id: o.id,
            type: "order",
            title: o.order_number,
            subtitle: o.description || o.reference || "No description",
            badge: o.status || "pending",
            badgeVariant: o.urgency === "urgent" ? "destructive" : "secondary",
            score,
          });
        }
      });

      (companiesRes.data || []).forEach((c) => {
        const matchText = `${c.name} ${c.code} ${c.contact_person || ""}`;
        const score = scoreMatch(matchText, q);
        if (score > 0 || fuzzyMatch(matchText, q)) {
          allResults.push({
            id: c.id,
            type: "company",
            title: c.name,
            subtitle: `${c.code}${c.contact_person ? ` · ${c.contact_person}` : ""}`,
            score,
          });
        }
      });

      (itemsRes.data || []).forEach((i) => {
        const matchText = `${i.name} ${i.code} ${i.description || ""}`;
        const score = scoreMatch(matchText, q);
        if (score > 0 || fuzzyMatch(matchText, q)) {
          allResults.push({
            id: i.id,
            type: "item",
            title: i.name,
            subtitle: `${i.code}${i.description ? ` · ${i.description}` : ""}`,
            score,
          });
        }
      });

      (suppliersRes.data || []).forEach((s) => {
        const matchText = `${s.name} ${s.code} ${s.contact_person || ""}`;
        const score = scoreMatch(matchText, q);
        if (score > 0 || fuzzyMatch(matchText, q)) {
          allResults.push({
            id: s.id,
            type: "supplier",
            title: s.name,
            subtitle: `${s.code}${s.contact_person ? ` · ${s.contact_person}` : ""}`,
            score,
          });
        }
      });

      (returnsRes.data || []).forEach((r: any) => allResults.push({ id:r.id, type:"return", title:r.rma_number, subtitle:`${r.client_name} · ${r.item_description}`, badge:r.status, score:scoreMatch(`${r.rma_number} ${r.client_name} ${r.item_description}`,q) }));
      (loansRes.data || []).forEach((r: any) => allResults.push({ id:r.id, type:"loan", title:r.asset_code, subtitle:`${r.tool_name} · ${r.borrower_name}`, score:scoreMatch(`${r.asset_code} ${r.tool_name} ${r.serial_number||""} ${r.borrower_name}`,q) }));
      (calibrationRes.data || []).forEach((r: any) => allResults.push({ id:r.id, type:"calibration", title:r.asset_code, subtitle:`${r.tool_name} · ${r.status}`, badge:r.status, score:scoreMatch(`${r.asset_code} ${r.tool_name} ${r.serial_number||""}`,q) }));

      allResults.sort((a, b) => b.score - a.score);
      setResults(allResults.slice(0, 12));
    } catch (error) {
      if (!signal.aborted) setSearchError("Search is unavailable. Please try again.");
    } finally {
      if (!signal.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setResults([]);
    setSelectedIndex(-1);
    setSearchError("");
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (query.length >= 2) {
      setLoading(true);
      debounceRef.current = setTimeout(() => performSearch(query, controller.signal), 300);
    } else {
      setResults([]);
      setLoading(false);
    }
    return () => { controller.abort(); if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query, performSearch]);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleSelect = (result: SearchResult) => {
    saveRecentSearch(query);
    setIsOpen(false);
    setQuery("");
    
    if (onSelectResult) {
      onSelectResult(result);
      return;
    }

    switch (result.type) {
      case "order":
        window.sessionStorage.setItem("aleph:open-order", result.id);
        onNavigate("orders");
        window.dispatchEvent(new CustomEvent("aleph:open-order", { detail: result.id }));
        break;
      case "company": onNavigate("clients"); break;
      case "item": onNavigate("items"); break;
      case "supplier": onNavigate("suppliers"); break;
      case "return":
      case "loan":
      case "calibration": onNavigate("service-desk"); break;
    }
  };

  const handleRecentClick = (term: string) => {
    setQuery(term);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    const items = query.length >= 2 ? Object.values(groupedResults).flat() : [];
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((prev) => Math.min(prev + 1, items.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((prev) => Math.max(prev - 1, -1));
    } else if (e.key === "Enter" && selectedIndex >= 0 && items[selectedIndex]) {
      e.preventDefault();
      handleSelect(items[selectedIndex]);
    } else if (e.key === "Escape") {
      setIsOpen(false);
      inputRef.current?.blur();
    }
  };

  const showDropdown = isOpen && (query.length >= 2 || recentSearches.length > 0);

  // Group results by type
  const groupedResults = results.reduce<Record<string, SearchResult[]>>((acc, r) => {
    if (!acc[r.type]) acc[r.type] = [];
    acc[r.type].push(r);
    return acc;
  }, {});

  let flatIndex = -1;

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      <div className="relative">
        <Search className="absolute left-2.5 sm:left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
        <Input
          ref={inputRef}
          placeholder="Search orders, companies, items... (⌘K)"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setSelectedIndex(-1);
            if (!isOpen) setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
          onKeyDown={handleKeyDown}
          className="aleph-toolbar-search-input pl-9 sm:pl-11 pr-8 h-11 sm:h-12 border-0 focus-visible:ring-2 focus-visible:ring-primary/35 rounded-2xl text-sm font-medium"
        />
        {query && (
          <button
            aria-label="Clear search"
            onClick={() => { setQuery(""); setResults([]); inputRef.current?.focus(); }}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        )}
        {loading && (
          <Loader2 className="absolute right-8 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground animate-spin" />
        )}
      </div>

      {showDropdown && (
        <div className="absolute top-full left-0 right-0 mt-1.5 bg-popover border border-border rounded-xl shadow-lg overflow-hidden z-[60] animate-fade-in max-h-[420px] overflow-y-auto">
          {/* Recent searches */}
          {query.length < 2 && recentSearches.length > 0 && (
            <div className="p-2">
              <div className="flex items-center justify-between px-2 py-1">
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Recent</span>
                <button onClick={clearRecentSearches} className="text-xs text-muted-foreground hover:text-foreground transition-colors">
                  Clear
                </button>
              </div>
              {recentSearches.map((term) => (
                <button
                  key={term}
                  onClick={() => handleRecentClick(term)}
                  className="w-full flex items-center gap-2.5 px-2 py-2 rounded-lg text-sm text-foreground hover:bg-accent transition-colors"
                >
                  <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="truncate">{term}</span>
                  <ArrowRight className="h-3 w-3 text-muted-foreground ml-auto" />
                </button>
              ))}
            </div>
          )}

          {/* Search results */}
          {query.length >= 2 && (
            <>
              {searchError && <p role="alert" className="px-3 py-2 text-xs text-destructive">{searchError}</p>}
              {results.length === 0 && !loading && !searchError && (
                <div className="p-6 text-center text-sm text-muted-foreground">
                  No results found for "{query}"
                </div>
              )}

              {Object.entries(groupedResults).map(([type, items]) => {
                const config = TYPE_CONFIG[type as keyof typeof TYPE_CONFIG];
                const Icon = config.icon;
                return (
                  <div key={type} className="p-1.5">
                    <div className="flex items-center gap-2 px-2 py-1.5">
                      <div className={cn("p-1 rounded-md", config.bg)}>
                        <Icon className={cn("h-3 w-3", config.color)} />
                      </div>
                      <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                        {config.label}s
                      </span>
                      <Badge variant="outline" className="ml-auto text-[10px] h-4 px-1.5">
                        {items.length}
                      </Badge>
                    </div>
                    {items.map((result) => {
                      flatIndex++;
                      const idx = flatIndex;
                      return (
                        <button
                          key={result.id}
                          onClick={() => handleSelect(result)}
                          className={cn(
                            "w-full flex items-center gap-3 px-2 py-2 rounded-lg text-sm transition-colors",
                            idx === selectedIndex
                              ? "bg-accent text-accent-foreground"
                              : "text-foreground hover:bg-accent/50"
                          )}
                        >
                          <div className="flex-1 min-w-0 text-left">
                            <div className="font-medium truncate">{result.title}</div>
                            <div className="text-xs text-muted-foreground truncate">{result.subtitle}</div>
                          </div>
                          {result.badge && (
                            <Badge variant={result.badgeVariant || "secondary"} className="text-[10px] shrink-0">
                              {result.badge}
                            </Badge>
                          )}
                        </button>
                      );
                    })}
                  </div>
                );
              })}

              {results.length > 0 && (
                <div className="border-t border-border p-2">
                  <div className="text-[11px] text-muted-foreground text-center">
                    ↑↓ navigate · ↵ select · esc close
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
