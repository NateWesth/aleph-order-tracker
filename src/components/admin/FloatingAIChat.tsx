import { useEffect, useState } from "react";
import { Bot, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import AIInsightsPanel from "./AIInsightsPanel";

export default function FloatingAIChat() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const toggle = () => setOpen(value => !value);
    window.addEventListener("aleph:toggle-ai", toggle);
    return () => window.removeEventListener("aleph:toggle-ai", toggle);
  }, []);

  return (
    <>
      {/* Chat Panel */}
      {open && (
        <div className="fixed bottom-[calc(env(safe-area-inset-bottom,0px)+8rem)] right-3 sm:bottom-20 sm:right-6 z-[80] w-[min(430px,calc(100vw-1.5rem))] animate-in slide-in-from-bottom-4 fade-in duration-200 drop-shadow-2xl">
          <AIInsightsPanel />
        </div>
      )}

      {/* Floating Bubble - fixed to bottom-right, above mobile nav */}
      <Button
        onClick={() => setOpen(!open)}
        size="icon"
        className={cn(
          "fixed z-[70] h-12 w-12 rounded-full shadow-xl transition-all duration-200 ring-4 ring-background/70",
          "bottom-[calc(env(safe-area-inset-bottom,0px)+4.5rem)] right-4",
          "sm:bottom-6 sm:right-6 sm:h-14 sm:w-14",
          open && "bg-muted text-muted-foreground hover:bg-muted/80"
        )}
      >
        {open ? <X className="h-5 w-5" /> : <span className="relative"><Bot className="h-5 w-5 sm:h-6 sm:w-6" /><Sparkles className="absolute -right-2 -top-2 h-3 w-3" /></span>}
      </Button>
    </>
  );
}
