import { useCallback, useEffect, useMemo, useState } from "react";
import { MessageCircle, Send, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";

interface OrderItemComment {
  id: string;
  order_item_id: string;
  user_id: string;
  body: string;
  created_at: string;
  author?: {
    id: string;
    full_name: string | null;
  } | null;
}

interface OrderItemCommentsProps {
  orderItemId: string;
  className?: string;
}

function formatCommentTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("en-ZA", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function OrderItemComments({ orderItemId, className }: OrderItemCommentsProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [comments, setComments] = useState<OrderItemComment[]>([]);
  const [commentCount, setCommentCount] = useState(0);
  const [open, setOpen] = useState(false);
  const [body, setBody] = useState("");
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);

  const fetchComments = useCallback(async () => {
    if (!orderItemId) return;

    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("order_item_comments")
        .select("*, author:profiles(id, full_name)")
        .eq("order_item_id", orderItemId)
        .order("created_at", { ascending: true });

      if (error) throw error;
      setComments((data || []) as unknown as OrderItemComment[]);
      setCommentCount(data?.length || 0);
    } catch (error) {
      console.error("Error loading item comments:", error);
      toast({ title: "Comments could not load", description: "Please check your connection and try again.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [orderItemId, toast]);

  // A lightweight count keeps the important note indicator visible before the
  // popover opens, without loading full messages or opening realtime sockets.
  useEffect(() => {
    let active = true;
    void supabase
      .from("order_item_comments")
      .select("id", { count: "exact", head: true })
      .eq("order_item_id", orderItemId)
      .then(({ count, error }) => {
        if (active && !error) setCommentCount(count || 0);
      });
    return () => { active = false; };
  }, [orderItemId]);

  useEffect(() => {
    // Do not create a query and realtime socket for every row on the order board.
    // Comments become live only while their popover is open.
    if (!open || !orderItemId) return;
    fetchComments();

    const channel = supabase
      .channel(`order-item-comments-${orderItemId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "order_item_comments",
          filter: `order_item_id=eq.${orderItemId}`,
        },
        () => fetchComments(),
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [open, orderItemId, fetchComments]);

  const commentCountLabel = useMemo(
    () => `${commentCount} comment${commentCount === 1 ? "" : "s"}`,
    [commentCount],
  );

  const handleSend = async () => {
    const trimmed = body.trim();
    if (!trimmed || !user?.id || sending) return;

    setSending(true);
    const optimisticId = `optimistic-${Date.now()}`;
    const optimistic: OrderItemComment = {
      id: optimisticId,
      order_item_id: orderItemId,
      user_id: user.id,
      body: trimmed,
      created_at: new Date().toISOString(),
      author: { id: user.id, full_name: user.user_metadata?.full_name || null },
    };
    setComments(previous => [...previous, optimistic]);
    setCommentCount(previous => previous + 1);
    setBody("");
    try {
      const { error } = await supabase.from("order_item_comments").insert({
        order_item_id: orderItemId,
        user_id: user.id,
        body: trimmed,
      });

      if (error) throw error;
      setOpen(true);
      await fetchComments();
    } catch (error) {
      console.error("Error adding item comment:", error);
      setComments(previous => previous.filter(comment => comment.id !== optimisticId));
      setCommentCount(previous => Math.max(0, previous - 1));
      setBody(trimmed);
      toast({ title: "Comment not sent", description: "Your message was restored. Check your connection and try again.", variant: "destructive" });
    } finally {
      setSending(false);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          onClick={(event) => event.stopPropagation()}
          className={cn(
            "relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
            "text-muted-foreground transition-all duration-200",
            "hover:bg-primary/10 hover:text-primary hover:scale-105",
            commentCount > 0 && "text-blue-500 bg-blue-500/10 shadow-[0_0_18px_rgba(59,130,246,0.18)]",
            className,
          )}
          aria-label={`${commentCountLabel} for this item`}
          title={commentCountLabel}
        >
          <MessageCircle className="h-4 w-4" />
          {commentCount > 0 && (
            <span
              className="absolute right-0.5 top-0.5 h-2.5 w-2.5 rounded-full bg-blue-500 ring-2 ring-background animate-pulse shadow-[0_0_10px_rgba(59,130,246,0.95)]"
              aria-hidden="true"
            />
          )}
          {commentCount > 0 && (
            <span className="absolute -right-1 -top-1 min-w-4 rounded-full bg-blue-500 px-1 text-[8px] font-bold leading-4 text-white shadow-[0_0_10px_rgba(59,130,246,0.55)]">
              {commentCount > 9 ? "9+" : commentCount}
            </span>
          )}
        </button>
      </PopoverTrigger>

      <PopoverContent
        align="end"
        side="left"
        sideOffset={8}
        className="w-[min(360px,calc(100vw-24px))] rounded-2xl p-0 overflow-hidden"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="border-b border-border/60 bg-primary/5 px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold text-foreground">Item comments</p>
              <p className="text-[10px] text-muted-foreground">
                Shared with everyone who can access this order
              </p>
            </div>
            {commentCount > 0 && (
              <span className="rounded-full bg-primary/10 px-2 py-1 text-[10px] font-semibold text-primary">
                {commentCount}
              </span>
            )}
          </div>
        </div>

        <div className="max-h-64 overflow-y-auto p-3 space-y-2">
          {loading && comments.length === 0 ? (
            <div className="flex items-center justify-center py-6 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
            </div>
          ) : comments.length === 0 ? (
            <div className="rounded-xl bg-muted/40 px-3 py-5 text-center">
              <MessageCircle className="mx-auto mb-2 h-5 w-5 text-muted-foreground/50" />
              <p className="text-xs font-medium text-foreground">No comments yet</p>
              <p className="mt-0.5 text-[10px] text-muted-foreground">
                Add a note for the team.
              </p>
            </div>
          ) : (
            comments.map((comment) => (
              <div key={comment.id} className="rounded-xl bg-muted/45 px-3 py-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] font-semibold text-foreground">
                    {comment.author?.full_name || (comment.user_id === user?.id ? "You" : "Team member")}
                  </span>
                  <span className="text-[9px] text-muted-foreground">
                    {formatCommentTime(comment.created_at)}
                  </span>
                </div>
                <p className="mt-1 whitespace-pre-wrap break-words text-xs text-foreground/90">
                  {comment.body}
                </p>
              </div>
            ))
          )}
        </div>

        <div className="border-t border-border/60 p-3">
          <div className="flex items-end gap-2">
            <Textarea
              value={body}
              onChange={(event) => setBody(event.target.value)}
              onKeyDown={(event) => {
                if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
                  event.preventDefault();
                  handleSend();
                }
              }}
              placeholder="Add a comment..."
              className="min-h-[68px] resize-none rounded-xl text-xs"
              maxLength={1000}
              disabled={!user || sending}
            />
            <Button
              type="button"
              size="icon"
              className="h-9 w-9 shrink-0 rounded-xl"
              onClick={handleSend}
              disabled={!body.trim() || !user || sending}
              aria-label="Send comment"
            >
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          </div>
          <p className="mt-1.5 text-[9px] text-muted-foreground">Ctrl/Cmd + Enter to send</p>
        </div>
      </PopoverContent>
    </Popover>
  );
}
