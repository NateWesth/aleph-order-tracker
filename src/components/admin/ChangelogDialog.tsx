import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Sparkles, Wrench, Zap, ShieldCheck } from "lucide-react";

interface Entry {
  version: string;
  date: string;
  tag: "feature" | "improvement" | "fix" | "security";
  title: string;
  items: string[];
}

const CHANGELOG: Entry[] = [
  {
    version: "v4.0",
    date: "2026-05-04",
    tag: "feature",
    title: "Productivity & polish wave",
    items: [
      "Mobile gestures 2.0 — long-press order rows for quick actions",
      "Glass theme variant for a frosted, layered look",
      "Weekly AI digest can now be opted into via email",
      "In-app changelog (this dialog!)",
    ],
  },
  {
    version: "v3.0",
    date: "2026-05-04",
    tag: "feature",
    title: "Predictive analytics",
    items: [
      "Predictive ETA badges on every order based on historical completion times",
      "Smart bulk actions: bulk tag, bulk urgency, bulk status",
      "AI procurement suggestions on the buying sheet",
    ],
  },
  {
    version: "v2.0",
    date: "2026-05-04",
    tag: "improvement",
    title: "Business intelligence",
    items: [
      "AI weekly digest widget on the dashboard",
      "Anomaly alerts surface revenue dips & stuck orders",
      "Resizable dashboard widgets (full / half / third)",
      "Auto theme mode follows your system preference",
    ],
  },
  {
    version: "v1.0",
    date: "2026-05-04",
    tag: "feature",
    title: "Dashboard intelligence",
    items: [
      "Live search command palette (⌘K)",
      "Commission forecast widget with trend sparkline",
      "Margin heatmap for clients & items",
    ],
  },
];

const tagMeta: Record<Entry["tag"], { label: string; icon: React.ReactNode; cls: string }> = {
  feature: { label: "Feature", icon: <Sparkles className="h-3 w-3" />, cls: "bg-primary/15 text-primary border-primary/30" },
  improvement: { label: "Improvement", icon: <Zap className="h-3 w-3" />, cls: "bg-sky-500/15 text-sky-500 border-sky-500/30" },
  fix: { label: "Fix", icon: <Wrench className="h-3 w-3" />, cls: "bg-amber-500/15 text-amber-500 border-amber-500/30" },
  security: { label: "Security", icon: <ShieldCheck className="h-3 w-3" />, cls: "bg-emerald-500/15 text-emerald-500 border-emerald-500/30" },
};

const LATEST_VERSION_KEY = "changelog-last-seen";
export const LATEST_VERSION = CHANGELOG[0].version;

export function hasUnreadChangelog(): boolean {
  try {
    return localStorage.getItem(LATEST_VERSION_KEY) !== LATEST_VERSION;
  } catch {
    return false;
  }
}

export function markChangelogSeen() {
  try { localStorage.setItem(LATEST_VERSION_KEY, LATEST_VERSION); } catch {}
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function ChangelogDialog({ open, onOpenChange }: Props) {
  useEffect(() => {
    if (open) markChangelogSeen();
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            What's new
          </DialogTitle>
          <DialogDescription>Recent updates and improvements to the app.</DialogDescription>
        </DialogHeader>
        <ScrollArea className="max-h-[60vh] pr-3">
          <div className="space-y-6">
            {CHANGELOG.map((entry) => {
              const meta = tagMeta[entry.tag];
              return (
                <div key={entry.version} className="border-l-2 border-primary/30 pl-4 relative">
                  <div className="absolute -left-[5px] top-1.5 h-2 w-2 rounded-full bg-primary" />
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-sm">{entry.version}</span>
                    <Badge variant="outline" className={meta.cls}>
                      <span className="flex items-center gap-1">{meta.icon}{meta.label}</span>
                    </Badge>
                    <span className="text-xs text-muted-foreground">{entry.date}</span>
                  </div>
                  <h3 className="mt-1 font-medium">{entry.title}</h3>
                  <ul className="mt-2 space-y-1 text-sm text-muted-foreground list-disc list-inside marker:text-primary/60">
                    {entry.items.map((item, i) => <li key={i}>{item}</li>)}
                  </ul>
                </div>
              );
            })}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
