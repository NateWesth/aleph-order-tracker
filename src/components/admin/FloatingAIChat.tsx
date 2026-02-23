import { useState } from "react";
import { Bot, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import AIInsightsPanel from "./AIInsightsPanel";

export default function FloatingAIChat() {
  const [open, setOpen] = useState(false);

  return (
    <>
      {/* Chat Panel */}
      {open && (
        <div className="fixed bottom-20 right-4 z-50 w-[min(400px,calc(100vw-2rem))] animate-in slide-in-from-bottom-4 fade-in duration-200">
          <AIInsightsPanel />
        </div>
      )}

      {/* Floating Bubble */}
      <Button
        onClick={() => setOpen(!open)}
        size="icon"
        className={cn(
          "fixed bottom-4 right-4 z-50 h-12 w-12 rounded-full shadow-lg transition-all duration-200",
          "sm:bottom-6 sm:right-6 sm:h-14 sm:w-14",
          open && "bg-muted text-muted-foreground hover:bg-muted/80"
        )}
      >
        {open ? <X className="h-5 w-5" /> : <Bot className="h-5 w-5 sm:h-6 sm:w-6" />}
      </Button>
    </>
  );
}
