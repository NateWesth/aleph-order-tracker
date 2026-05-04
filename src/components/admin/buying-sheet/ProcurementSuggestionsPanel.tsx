import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Sparkles, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface ProcurementItem {
  sku: string;
  name?: string;
  supplier?: string;
  stock?: number;
  toOrder?: number;
  monthlyDemand?: number;
  daysToZero?: number;
  abcClass?: string;
}

interface Props {
  items: ProcurementItem[];
}

export default function ProcurementSuggestionsPanel({ items }: Props) {
  const [suggestion, setSuggestion] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const fetchSuggestion = async () => {
    setLoading(true);
    setSuggestion(null);
    try {
      const { data, error } = await supabase.functions.invoke("procurement-suggestions", {
        body: { items: items.slice(0, 80) },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setSuggestion(data?.suggestion || "No suggestion returned.");
    } catch (e: any) {
      console.error(e);
      toast({
        title: "AI Suggestion Failed",
        description: e.message || "Could not generate procurement suggestions.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="border-violet-500/30 bg-gradient-to-br from-violet-500/5 to-transparent">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-violet-500/10">
              <Sparkles className="h-4 w-4 text-violet-500" />
            </div>
            <div>
              <p className="text-sm font-semibold">AI Procurement Suggestions</p>
              <p className="text-xs text-muted-foreground">
                Get smart restock priorities for {items.length} items
              </p>
            </div>
          </div>
          <Button size="sm" onClick={fetchSuggestion} disabled={loading || items.length === 0}>
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <Sparkles className="h-3.5 w-3.5 mr-1.5" />}
            {suggestion ? "Regenerate" : "Get Suggestions"}
          </Button>
        </div>
        {suggestion && (
          <div className="text-xs leading-relaxed whitespace-pre-wrap bg-background/60 backdrop-blur rounded-lg p-3 border border-border/50">
            {suggestion}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
