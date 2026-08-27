import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Bot, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import AIInsightsPanel from "./AIInsightsPanel";

export default function FloatingAIChat() {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    const toggle = () => setOpen(value => !value);
    const ask = (event: Event) => {
      const prompt = String((event as CustomEvent<string>).detail || "").trim();
      setOpen(true);
      if (prompt) window.setTimeout(() => window.dispatchEvent(new CustomEvent("aleph:ai-prompt", { detail: prompt })), 80);
    };
    window.addEventListener("aleph:toggle-ai", toggle);
    window.addEventListener("aleph:ask-ai", ask);
    return () => { window.removeEventListener("aleph:toggle-ai", toggle); window.removeEventListener("aleph:ask-ai", ask); };
  }, []);

  if (!mounted) return null;

  return createPortal((
    <>
      {/* Chat Panel */}
      {open && (
        <div className="aleph-ai-panel fixed bottom-[calc(env(safe-area-inset-bottom,0px)+5.4rem)] right-[calc(env(safe-area-inset-right,0px)+0.75rem)] sm:bottom-20 sm:right-[calc(env(safe-area-inset-right,0px)+1.5rem)] z-[1001] w-[min(430px,calc(100vw-1.5rem-env(safe-area-inset-left,0px)-env(safe-area-inset-right,0px)))] max-h-[calc(100dvh-env(safe-area-inset-top,0px)-env(safe-area-inset-bottom,0px)-6.5rem)] animate-in slide-in-from-bottom-4 fade-in duration-200 drop-shadow-2xl">
          <AIInsightsPanel />
        </div>
      )}

      {/* Floating Bubble - fixed to bottom-right, above mobile nav */}
      <Button
        onClick={() => setOpen(!open)}
        size="icon"
        aria-label={open ? "Close Aleph AI" : "Open Aleph AI"}
        title={open ? "Close Aleph AI" : "Open Aleph AI"}
        className={cn(
          "aleph-ai-bubble fixed z-[1002] h-12 w-12 rounded-full shadow-xl transition-all duration-200 ring-4 ring-background/70",
          "bottom-[calc(env(safe-area-inset-bottom,0px)+4.35rem)] right-[calc(env(safe-area-inset-right,0px)+0.85rem)]",
          "sm:bottom-[calc(env(safe-area-inset-bottom,0px)+1.5rem)] sm:right-[calc(env(safe-area-inset-right,0px)+1.5rem)] sm:h-14 sm:w-14",
          open && "bg-muted text-muted-foreground hover:bg-muted/80"
        )}
      >
        {open ? <X className="h-5 w-5" /> : <span className="relative"><Bot className="h-5 w-5 sm:h-6 sm:w-6" /><Sparkles className="absolute -right-2 -top-2 h-3 w-3" /></span>}
      </Button>
    </>
  ), document.body);
}
