import { useCallback, useEffect, useMemo, useState } from "react";
import { MessageCircle, Send, Loader2, X, CornerUpLeft, SmilePlus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import EmojiPicker, { QUICK_REACTIONS } from "./EmojiPicker";

interface OrderItemComment {
  id: string;
  order_item_id: string;
  user_id: string;
  body: string;
  created_at: string;
  reply_to_id: string | null;
  author?: {
    id: string;
    full_name: string | null;
  } | null;
}

interface ReactionRow {
  id: string;
  comment_id: string;
  user_id: string;
  emoji: string;
}

interface OrderItemCommentsProps {
  orderItemId: string;
  className?: string;
  initialCount?: number;
  onCountChange?: (count: number) => void;
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

export default function OrderItemComments({ orderItemId, className, initialCount, onCountChange }: OrderItemCommentsProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [comments, setComments] = useState<OrderItemComment[]>([]);
  const [reactions, setReactions] = useState<ReactionRow[]>([]);
  const [commentCount, setCommentCount] = useState(initialCount || 0);
  const [open, setOpen] = useState(false);
  const [body, setBody] = useState("");
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [replyTo, setReplyTo] = useState<OrderItemComment | null>(null);

  const fetchComments = useCallback(async () => {
    if (!orderItemId) return;

    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("order_item_comments")
        .select("id, order_item_id, user_id, body, created_at, reply_to_id")
        .eq("order_item_id", orderItemId)
        .order("created_at", { ascending: true });

      if (error) throw error;
      const rows = data || [];
      const userIds = [...new Set(rows.map((comment) => comment.user_id))];
      const { data: profiles, error: profilesError } = userIds.length
        ? await supabase.from("profiles").select("id, full_name").in("id", userIds)
        : { data: [], error: null };
      if (profilesError) console.warn("Comment authors could not load:", profilesError);
      const authorMap = new Map((profiles || []).map((profile) => [profile.id, profile]));
      const enriched = rows.map((comment) => ({
        ...comment,
        author: authorMap.get(comment.user_id) || null,
      }));
      setComments(enriched as OrderItemComment[]);
      const nextCount = rows.length;
      setCommentCount(nextCount);
      onCountChange?.(nextCount);

      const ids = rows.map((c) => c.id);
      if (ids.length) {
        const { data: reactionRows, error: reactionError } = await supabase
          .from("order_item_comment_reactions")
          .select("id, comment_id, user_id, emoji")
          .in("comment_id", ids);
        if (!reactionError) setReactions(reactionRows || []);
      } else {
        setReactions([]);
      }
    } catch (error) {
      console.error("Error loading item comments:", error);
      toast({ title: "Comments could not load", description: "Please check your connection and try again.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [orderItemId, onCountChange, toast]);

  // A lightweight count keeps the important note indicator visible before the
  // popover opens, without loading full messages or opening realtime sockets.
  useEffect(() => {
    if (typeof initialCount === "number") {
      setCommentCount(initialCount);
      return;
    }
    let active = true;
    void supabase
      .from("order_item_comments")
      .select("id", { count: "exact", head: true })
      .eq("order_item_id", orderItemId)
      .then(({ count, error }) => {
        if (active && !error) {
          setCommentCount(count || 0);
          onCountChange?.(count || 0);
        }
      });
    return () => { active = false; };
  }, [initialCount, onCountChange, orderItemId]);

  useEffect(() => {
    // Do not create a query and realtime socket for every row on the order board.
    // Comments become live only while their popover is open.
    if (!open || !orderItemId) return;
    fetchComments();

    const channel = supabase
      .channel(`order-item-comments-${orderItemId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "order_item_comments", filter: `order_item_id=eq.${orderItemId}` },
        () => fetchComments(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "order_item_comment_reactions" },
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

  const commentById = useMemo(() => {
    const map = new Map<string, OrderItemComment>();
    comments.forEach((c) => map.set(c.id, c));
    return map;
  }, [comments]);

  const nameFor = (c: OrderItemComment) => {
    if (c.user_id === user?.id) return "You";
    return c.author?.full_name || "Team member";
  };

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
      reply_to_id: replyTo?.id ?? null,
      author: { id: user.id, full_name: user.user_metadata?.full_name || null },
    };
    setComments(previous => [...previous, optimistic]);
    setCommentCount(previous => {
      const nextCount = previous + 1;
      onCountChange?.(nextCount);
      return nextCount;
    });
    setBody("");
    const wasReplyingTo = replyTo;
    setReplyTo(null);
    try {
      const { error } = await supabase.from("order_item_comments").insert({
        order_item_id: orderItemId,
        user_id: user.id,
        body: trimmed,
        reply_to_id: wasReplyingTo?.id ?? null,
      });

      if (error) throw error;
      setOpen(true);
      await fetchComments();
    } catch (error) {
      console.error("Error adding item comment:", error);
      setComments(previous => previous.filter(comment => comment.id !== optimisticId));
      setCommentCount(previous => {
        const nextCount = Math.max(0, previous - 1);
        onCountChange?.(nextCount);
        return nextCount;
      });
      setBody(trimmed);
      setReplyTo(wasReplyingTo);
      toast({ title: "Comment not sent", description: "Your message was restored. Check your connection and try again.", variant: "destructive" });
    } finally {
      setSending(false);
    }
  };

  const toggleReaction = async (commentId: string, emoji: string) => {
    if (!user) return;
    const existing = reactions.find((r) => r.comment_id === commentId && r.user_id === user.id && r.emoji === emoji);
    if (existing) {
      setReactions((prev) => prev.filter((r) => r.id !== existing.id));
      await supabase.from("order_item_comment_reactions").delete().eq("id", existing.id);
    } else {
      const tempId = `optimistic-${Date.now()}`;
      setReactions((prev) => [...prev, { id: tempId, comment_id: commentId, user_id: user.id, emoji }]);
      const { data, error } = await supabase
        .from("order_item_comment_reactions")
        .insert({ comment_id: commentId, user_id: user.id, emoji })
        .select("id")
        .maybeSingle();
      if (error) {
        setReactions((prev) => prev.filter((r) => r.id !== tempId));
      } else if (data?.id) {
        setReactions((prev) => prev.map((r) => (r.id === tempId ? { ...r, id: data.id } : r)));
      }
    }
  };

  const reactionSummary = (commentId: string) => {
    const forComment = reactions.filter((r) => r.comment_id === commentId);
    const byEmoji = new Map<string, string[]>();
    for (const r of forComment) byEmoji.set(r.emoji, [...(byEmoji.get(r.emoji) || []), r.user_id]);
    return [...byEmoji.entries()].map(([emoji, userIds]) => ({
      emoji,
      count: userIds.length,
      mine: !!user && userIds.includes(user.id),
    }));
  };

  return (
    <Popover open={open} onOpenChange={(next) => { setOpen(next); if (!next) setReplyTo(null); }}>
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
        className="w-[min(380px,calc(100vw-24px))] rounded-2xl p-0 overflow-hidden"
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

        <div className="max-h-72 overflow-y-auto p-3 space-y-2.5 bg-muted/10">
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
            comments.map((comment) => {
              const mine = comment.user_id === user?.id;
              const parent = comment.reply_to_id ? commentById.get(comment.reply_to_id) : null;
              const summary = reactionSummary(comment.id);
              return (
                <div key={comment.id} className={cn("group flex flex-col", mine ? "items-end" : "items-start")}>
                  <div
                    className={cn(
                      "max-w-[85%] rounded-2xl px-3 py-2 text-xs break-words shadow-sm",
                      mine
                        ? "bg-primary text-primary-foreground rounded-tr-sm"
                        : "bg-card border border-border/70 text-foreground rounded-tl-sm"
                    )}
                  >
                    {!mine && (
                      <div className="text-[10px] font-semibold text-primary mb-0.5">{nameFor(comment)}</div>
                    )}
                    {parent && (
                      <div
                        className={cn(
                          "mb-1.5 rounded-lg border-l-2 px-2 py-1 text-[10px] opacity-80",
                          mine ? "border-primary-foreground/50 bg-black/10" : "border-primary/50 bg-primary/5"
                        )}
                      >
                        <div className="font-semibold">{nameFor(parent)}</div>
                        <div className="line-clamp-2">{parent.body}</div>
                      </div>
                    )}
                    <p className="whitespace-pre-wrap break-words">{comment.body}</p>
                  </div>

                  {summary.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {summary.map((s) => (
                        <button
                          key={s.emoji}
                          onClick={() => toggleReaction(comment.id, s.emoji)}
                          className={cn(
                            "flex items-center gap-0.5 rounded-full border px-1.5 py-0.5 text-[10px] transition-colors",
                            s.mine ? "border-primary/40 bg-primary/10 text-primary" : "border-border bg-muted text-muted-foreground hover:bg-muted/70"
                          )}
                        >
                          <span>{s.emoji}</span>
                          <span className="font-medium">{s.count}</span>
                        </button>
                      ))}
                    </div>
                  )}

                  <div className="flex items-center gap-2 mt-0.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                    <span className="text-[9px] text-muted-foreground">{formatCommentTime(comment.created_at)}</span>
                    <button
                      onClick={() => setReplyTo(comment)}
                      className="text-[9px] text-muted-foreground hover:text-primary flex items-center gap-0.5"
                    >
                      <CornerUpLeft className="h-2.5 w-2.5" />Reply
                    </button>
                    <EmojiPicker
                      onSelect={(emoji) => toggleReaction(comment.id, emoji)}
                      trigger={
                        <button className="text-muted-foreground hover:text-primary">
                          <SmilePlus className="h-2.5 w-2.5" />
                        </button>
                      }
                    />
                    <div className="flex gap-0.5">
                      {QUICK_REACTIONS.slice(0, 3).map((emoji) => (
                        <button
                          key={emoji}
                          onClick={() => toggleReaction(comment.id, emoji)}
                          className="text-[10px] hover:scale-125 transition-transform"
                        >
                          {emoji}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        <div className="border-t border-border/60">
          {replyTo && (
            <div className="flex items-center justify-between gap-2 px-3 py-1.5 bg-primary/5 border-b border-border/60">
              <div className="min-w-0 text-[10px]">
                <span className="font-semibold text-primary">Replying to {nameFor(replyTo)}: </span>
                <span className="text-muted-foreground line-clamp-1">{replyTo.body}</span>
              </div>
              <button onClick={() => setReplyTo(null)} className="shrink-0 text-muted-foreground hover:text-destructive">
                <X className="h-3 w-3" />
              </button>
            </div>
          )}
          <div className="p-3">
            <div className="flex items-end gap-2">
              <EmojiPicker
                onSelect={(emoji) => setBody((prev) => prev + emoji)}
                trigger={
                  <Button type="button" size="icon" variant="ghost" className="h-9 w-9 shrink-0 rounded-xl text-muted-foreground">
                    <SmilePlus className="h-4 w-4" />
                  </Button>
                }
              />
              <Textarea
                value={body}
                onChange={(event) => setBody(event.target.value)}
                onKeyDown={(event) => {
                  if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
                    event.preventDefault();
                    handleSend();
                  }
                }}
                placeholder={replyTo ? "Reply..." : "Add a comment..."}
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
        </div>
      </PopoverContent>
    </Popover>
  );
}
