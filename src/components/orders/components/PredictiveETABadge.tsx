import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Sparkles, Clock } from "lucide-react";
import { usePredictiveETA, predictETA } from "@/hooks/usePredictiveETA";
import { cn } from "@/lib/utils";

interface Props {
  companyId: string | null | undefined;
  urgency: string | null | undefined;
  createdAt: string;
  completed?: boolean;
  compact?: boolean;
}

export default function PredictiveETABadge({ companyId, urgency, createdAt, completed, compact }: Props) {
  const { stats } = usePredictiveETA();
  if (completed) return null;
  const eta = predictETA(stats, companyId, urgency, createdAt);
  if (!eta) return null;

  const overdue = eta.daysRemaining < 0;
  const urgent = eta.daysRemaining >= 0 && eta.daysRemaining <= 1;

  const colorClass = overdue
    ? "bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300"
    : urgent
      ? "bg-orange-100 dark:bg-orange-900/40 text-orange-700 dark:text-orange-300"
      : "bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300";

  const label = overdue
    ? `${Math.abs(eta.daysRemaining)}d over`
    : eta.daysRemaining === 0
      ? "today"
      : `${eta.daysRemaining}d`;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className={cn("inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium cursor-help", colorClass, compact && "text-[9px] px-1")}>
            <Sparkles className="h-2.5 w-2.5" />
            <span>ETA {label}</span>
          </div>
        </TooltipTrigger>
        <TooltipContent className="max-w-xs">
          <div className="space-y-1 text-xs">
            <p className="font-medium flex items-center gap-1">
              <Clock className="h-3 w-3" /> Predicted completion
            </p>
            <p>
              {eta.etaDate.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
            </p>
            <p className="text-muted-foreground">
              Based on historical {urgency || "normal"} orders ({eta.confidence} confidence)
            </p>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
