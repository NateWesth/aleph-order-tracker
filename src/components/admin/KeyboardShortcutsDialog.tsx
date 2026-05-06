import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Keyboard } from "lucide-react";

const SHORTCUTS: { keys: string[]; label: string }[] = [
  { keys: ["⌘", "K"], label: "Open command palette" },
  { keys: ["?"], label: "Show this shortcut sheet" },
  { keys: ["g", "o"], label: "Go to Orders" },
  { keys: ["g", "h"], label: "Go to History" },
  { keys: ["g", "c"], label: "Go to Clients" },
  { keys: ["g", "s"], label: "Go to Stats" },
  { keys: ["g", "b"], label: "Go to Buying sheet" },
  { keys: ["n"], label: "New order (on Orders page)" },
  { keys: ["/"], label: "Focus search" },
  { keys: ["Esc"], label: "Close dialogs" },
];

export default function KeyboardShortcutsDialog({
  onNavigate,
}: { onNavigate?: (view: string) => void }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let lastKey = "";
    let lastTime = 0;
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target?.tagName === "INPUT" || target?.tagName === "TEXTAREA" || target?.isContentEditable) return;

      // '?' toggles the sheet
      if (e.key === "?" && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        setOpen(o => !o);
        return;
      }

      // '/' focuses the global search
      if (e.key === "/" && !e.metaKey && !e.ctrlKey) {
        const search = document.querySelector<HTMLInputElement>('[data-tour="search"] input');
        if (search) { e.preventDefault(); search.focus(); }
        return;
      }

      // Two-key 'g' navigation
      const now = Date.now();
      if (lastKey === "g" && now - lastTime < 800 && onNavigate) {
        const map: Record<string, string> = {
          o: "orders", h: "history", c: "clients", s: "stats", b: "buying-sheet", i: "items", u: "users", p: "po-tracking",
        };
        if (map[e.key]) {
          e.preventDefault();
          onNavigate(map[e.key]);
          lastKey = "";
          return;
        }
      }
      lastKey = e.key;
      lastTime = now;
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onNavigate]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Keyboard className="h-5 w-5" />
            Keyboard Shortcuts
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-2">
          {SHORTCUTS.map((s, i) => (
            <div key={i} className="flex items-center justify-between py-1.5 px-2 rounded-lg hover:bg-secondary/40">
              <span className="text-sm text-foreground">{s.label}</span>
              <div className="flex items-center gap-1">
                {s.keys.map((k, ki) => (
                  <kbd key={ki} className="px-2 py-1 text-[11px] font-mono font-semibold bg-muted border border-border rounded shadow-sm">
                    {k}
                  </kbd>
                ))}
              </div>
            </div>
          ))}
        </div>
        <p className="text-[11px] text-muted-foreground text-center pt-2">
          Press <kbd className="px-1.5 py-0.5 bg-muted rounded text-[10px]">?</kbd> anytime to reopen this sheet.
        </p>
      </DialogContent>
    </Dialog>
  );
}
