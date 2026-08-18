import { useEffect, useState } from "react";
import { MessageCircle, Send, Loader2 } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

interface ItemComment {
  id: string;
  content: string;
  author_name: string;
  author_id: string;
  created_at: string;
}

interface ItemCommentButtonProps {
  orderItemId: string;
  orderId: string;
  itemName: string;
  className?: string;
}

export default function ItemCommentButton({ orderItemId, orderId, itemName, className }: ItemCommentButtonProps) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [count, setCount] = useState(0);
  const [comments, setComments] = useState<ItemComment[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);

  // Lightweight count on mount so the dot indicator shows without opening the popover
  useEffect(() => {
    let cancelled = false;
    supabase
      .from("order_item_comments")
      .select("id", { count: "exact", head: true })
      .eq("order_item_id", orderItemId)
      .then(({ count: c }) => {
        if (!cancelled) setCount(c ?? 0);
      });
    return () => {
      cancelled = true;
    };
  }, [orderItemId]);

  // Live updates - anyone commenting on this item shows up for everyone else
  // looking at this order right now, and the dot lights up without a refresh.
  useEffect(() => {
    const channel = supabase
      .channel(`item-comments-${orderItemId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "order_item_comments", filter: `order_item_id=eq.${orderItemId}` },
        (payload) => {
          const row = payload.new as ItemComment;
          setCount((c) => c + 1);
          setComments((prev) => (prev.some((c) => c.id === row.id) ? prev : [...prev, row]));
        }
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "order_item_comments", filter: `order_item_id=eq.${orderItemId}` },
        (payload) => {
          const oldRow = payload.old as { id: string };
          setCount((c) => Math.max(0, c - 1));
          setComments((prev) => prev.filter((c) => c.id !== oldRow.id));
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [orderItemId]);

  const loadComments = async () => {
    if (loaded) return;
    const { data } = await supabase
      .from("order_item_comments")
      .select("id, content, author_name, author_id, created_at")
      .eq("order_item_id", orderItemId)
      .order("created_at", { ascending: true });
    setComments(data ?? []);
    setLoaded(true);
  };

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (next) loadComments();
  };

  const handleSend = async () => {
    const content = draft.trim();
    if (!content || !user) return;
    setSending(true);

    let authorName = user.email ?? "Someone";
    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name")
      .eq("id", user.id)
      .maybeSingle();
    if (profile?.full_name) authorName = profile.full_name;

    const { error } = await supabase.from("order_item_comments").insert({
      order_item_id: orderItemId,
      user_id: user.id,
      body: content,
    });


    setSending(false);
    if (!error) {
      setDraft("");
      // Own insert also arrives via the realtime subscription above, but add
      // it immediately for a snappy feel rather than waiting on the round trip.
      setComments((prev) => [
        ...prev,
        { id: crypto.randomUUID(), content, author_name: authorName, author_id: user.id, created_at: new Date().toISOString() },
      ]);
      setCount((c) => c + 1);
    }
  };

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <button
          type="button"
          onClick={(e) => e.stopPropagation()}
          className={cn(
            "relative flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-muted-foreground/60 transition-all hover:bg-primary/10 hover:text-primary",
            className
          )}
          aria-label={count > 0 ? `${count} comment${count === 1 ? "" : "s"} on ${itemName}` : `Add a comment on ${itemName}`}
        >
          <MessageCircle className="h-3.5 w-3.5" />
          {count > 0 && (
            <span className="absolute -top-0.5 -right-0.5 flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-info opacity-75" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-info ring-2 ring-background" />
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="start" onClick={(e) => e.stopPropagation()}>
        <div className="border-b border-border px-3.5 py-2.5">
          <p className="text-xs font-semibold text-foreground truncate">{itemName}</p>
          <p className="text-[10px] text-muted-foreground">{count} comment{count === 1 ? "" : "s"}</p>
        </div>

        <div className="max-h-64 overflow-y-auto px-3.5 py-2 space-y-3">
          {!loaded ? (
            <div className="flex items-center justify-center py-6 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
            </div>
          ) : comments.length === 0 ? (
            <p className="py-4 text-center text-xs text-muted-foreground">No comments yet - be the first to leave one.</p>
          ) : (
            comments.map((c) => (
              <div key={c.id} className="text-sm">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-xs font-semibold text-foreground">{c.author_name}</span>
                  <span className="text-[10px] text-muted-foreground shrink-0">
                    {formatDistanceToNow(new Date(c.created_at), { addSuffix: true })}
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground break-words">{c.content}</p>
              </div>
            ))
          )}
        </div>

        <div className="flex items-end gap-2 border-t border-border p-2.5">
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder="Add a comment..."
            className="min-h-[36px] h-9 resize-none text-xs py-2"
          />
          <Button size="icon" className="h-9 w-9 shrink-0" onClick={handleSend} disabled={sending || !draft.trim()}>
            {sending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
