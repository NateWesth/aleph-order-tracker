import { useEffect, useState } from "react";
import { FileText, Check } from "lucide-react";
import { cn } from "@/lib/utils";

interface ExportProgressProps {
  isExporting: boolean;
  label?: string;
  onComplete?: () => void;
}

export default function ExportProgress({ isExporting, label = "Generating report…", onComplete }: ExportProgressProps) {
  const [progress, setProgress] = useState(0);
  const [phase, setPhase] = useState<"idle" | "running" | "done">("idle");

  useEffect(() => {
    if (isExporting && phase === "idle") {
      setPhase("running");
      setProgress(0);
    }
    if (!isExporting && phase === "running") {
      setProgress(100);
      setPhase("done");
      const timer = setTimeout(() => {
        setPhase("idle");
        setProgress(0);
        onComplete?.();
      }, 1200);
      return () => clearTimeout(timer);
    }
  }, [isExporting, phase, onComplete]);

  // Simulate progress while exporting
  useEffect(() => {
    if (phase !== "running") return;
    const interval = setInterval(() => {
      setProgress((p) => {
        if (p >= 90) return p; // Hold at 90 until done
        return p + Math.random() * 15;
      });
    }, 200);
    return () => clearInterval(interval);
  }, [phase]);

  if (phase === "idle") return null;

  return (
    <div className="fixed bottom-20 sm:bottom-6 right-4 sm:right-6 z-50 animate-scale-in">
      <div className="glass-card glow-border rounded-xl p-4 shadow-glow-lg min-w-[240px]">
        <div className="flex items-center gap-3 mb-2">
          {phase === "done" ? (
            <div className="h-8 w-8 rounded-full bg-emerald-500/20 flex items-center justify-center">
              <Check className="h-4 w-4 text-emerald-500" />
            </div>
          ) : (
            <div className="h-8 w-8 rounded-full bg-primary/20 flex items-center justify-center animate-pulse">
              <FileText className="h-4 w-4 text-primary" />
            </div>
          )}
          <div>
            <p className="text-sm font-medium text-foreground">
              {phase === "done" ? "Export complete!" : label}
            </p>
            <p className="text-xs text-muted-foreground">
              {phase === "done" ? "File is ready" : `${Math.round(progress)}%`}
            </p>
          </div>
        </div>
        {/* Progress bar */}
        <div className="h-1.5 bg-muted rounded-full overflow-hidden">
          <div
            className={cn(
              "h-full rounded-full transition-all duration-300",
              phase === "done" ? "bg-emerald-500" : "bg-primary"
            )}
            style={{ width: `${Math.min(progress, 100)}%` }}
          />
        </div>
      </div>
    </div>
  );
}
